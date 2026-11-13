import { createClient, type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";
import {
  cleanOfferTemplateDirectives,
  extractCustomOfferVariables,
  formatPlainTextAsRichHtml,
} from "@/lib/offer-template-utils";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
 * POST /api/offer-templates/ai-edit
 * Sends the current offer template + recruiter instruction to n8n (OpenAI)
 * and returns the updated text, HTML, and extracted variables.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, token } = await authenticateRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      template_id?: string;
      raw_text?: string;
      html_content?: string;
      instruction?: string;
    } | null;

    const instruction = body?.instruction?.trim();
    const rawText = body?.raw_text?.trim() || "";
    const htmlContent = body?.html_content?.trim() || "";

    if (!instruction) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }
    if (!rawText && !htmlContent) {
      return NextResponse.json({ error: "raw_text or html_content is required" }, { status: 400 });
    }

    const { response, payload } = await callN8nGateway("hiring/offer-template-edit", token, {
      template_id: body?.template_id || null,
      raw_text: rawText,
      html_content: htmlContent,
      instruction,
      recruiter_id: user.id,
      recruiter_email: user.email,
    });

    if (!response.ok) {
      const errObj = (payload && typeof payload === "object" ? payload : {}) as Record<
        string,
        unknown
      >;
      return NextResponse.json(
        {
          error:
            (typeof errObj.error === "string" && errObj.error) ||
            (typeof errObj.message === "string" && errObj.message) ||
            `n8n AI template editor returned HTTP ${response.status}. Make sure workflow "8 - Offer AI Generation & Email Dispatch" is imported and active.`,
        },
        { status: response.status >= 400 ? response.status : 502 },
      );
    }

    const resObj = (payload && typeof payload === "object" ? payload : {}) as Record<
      string,
      unknown
    >;
    const updatedText =
      typeof resObj.updated_text === "string" && resObj.updated_text.trim()
        ? cleanOfferTemplateDirectives(resObj.updated_text.trim())
        : cleanOfferTemplateDirectives(rawText);
    const updatedHtml =
      typeof resObj.updated_html === "string" && resObj.updated_html.trim()
        ? cleanOfferTemplateDirectives(resObj.updated_html.trim())
        : formatPlainTextAsRichHtml(updatedText);

    const variables = extractCustomOfferVariables(`${updatedText}\n${updatedHtml}`);

    return NextResponse.json({
      success: true,
      updated_text: updatedText,
      updated_html: updatedHtml,
      variables,
    });
  } catch (err) {
    console.error("[api/offer-templates/ai-edit POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to edit template with AI" },
      { status: 500 },
    );
  }
}
