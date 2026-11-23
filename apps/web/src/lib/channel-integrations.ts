import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/env";

export interface ChannelSenderInfo {
  channel: "email" | "whatsapp" | "voice";
  is_fallback: boolean;
  provider: string;
  sender_email?: string;
  sender_name?: string;
  reply_to?: string;
  phone_number?: string;
  phone_number_id?: string;
  waba_id?: string;
  access_token?: string;
  error?: string;
}

export interface AccountChannelIntegrationsSummary {
  email: {
    connected: boolean;
    provider?: string;
    sender_email?: string;
    sender_name?: string;
    status?: string;
  };
  whatsapp: {
    connected: boolean;
    provider?: string;
    phone_number?: string;
    phone_number_id?: string;
    waba_id?: string;
    status?: string;
  };
  fallbacks: {
    email: string;
    whatsapp: string;
    voice: string;
  };
}

export const PLATFORM_FALLBACK_EMAIL = "info@scalepods.tech";
export const PLATFORM_FALLBACK_WHATSAPP_NUMBER = "+91 77385 58481";
export const PLATFORM_FALLBACK_WHATSAPP_PHONE_ID = "1080270115170890";
export const PLATFORM_FALLBACK_VOICE_CALLER_ID = "+91 22 6423 3051";

function getAdminClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Resolves the outbound email sender for a given account.
 * If the recruiter has connected their Google/Outlook account via OAuth2,
 * it returns their OAuth credentials. Otherwise, it safely falls back to ScalePods (info@scalepods.tech)
 * with the recruiter's email as the Reply-To header.
 */
export async function resolveAccountEmailSender(
  accountId: string,
  recruiterSignupEmail?: string,
  companyName?: string,
): Promise<ChannelSenderInfo> {
  const admin = getAdminClient();

  const { data: row } = await admin
    .from("account_channel_integrations")
    .select("*")
    .eq("account_id", accountId)
    .eq("channel", "email")
    .eq("status", "active")
    .maybeSingle();

  if (row?.sender_email) {
    let activeToken = row.access_token;

    // Check if token needs refresh
    if (
      row.provider === "google_oauth" &&
      row.refresh_token &&
      row.token_expires_at &&
      new Date(row.token_expires_at).getTime() < Date.now() + 60000
    ) {
      const refreshed = await refreshGoogleAccessToken(row.refresh_token);
      if (refreshed?.access_token) {
        activeToken = refreshed.access_token;
        const newExpiry = new Date(
          Date.now() + (refreshed.expires_in || 3600) * 1000,
        ).toISOString();
        await admin
          .from("account_channel_integrations")
          .update({
            access_token: activeToken,
            token_expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }

    return {
      channel: "email",
      is_fallback: false,
      provider: row.provider,
      sender_email: row.sender_email,
      sender_name: row.sender_name || companyName || "ScalePods",
      reply_to: row.sender_email,
      access_token: activeToken || undefined,
    };
  }

  // Fallback to ScalePods through info@scalepods.tech with recruiter's email as Reply-To
  return {
    channel: "email",
    is_fallback: true,
    provider: "scalepods_fallback",
    sender_email: PLATFORM_FALLBACK_EMAIL,
    sender_name: `${companyName || "ScalePods"} via ScalePods`,
    reply_to: recruiterSignupEmail || PLATFORM_FALLBACK_EMAIL,
  };
}

/**
 * Resolves the outbound WhatsApp sender for a given account.
 * If the recruiter has connected their WhatsApp Business Account via Meta Embedded Signup,
 * returns their Phone Number ID and access token. Otherwise, falls back to ScalePods managed line.
 */
export async function resolveAccountWhatsAppSender(accountId: string): Promise<ChannelSenderInfo> {
  const admin = getAdminClient();

  const { data: row } = await admin
    .from("account_channel_integrations")
    .select("*")
    .eq("account_id", accountId)
    .eq("channel", "whatsapp")
    .eq("status", "active")
    .maybeSingle();

  if (row?.phone_number_id) {
    return {
      channel: "whatsapp",
      is_fallback: false,
      provider: row.provider,
      phone_number: row.phone_number || undefined,
      phone_number_id: row.phone_number_id,
      waba_id: row.waba_id || undefined,
      access_token: row.access_token || undefined,
    };
  }

  return {
    channel: "whatsapp",
    is_fallback: true,
    provider: "platform_fallback",
    phone_number: PLATFORM_FALLBACK_WHATSAPP_NUMBER,
    phone_number_id: PLATFORM_FALLBACK_WHATSAPP_PHONE_ID,
  };
}

/**
 * Returns a summary of active channel integrations for the settings UI.
 */
export async function getAccountIntegrationsSummary(
  accountId: string,
): Promise<AccountChannelIntegrationsSummary> {
  const admin = getAdminClient();

  const { data: rows } = await admin
    .from("account_channel_integrations")
    .select("*")
    .eq("account_id", accountId);

  const emailRow = rows?.find((r) => r.channel === "email" && r.status === "active");
  const waRow = rows?.find((r) => r.channel === "whatsapp" && r.status === "active");

  return {
    email: {
      connected: Boolean(emailRow?.sender_email),
      provider: emailRow?.provider,
      sender_email: emailRow?.sender_email || undefined,
      sender_name: emailRow?.sender_name || undefined,
      status: emailRow?.status || "not_connected",
    },
    whatsapp: {
      connected: Boolean(waRow?.phone_number_id),
      provider: waRow?.provider,
      phone_number: waRow?.phone_number || undefined,
      phone_number_id: waRow?.phone_number_id || undefined,
      waba_id: waRow?.waba_id || undefined,
      status: waRow?.status || "not_connected",
    },
    fallbacks: {
      email: PLATFORM_FALLBACK_EMAIL,
      whatsapp: PLATFORM_FALLBACK_WHATSAPP_NUMBER,
      voice: PLATFORM_FALLBACK_VOICE_CALLER_ID,
    },
  };
}

/**
 * Refreshes an expired Google OAuth access token using the stored refresh token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    "218710053867-n83jdachg5a44a2f56dk5afei46jjesg.apps.googleusercontent.com";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (clientSecret) {
      params.append("client_secret", clientSecret);
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.warn("[channel-integrations] Google token refresh failed:", await res.text());
      return null;
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    };
  } catch (err) {
    console.error("[channel-integrations] Error refreshing Google token:", err);
    return null;
  }
}
