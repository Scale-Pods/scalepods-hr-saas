import crypto from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { detectPlaceholders } from "@/lib/offers/detect-placeholders";
import { fillOfferDocx, OfferDocxError } from "@/lib/offers/fill-docx";
import {
  applyTextReplacementsToDocx,
  type ReplacementInstruction,
  type TextMatchItem,
} from "@/lib/offers/make-reusable";
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
 * POST /api/offer-templates/make-reusable
 * Converts a finished letter into a reusable template with {{placeholders}} by applying
 * run-splitting XML replacements, dry-run testing it, and saving it as a new template.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      source_template_id?: string;
      name?: string;
      replacements?: ReplacementInstruction[];
      target_matches?: Record<string, TextMatchItem[]>;
    } | null;

    if (
      !body?.source_template_id ||
      !Array.isArray(body.replacements) ||
      body.replacements.length === 0 ||
      !body.target_matches
    ) {
      return NextResponse.json(
        { error: "source_template_id, replacements, and target_matches are required" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // 1. Fetch source template
    const { data: sourceTpl, error: tplErr } = await admin
      .from("offer_templates")
      .select("id, account_id, name, file_name, storage_path")
      .eq("id", body.source_template_id)
      .maybeSingle();

    if (tplErr || !sourceTpl || sourceTpl.account_id !== user.id) {
      return NextResponse.json({ error: "Source template not found" }, { status: 404 });
    }

    // 2. Download original raw .docx buffer
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from("offer-templates")
      .download(sourceTpl.storage_path);

    if (dlErr || !fileBlob) {
      return NextResponse.json(
        { error: "Original document file missing from storage" },
        { status: 404 },
      );
    }

    const originalBuffer = Buffer.from(await fileBlob.arrayBuffer());

    // 3. Apply run-splitting replacements across paragraphs in body, headers, footers
    let replacedBuffer: Buffer;
    try {
      replacedBuffer = applyTextReplacementsToDocx(
        originalBuffer,
        body.replacements,
        body.target_matches,
      );
    } catch (replaceErr) {
      return NextResponse.json(
        {
          error: `Failed to replace text in document: ${replaceErr instanceof Error ? replaceErr.message : String(replaceErr)}`,
        },
        { status: 400 },
      );
    }

    // 4. Detect placeholders on the newly constructed template
    const detectedPlaceholders = detectPlaceholders(replacedBuffer);
    if (detectedPlaceholders.length === 0) {
      return NextResponse.json(
        { error: "No placeholders were successfully created from the selected replacements" },
        { status: 400 },
      );
    }

    // 5. Dry-run fill validation
    const dummyData: Record<string, string> = {};
    for (const p of detectedPlaceholders) {
      dummyData[p] = `[${p}]`;
    }

    try {
      fillOfferDocx(replacedBuffer, dummyData);
    } catch (fillErr) {
      const msg = fillErr instanceof OfferDocxError ? fillErr.message : String(fillErr);
      return NextResponse.json(
        { error: `Validation dry-run failed on generated template: ${msg}` },
        { status: 400 },
      );
    }

    // 6. Save new template binary to Supabase Storage
    const safeFileName = sourceTpl.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const newStoragePath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await admin.storage
      .from("offer-templates")
      .upload(newStoragePath, replacedBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadError) {
      console.error("[api/offer-templates/make-reusable] Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to store generated template file" },
        { status: 500 },
      );
    }

    // 7. Insert new template record linked to the source
    const newName = body.name?.trim() || `${sourceTpl.name} (Reusable Template)`;

    const { data: newTemplate, error: insertError } = await admin
      .from("offer_templates")
      .insert({
        account_id: user.id,
        source_template_id: sourceTpl.id,
        name: newName,
        file_name: sourceTpl.file_name,
        storage_path: newStoragePath,
        raw_text: "[Reusable DOCX Template]",
        variables: detectedPlaceholders,
        placeholders: detectedPlaceholders,
        is_finished_letter: false,
        is_default: false,
        created_by: user.id,
      })
      .select(
        "id, name, file_name, storage_path, variables, placeholders, is_finished_letter, source_template_id, created_at",
      )
      .single();

    if (insertError) {
      console.error("[api/offer-templates/make-reusable] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to register reusable template" }, { status: 500 });
    }

    return NextResponse.json({
      template: newTemplate,
      placeholders: detectedPlaceholders,
    });
  } catch (err) {
    console.error("[api/offer-templates/make-reusable]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
