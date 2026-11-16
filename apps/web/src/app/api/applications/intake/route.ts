import { applicationIntakeSchema } from "@scalepods/core";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";
import { normalizePhoneNumber } from "@/lib/parse-resume";

export const dynamic = "force-dynamic";

function normalizeCandidateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1) return trimmed;
  const local = trimmed.slice(0, atIndex).replace(/\+.*$/, "");
  const domain = trimmed.slice(atIndex + 1);
  return `${local}@${domain}`;
}

function getAuthClient(authHeader?: string | null) {
  const env = getEnv();
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = applicationIntakeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = getAuthClient(authHeader);
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: campaign, error: campaignError } = await client
      .from("campaigns")
      .select("jd_text")
      .eq("id", parsed.data.campaign_id)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign?.jd_text?.trim()) {
      return NextResponse.json(
        { error: "The campaign job description is unavailable." },
        { status: 400 },
      );
    }

    const normalizedEmail = normalizeCandidateEmail(parsed.data.candidate_email);
    const { data: existingApp, error: existingAppError } = await client
      .from("applications")
      .select("id")
      .eq("campaign_id", parsed.data.campaign_id)
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();

    if (existingAppError) {
      console.warn(
        "[api/applications/intake] Duplicate candidate check warning:",
        existingAppError,
      );
    } else if (existingApp) {
      return NextResponse.json(
        {
          error: "Candidate already added to this campaign",
          message: "Candidate already added to this campaign",
          code: "candidate_already_uploaded",
        },
        { status: 409 },
      );
    }

    const normalizedPhone = parsed.data.candidate_phone
      ? (normalizePhoneNumber(parsed.data.candidate_phone) ?? parsed.data.candidate_phone)
      : parsed.data.candidate_phone;

    const { response, payload } = await callN8nGateway("hiring/application-intake", token, {
      ...parsed.data,
      candidate_phone: normalizedPhone,
      jd_text: campaign.jd_text,
    });
    if (!response.ok) {
      const details =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : { error: "Intake failed" };
      const rawError =
        (typeof details.error === "string" && details.error) ||
        (typeof details.message === "string" && details.message) ||
        "";
      if (
        response.status === 409 ||
        details.code === "candidate_already_uploaded" ||
        /candidate_already_uploaded|already uploaded|already added|23505/i.test(rawError)
      ) {
        return NextResponse.json(
          {
            ...details,
            error: "Candidate already added to this campaign",
            message: "Candidate already added to this campaign",
            code: "candidate_already_uploaded",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(details, { status: response.status });
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    console.error("[api/applications/intake] Error:", err);
    const msg = err instanceof Error ? err.message : "Application intake workflow failed";
    if (/candidate_already_uploaded|already uploaded|already added|23505/i.test(msg)) {
      return NextResponse.json(
        {
          error: "Candidate already added to this campaign",
          message: "Candidate already added to this campaign",
          code: "candidate_already_uploaded",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
