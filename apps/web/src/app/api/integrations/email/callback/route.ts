import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const env = getEnv();
  const origin = env.NEXT_PUBLIC_FRONTEND_URL.replace(/\/+$/, "");
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !state) {
    console.warn("[api/integrations/email/callback] OAuth error or missing code:", error);
    return NextResponse.redirect(`${origin}/settings?tab=integrations&email=error`);
  }

  let accountId: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    accountId = decoded.account_id;
  } catch (parseErr) {
    console.error("[api/integrations/email/callback] Failed to parse state:", parseErr);
    return NextResponse.redirect(`${origin}/settings?tab=integrations&email=invalid_state`);
  }

  if (!accountId) {
    return NextResponse.redirect(`${origin}/settings?tab=integrations&email=invalid_state`);
  }

  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    "218710053867-n83jdachg5a44a2f56dk5afei46jjesg.apps.googleusercontent.com";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = `${origin}/api/integrations/email/callback`;

  try {
    // 1. Exchange code for access & refresh tokens
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    if (clientSecret) {
      tokenParams.append("client_secret", clientSecret);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[api/integrations/email/callback] Token exchange failed:", errText);
      return NextResponse.redirect(`${origin}/settings?tab=integrations&email=token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 2. Fetch user profile from Google to get the verified sender email and name
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let senderEmail = "";
    let senderName = "";
    if (profileRes.ok) {
      const profile = await profileRes.json();
      senderEmail = profile.email || "";
      senderName = profile.name || "";
    }

    if (!senderEmail) {
      return NextResponse.redirect(`${origin}/settings?tab=integrations&email=no_email`);
    }

    // 3. Save to account_channel_integrations via Supabase admin client
    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    const integrationData = {
      account_id: accountId,
      channel: "email",
      provider: "google_oauth",
      status: "active",
      sender_email: senderEmail.toLowerCase().trim(),
      sender_name: senderName.trim() || null,
      access_token: accessToken,
      refresh_token: refreshToken || null,
      token_expires_at: tokenExpiry,
      metadata: {
        google_profile: {
          email: senderEmail,
          name: senderName,
        },
      },
      updated_at: new Date().toISOString(),
    };

    // Upsert into account_channel_integrations
    const { error: upsertErr } = await adminClient
      .from("account_channel_integrations")
      .upsert(integrationData, { onConflict: "account_id,channel,provider" });

    if (upsertErr) {
      console.error("[api/integrations/email/callback] Upsert failed:", upsertErr);
      return NextResponse.redirect(`${origin}/settings?tab=integrations&email=db_error`);
    }

    return NextResponse.redirect(`${origin}/settings?channel=email&status=connected`);
  } catch (err) {
    console.error("[api/integrations/email/callback] Unexpected error:", err);
    return NextResponse.redirect(`${origin}/settings?tab=integrations&email=unexpected_error`);
  }
}
