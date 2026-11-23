import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const signupPayloadSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  waba_id: z.string().optional(),
  phone_number_id: z.string().optional(),
});

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

  const body = await req.json().catch(() => null);
  const parsed = signupPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { code, waba_id: clientWabaId, phone_number_id: clientPhoneId } = parsed.data;

  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";

  let accessToken = "";
  const resolvedPhoneNumberId = clientPhoneId || "";
  const resolvedWabaId = clientWabaId || "";
  let displayPhoneNumber = "";
  let verifiedBusinessName = "";

  // 1. If Meta credentials are provided, exchange code for system/user token
  if (appId && appSecret) {
    try {
      const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
      tokenUrl.searchParams.append("client_id", appId);
      tokenUrl.searchParams.append("client_secret", appSecret);
      tokenUrl.searchParams.append("code", code);

      const tokenRes = await fetch(tokenUrl.toString());
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token || "";
      } else {
        console.warn(
          "[api/integrations/whatsapp/embedded-signup] Meta token exchange warning:",
          await tokenRes.text(),
        );
      }
    } catch (err) {
      console.warn("[api/integrations/whatsapp/embedded-signup] Meta token error:", err);
    }
  }

  // 2. Query phone number details if phone_number_id is available
  if (resolvedPhoneNumberId && accessToken) {
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v20.0/${resolvedPhoneNumberId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (phoneRes.ok) {
        const phoneData = await phoneRes.json();
        displayPhoneNumber = phoneData.display_phone_number || "";
        verifiedBusinessName = phoneData.verified_name || "";
      }
    } catch (err) {
      console.warn("[api/integrations/whatsapp/embedded-signup] Fetch phone details error:", err);
    }
  }

  // 3. Subscribe WABA to app webhooks so delivery states hit /api/webhooks/whatsapp
  if (resolvedWabaId && accessToken) {
    try {
      await fetch(`https://graph.facebook.com/v20.0/${resolvedWabaId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      console.warn("[api/integrations/whatsapp/embedded-signup] Subscribe WABA warning:", err);
    }
  }

  // Fallback defaults if client passes verified number info directly
  if (!displayPhoneNumber && clientPhoneId) {
    displayPhoneNumber = `WABA Phone (${clientPhoneId.slice(-6)})`;
  }

  // 4. Save to account_channel_integrations via admin Supabase client
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const integrationData = {
    account_id: user.id,
    channel: "whatsapp",
    provider: "meta_embedded",
    status: "active",
    phone_number: displayPhoneNumber || null,
    phone_number_id: resolvedPhoneNumberId || null,
    waba_id: resolvedWabaId || null,
    access_token: accessToken || null,
    metadata: {
      verified_name: verifiedBusinessName || null,
      connected_at_timestamp: Date.now(),
    },
    updated_at: new Date().toISOString(),
  };

  const { error: dbErr } = await adminClient
    .from("account_channel_integrations")
    .upsert(integrationData, { onConflict: "account_id,channel,provider" });

  if (dbErr) {
    console.error("[api/integrations/whatsapp/embedded-signup] DB upsert failed:", dbErr);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "WhatsApp Business Account connected successfully.",
    phone_number: displayPhoneNumber,
    phone_number_id: resolvedPhoneNumberId,
    waba_id: resolvedWabaId,
  });
}
