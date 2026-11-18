import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";
import { extractDocumentTextFromDocxBuffer } from "@/lib/offers/prune-docx-xml";
import {
  filterAndValidateSuggestions,
  suggestFieldsWithAnthropic,
  type ValidatedSuggestion,
} from "@/lib/offers/suggest-fields";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function authenticateUser(req: NextRequest): Promise<{ user: User | null; token: string }> {
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
    return { user, token: bearer };
  }

  try {
    const serverClient = await supabaseServer();
    const {
      data: { session },
    } = await serverClient.auth.getSession();
    return { user: session?.user ?? null, token: session?.access_token || "" };
  } catch {
    return { user: null, token: "" };
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
 * POST /api/offer-templates/suggest-fields
 *
 * Suggests dynamic placeholders for finished offer letters.
 * Prioritizes n8n workflow ("hiring/offer-template-parse") which uses the
 * recruiter's predefined credentials in n8n, with fallback to direct Anthropic API.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, token } = await authenticateUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { template_id?: string } | null;
    if (!body?.template_id) {
      return NextResponse.json({ error: "template_id is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify tenant settings
    const { data: accountRow } = await admin
      .from("accounts")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!accountRow) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: tpl, error: tplErr } = await admin
      .from("offer_templates")
      .select("id, account_id, storage_path, file_name, raw_text")
      .eq("id", body.template_id)
      .maybeSingle();

    if (tplErr || !tpl || tpl.account_id !== user.id) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const { data: fileBlob, error: dlErr } = await admin.storage
      .from("offer-templates")
      .download(tpl.storage_path);

    if (dlErr || !fileBlob) {
      return NextResponse.json({ error: "Template file missing from storage" }, { status: 404 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const rawDocText =
      tpl.raw_text && tpl.raw_text !== "[Raw DOCX Template]"
        ? tpl.raw_text
        : await extractDocumentTextFromDocxBuffer(buffer);

    let suggestions: ValidatedSuggestion[] = [];
    let n8nSuccess = false;

    // 1. Primary: Use n8n with predefined Anthropic Claude credentials
    try {
      const { response, payload } = await callN8nGateway("hiring/offer-template-parse", token, {
        raw_text: rawDocText,
        file_name: tpl.file_name || "document.docx",
        recruiter_id: user.id,
        recruiter_email: user.email,
      });

      if (response.ok && payload && typeof payload === "object") {
        const resObj = payload as Record<string, unknown>;
        if (Array.isArray(resObj.variables) && resObj.variables.length > 0) {
          const mapped = resObj.variables
            .map((v) => {
              const obj = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
              const targetVal = String(
                obj.detected_value || obj.original_value || obj.value || "",
              ).trim();
              const fieldKey = String(obj.key || obj.name || "").trim();
              const label = String(obj.label || obj.category || "Detected dynamic field").trim();
              return {
                text: targetVal,
                suggested_field: fieldKey,
                reason: label,
              };
            })
            .filter((s) => s.text && s.suggested_field);

          const validated = filterAndValidateSuggestions({ suggestions: mapped }, rawDocText);
          if (validated.length > 0) {
            suggestions = validated;
            n8nSuccess = true;
          }
        }
      }
    } catch (n8nErr) {
      console.warn(
        "[api/offer-templates/suggest-fields] n8n parser call failed or timed out:",
        n8nErr,
      );
    }

    // 2. Secondary fallback: direct Anthropic API if n8n was unreachable and key is present in env
    if (!n8nSuccess && process.env.ANTHROPIC_API_KEY?.trim()) {
      try {
        suggestions = await suggestFieldsWithAnthropic(buffer);
      } catch (anthropicErr) {
        console.warn(
          "[api/offer-templates/suggest-fields] Direct Anthropic fallback error:",
          anthropicErr,
        );
      }
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error(
      "[api/offer-templates/suggest-fields] Suggestion error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate AI suggestions for this document",
      },
      { status: 500 },
    );
  }
}
