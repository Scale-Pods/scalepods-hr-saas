import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

const requestBodySchema = z.object({
  token: z.string().min(16, "A valid reschedule token is required."),
  reason: z.string().max(1000).optional().nullable(),
});

function getServiceClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token.trim()) {
    return NextResponse.json({ error: "Reschedule token is required." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("get_interviewer_reschedule_context", {
    p_token: token.trim(),
  });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Reschedule link is invalid or expired." },
      { status: 404 },
    );
  }

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = requestBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request." },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("request_interviewer_reschedule", {
      p_token: parsed.data.token.trim(),
      p_reason: parsed.data.reason?.trim() || null,
    });

    if (error || !data) {
      const msg = error?.message || "Unable to process reschedule request.";
      const status = /already_requested/i.test(msg)
        ? 409
        : /expired|revoked|not_found|invalid_token/i.test(msg)
          ? 400
          : /not_scheduled|job_closed/i.test(msg)
            ? 409
            : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    const env = getEnv();
    const frontendBase = (
      env.NEXT_PUBLIC_FRONTEND_URL ||
      process.env.NEXT_PUBLIC_FRONTEND_URL ||
      "https://scalepods.tech"
    ).replace(/\/+$/, "");

    const rescheduleLink = `${frontendBase}/book/${data.round_instance_id}?tok=${encodeURIComponent(data.booking_token)}&mode=reschedule`;

    const n8nBase = env.NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");

    const webhookRes = await fetch(`${n8nBase}/webhook/interviewer-reschedule-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...data,
        reschedule_link: rescheduleLink,
      }),
    });

    if (!webhookRes.ok) {
      const errText = await webhookRes.text().catch(() => "");
      console.error(
        "[api/interview/reschedule-request] n8n webhook failed:",
        webhookRes.status,
        errText,
      );
      return NextResponse.json(
        {
          error: "Reschedule request recorded, but failed to dispatch candidate notification.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      candidate_name: data.candidate_name,
      candidate_email: data.candidate_email,
    });
  } catch (err) {
    console.error("[api/interview/reschedule-request] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
