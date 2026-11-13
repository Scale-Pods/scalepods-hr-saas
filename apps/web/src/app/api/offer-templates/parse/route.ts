import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";
import {
  cleanOfferTemplateDirectives,
  extractCustomOfferVariables,
  formatOfferVarLabel,
} from "@/lib/offer-template-utils";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface ExtractedOfferVariable {
  key: string;
  label: string;
  detected_value?: string;
  category?: "candidate" | "compensation" | "dates" | "company" | "terms" | "custom";
}

async function authenticateRequest(
  req: NextRequest,
): Promise<{ user: User | null; token: string }> {
  const env = getEnv();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
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
      data: { user },
    } = await serverClient.auth.getUser();
    if (!user) return { user: null, token: "" };
    const {
      data: { session },
    } = await serverClient.auth.getSession();
    return { user, token: session?.access_token || "" };
  } catch {
    return { user: null, token: "" };
  }
}

/**
 * POST /api/offer-templates/parse
 *
 * Forwards extracted docx text and HTML to n8n (hiring/offer-template-parse)
 * powered by Claude API to:
 * 1. Clean meta-instructions, legend notes, and conditional statements.
 * 2. Convert raw/past offer letters into standardized templates with {{VARIABLE}} tags.
 * 3. Extract dynamic variables with detected/default values.
 *
 * Includes local fallback so development and offline resilience remain 100% operational.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, token } = await authenticateRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      raw_text?: string;
      html_content?: string;
      file_name?: string;
      campaign_context?: {
        position_title?: string;
        salary?: string;
        currency?: string;
        is_intern?: boolean;
      };
    } | null;

    const rawText = body?.raw_text?.trim() || "";
    const htmlContent = body?.html_content?.trim() || "";
    const fileName = body?.file_name?.trim() || "document.docx";
    const campaignContext = body?.campaign_context;

    if (!rawText && !htmlContent) {
      return NextResponse.json(
        { error: "raw_text or html_content is required to parse variables" },
        { status: 400 },
      );
    }

    // Attempt n8n Claude API parsing
    try {
      const { response, payload } = await callN8nGateway("hiring/offer-template-parse", token, {
        raw_text: rawText,
        html_content: htmlContent,
        file_name: fileName,
        campaign_context: campaignContext || {},
        recruiter_id: user.id,
        recruiter_email: user.email,
      });

      if (response.ok && payload && typeof payload === "object") {
        const resObj = payload as Record<string, unknown>;
        const cleanedText = typeof resObj.cleaned_text === "string" ? resObj.cleaned_text : rawText;
        const cleanedHtml =
          typeof resObj.cleaned_html === "string" ? resObj.cleaned_html : htmlContent;

        let variables: ExtractedOfferVariable[] = [];
        if (Array.isArray(resObj.variables)) {
          variables = (resObj.variables as ExtractedOfferVariable[]).map((v) => ({
            key: String(v.key || "")
              .trim()
              .toUpperCase(),
            label: String(v.label || formatOfferVarLabel(String(v.key || ""))),
            detected_value: typeof v.detected_value === "string" ? v.detected_value : undefined,
            category: v.category || "custom",
          }));
        }

        if (variables.length === 0) {
          const fallbackKeys = extractCustomOfferVariables(cleanedHtml || cleanedText);
          variables = fallbackKeys.map((key) => ({
            key,
            label: formatOfferVarLabel(key),
            category: "custom",
          }));
        }

        return NextResponse.json({
          success: true,
          cleaned_text: cleanOfferTemplateDirectives(cleanedText, {
            isIntern: campaignContext?.is_intern,
          }),
          cleaned_html: cleanOfferTemplateDirectives(cleanedHtml, {
            isIntern: campaignContext?.is_intern,
          }),
          variables,
          source: "n8n_claude",
        });
      }
    } catch (n8nErr) {
      console.warn(
        "[api/offer-templates/parse] n8n Claude gateway call failed, using local parser:",
        n8nErr,
      );
    }

    // Local resilient fallback parser
    const cleanedText = cleanOfferTemplateDirectives(rawText, {
      isIntern: campaignContext?.is_intern,
    });
    const cleanedHtml = cleanOfferTemplateDirectives(htmlContent, {
      isIntern: campaignContext?.is_intern,
    });
    const varKeys = extractCustomOfferVariables(cleanedHtml || cleanedText);

    const variables: ExtractedOfferVariable[] = varKeys.map((key) => ({
      key,
      label: formatOfferVarLabel(key),
      category: "custom",
    }));

    return NextResponse.json({
      success: true,
      cleaned_text: cleanedText,
      cleaned_html: cleanedHtml,
      variables,
      source: "local_fallback",
    });
  } catch (err) {
    console.error("[api/offer-templates/parse POST]", err);
    return NextResponse.json(
      { error: "Failed to parse offer template variables" },
      { status: 500 },
    );
  }
}
