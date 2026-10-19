import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";

const requestSchema = z.object({ team_member_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select a valid interviewer." }, { status: 400 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const env = getEnv();
  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // First try n8n gateway if available
  try {
    const { response, payload } = await callN8nGateway("calendar/authorize", token, parsed.data);
    const result = payload as Record<string, unknown> | null;
    if (response.ok && typeof result?.authorization_url === "string") {
      return NextResponse.json({ authorization_url: result.authorization_url });
    }
  } catch (dispatchError) {
    console.warn(
      "[api/calendar/authorize] n8n gateway warning, falling back to direct state generation:",
      dispatchError,
    );
  }

  // Fallback: Generate cryptographic OAuth state directly and register in Supabase
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");

    const userClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );

    const { error: rpcError } = await userClient.rpc("create_calendar_oauth_state", {
      p_team_member_id: parsed.data.team_member_id,
      p_state_hash: stateHash,
    });

    if (rpcError) {
      console.error("[api/calendar/authorize] create_calendar_oauth_state failed:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Failed to create calendar authorization state." },
        { status: 500 },
      );
    }

    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      "323942066392-51mmuobaqqpjdgf0bavtrg9k7hhg7tjh.apps.googleusercontent.com";
    const n8nBase = env.NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
    const redirectUri = `${n8nBase}/webhook/calendar/oauth/callback`;

    const searchParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;
    return NextResponse.json({ authorization_url: authorizationUrl });
  } catch (err) {
    console.error("[api/calendar/authorize] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start Google authorization." },
      { status: 500 },
    );
  }
}
