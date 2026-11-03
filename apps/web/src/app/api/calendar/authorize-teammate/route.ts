import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";

const requestSchema = z.object({
  token: z.string().min(32, "Invalid token"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid invitation token is required." }, { status: 400 });
    }

    const env = getEnv();
    const serviceRoleKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Validate invite token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("team_member_invites")
      .select("id, team_member_id, account_id, expires_at")
      .eq("token", parsed.data.token)
      .maybeSingle();

    if (inviteErr || !invite) {
      return NextResponse.json(
        { error: "This invitation link is invalid or has expired." },
        { status: 404 },
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation link has expired. Please ask your team for a new link." },
        { status: 410 },
      );
    }

    // 2. Generate cryptographic OAuth state
    const state = crypto.randomBytes(32).toString("hex");
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");

    // 3. Register state in Supabase via service role
    const { error: rpcError } = await supabaseAdmin.rpc("create_calendar_oauth_state", {
      p_team_member_id: invite.team_member_id,
      p_state_hash: stateHash,
    });

    if (rpcError) {
      console.error("[api/calendar/authorize-teammate] create_calendar_oauth_state failed:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Failed to create calendar authorization state." },
        { status: 500 },
      );
    }

    // 4. Construct Google OAuth URL
    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      "218710053867-n83jdachg5a44a2f56dk5afei46jjesg.apps.googleusercontent.com";
    const n8nBase = env.NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
    const redirectUri = `${n8nBase}/webhook/calendar/oauth/callback`;

    const searchParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "openid email profile https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;
    return NextResponse.json({ authorization_url: authorizationUrl });
  } catch (err) {
    console.error("[api/calendar/authorize-teammate] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start Google authorization." },
      { status: 500 },
    );
  }
}

