import crypto from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { detectPlaceholders } from "@/lib/offers/detect-placeholders";
import { fillOfferDocx, OfferDocxError } from "@/lib/offers/fill-docx";
import { extractDocumentTextFromDocxBuffer } from "@/lib/offers/prune-docx-xml";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function authenticateUser(req: NextRequest): Promise<User | null> {
  const env = getEnv();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const authClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser(bearer);
    return user;
  }

  try {
    const serverClient = await supabaseServer();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

function getAdminClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * POST /api/offer-templates/upload
 *
 * Accepts a raw .docx file, stores it untouched in Supabase Storage ("offer-templates"),
 * runs placeholder detection, validates it via dry-run fill, and classifies the document.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const customName = (formData.get("name") as string | null)?.trim();
    const isDefault = formData.get("is_default") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      return NextResponse.json(
        { error: "Only Word documents (.docx) are supported. Please upload a .docx file." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload raw untouched .docx to Supabase Storage with per-tenant isolation
    const admin = getAdminClient();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await admin.storage
      .from("offer-templates")
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadError) {
      console.error("[api/offer-templates/upload] Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to store template file" }, { status: 500 });
    }

    // 2. Detect placeholders
    let detectedPlaceholders: string[];
    try {
      detectedPlaceholders = detectPlaceholders(buffer);
    } catch (detectErr) {
      // Clean up uploaded file
      await admin.storage.from("offer-templates").remove([storagePath]);
      return NextResponse.json(
        {
          error: `Corrupted or unreadable .docx template: ${detectErr instanceof Error ? detectErr.message : String(detectErr)}`,
        },
        { status: 400 },
      );
    }

    const templateName = customName || file.name.replace(/\.[^/.]+$/, "");

    // Case A: Placeholders detected -> Dry-run fill validation
    if (detectedPlaceholders.length > 0) {
      const dummyData: Record<string, string> = {};
      for (const p of detectedPlaceholders) {
        dummyData[p] = `[${p}]`;
      }

      try {
        fillOfferDocx(buffer, dummyData);
      } catch (fillErr) {
        // Tag syntax error or malformed template
        await admin.storage.from("offer-templates").remove([storagePath]);
        const msg = fillErr instanceof OfferDocxError ? fillErr.message : String(fillErr);
        return NextResponse.json(
          { error: `Template dry-run validation failed: ${msg}` },
          { status: 400 },
        );
      }

      if (isDefault) {
        await admin
          .from("offer_templates")
          .update({ is_default: false })
          .eq("account_id", user.id)
          .eq("is_default", true);
      }

      let templateRecord: unknown = null;
      let insertError: { message?: string } | null = null;

      const extractedRawText =
        (await extractDocumentTextFromDocxBuffer(buffer)) || "[Raw DOCX Template]";

      const fullTemplatePayload = {
        account_id: user.id,
        name: templateName,
        file_name: file.name,
        storage_path: storagePath,
        raw_text: extractedRawText,
        variables: detectedPlaceholders,
        placeholders: detectedPlaceholders,
        is_finished_letter: false,
        is_default: isDefault,
        created_by: user.id,
      };

      const res1 = await admin
        .from("offer_templates")
        .insert(fullTemplatePayload)
        .select()
        .single();
      if (!res1.error) {
        templateRecord = res1.data;
      } else if (res1.error.code === "PGRST204" || res1.error.message?.includes("column")) {
        // Fallback for pre-0059 database schema cache (uses base 0058 columns)
        const basePayload = {
          account_id: user.id,
          name: templateName,
          file_name: file.name,
          storage_path: storagePath,
          raw_text: extractedRawText,
          variables: detectedPlaceholders,
          is_default: isDefault,
          created_by: user.id,
        };
        const res2 = await admin.from("offer_templates").insert(basePayload).select().single();
        if (res2.error) {
          insertError = res2.error;
        } else {
          templateRecord = {
            ...res2.data,
            placeholders: detectedPlaceholders,
            is_finished_letter: false,
          };
        }
      } else {
        insertError = res1.error;
      }

      if (insertError) {
        console.error("[api/offer-templates/upload] Database insert error:", insertError);
        return NextResponse.json(
          { error: insertError.message || "Failed to register template record" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          template: templateRecord,
          classification: "template",
          placeholders: detectedPlaceholders,
        },
        { status: 201 },
      );
    }

    // Case B: No placeholders detected (Finished letter)
    let letterRecord: unknown = null;
    let letterInsertError: { message?: string } | null = null;

    const fullLetterPayload = {
      account_id: user.id,
      name: templateName,
      file_name: file.name,
      storage_path: storagePath,
      raw_text: "[Finished Letter]",
      variables: [],
      placeholders: [],
      is_finished_letter: true,
      is_default: false,
      created_by: user.id,
    };

    const lRes1 = await admin.from("offer_templates").insert(fullLetterPayload).select().single();
    if (!lRes1.error) {
      letterRecord = lRes1.data;
    } else if (lRes1.error.code === "PGRST204" || lRes1.error.message?.includes("column")) {
      // Fallback for pre-0059 database schema cache (uses base 0058 columns)
      const baseLetterPayload = {
        account_id: user.id,
        name: templateName,
        file_name: file.name,
        storage_path: storagePath,
        raw_text: "[Finished Letter]",
        variables: [],
        is_default: false,
        created_by: user.id,
      };
      const lRes2 = await admin.from("offer_templates").insert(baseLetterPayload).select().single();
      if (lRes2.error) {
        letterInsertError = lRes2.error;
      } else {
        letterRecord = {
          ...lRes2.data,
          placeholders: [],
          is_finished_letter: true,
        };
      }
    } else {
      letterInsertError = lRes1.error;
    }

    if (letterInsertError) {
      console.error(
        "[api/offer-templates/upload] Database letter insert error:",
        letterInsertError,
      );
      return NextResponse.json(
        { error: letterInsertError.message || "Failed to register letter record" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        template: letterRecord,
        classification: "finished_letter",
        placeholders: [],
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/offer-templates/upload] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
