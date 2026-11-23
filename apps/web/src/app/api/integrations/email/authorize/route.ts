import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let user: { id: string } | null = null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (token) {
    const env = getEnv();
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const {
      data: { user: tokenUser },
    } = await anon.auth.getUser(token);
    user = tokenUser;
  } else {
    try {
      const server = await supabaseServer();
      const {
        data: { user: cookieUser },
      } = await server.auth.getUser();
      user = cookieUser;
    } catch {}
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    "218710053867-n83jdachg5a44a2f56dk5afei46jjesg.apps.googleusercontent.com";

  const env = getEnv();
  const origin = env.NEXT_PUBLIC_FRONTEND_URL.replace(/\/+$/, "");
  const redirectUri = `${origin}/api/integrations/email/callback`;

  // Cryptographic state to prevent CSRF and link back to account_id
  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = Buffer.from(JSON.stringify({ account_id: user.id, nonce })).toString(
    "base64url",
  );

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state: statePayload,
  });

  const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;

  return NextResponse.json({ authorization_url: authorizationUrl });
}
