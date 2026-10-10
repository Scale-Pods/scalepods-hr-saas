import { applicationIntakeSchema } from "@scalepods/core";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";

export const dynamic = "force-dynamic";

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

    const {
      data: { user },
      error: authError,
    } = await getAuthClient(authHeader).auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: campaign, error: campaignError } = await getAuthClient(authHeader)
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

    const { response, payload } = await callN8nGateway("hiring/application-intake", token, {
      ...parsed.data,
      jd_text: campaign.jd_text,
    });
    if (!response.ok) {
      const details = payload && typeof payload === "object" ? payload : { error: "Intake failed" };
      return NextResponse.json(details, { status: response.status });
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (err) {
    console.error("[api/applications/intake] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Application intake workflow failed" },
      { status: 502 },
    );
  }
}
