"use client";

import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccountChannelIntegrationsSummary } from "@/lib/channel-integrations";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string; accessToken?: string };
          status?: string;
        }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
  }
}

export function ChannelIntegrationsManager({
  accountId: _accountId,
  accessToken,
}: {
  accountId?: string;
  accessToken?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [disconnectingEmail, setDisconnectingEmail] = useState(false);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [disconnectingWhatsApp, setDisconnectingWhatsApp] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ app_id?: string; config_id?: string } | null>(
    null,
  );

  const [integrations, setIntegrations] = useState<AccountChannelIntegrationsSummary>({
    email: { connected: false },
    whatsapp: { connected: false },
    fallbacks: {
      email: "info@scalepods.tech",
      whatsapp: "+91 77385 58481",
      voice: "+91 22 6423 3051",
    },
  });

  const loadStatus = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch("/api/integrations/status", { headers });
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data);
      }
    } catch (err) {
      console.warn("[ChannelIntegrations] Failed to load status:", err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Load Meta App Config
  useEffect(() => {
    async function fetchMetaConfig() {
      try {
        const res = await fetch("/api/integrations/whatsapp/config");
        if (res.ok) {
          const data = await res.json();
          setMetaConfig(data);
        }
      } catch {}
    }
    void fetchMetaConfig();
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Listen for Meta Embedded Signup message events from the popup window
  useEffect(() => {
    const handleMetaMessage = async (event: MessageEvent) => {
      // Security check: only trust facebook or meta domains
      if (
        !event.origin.includes("facebook.com") &&
        !event.origin.includes("meta.com") &&
        !event.origin.includes(window.location.origin)
      ) {
        return;
      }

      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          const { code, waba_id, phone_number_id } = data.data || {};
          if (code) {
            setConnectingWhatsApp(true);
            const res = await fetch("/api/integrations/whatsapp/embedded-signup", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify({ code, waba_id, phone_number_id }),
            });

            if (res.ok) {
              toast.success("WhatsApp Business Account connected successfully!");
              void loadStatus();
            } else {
              const err = await res.json().catch(() => ({}));
              toast.error(err.error || "Failed to finalize WhatsApp connection.");
            }
            setConnectingWhatsApp(false);
          }
        }
      } catch {}
    };

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, [accessToken, loadStatus]);

  // 1. Connect Email via Google OAuth2
  const handleConnectEmail = async () => {
    setConnectingEmail(true);
    try {
      const res = await fetch("/api/integrations/email/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || "Failed to initiate Google authorization.");
      }

      // Redirect recruiter to Google's OAuth consent screen
      window.location.assign(data.authorization_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect email.");
      setConnectingEmail(false);
    }
  };

  // 2. Disconnect Email
  const handleDisconnectEmail = async () => {
    setDisconnectingEmail(true);
    try {
      const res = await fetch("/api/integrations/email", {
        method: "DELETE",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to disconnect email.");
      }

      toast.success(
        "Email disconnected. Outgoing emails now fall back to ScalePods (info@scalepods.tech with your Reply-To).",
      );
      void loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect email.");
    } finally {
      setDisconnectingEmail(false);
    }
  };

  // 3. Connect WhatsApp via Meta Embedded Signup
  const handleConnectWhatsApp = () => {
    setConnectingWhatsApp(true);

    const appId = metaConfig?.app_id;
    const configId = metaConfig?.config_id;

    if (!appId) {
      // If Meta App ID isn't set yet in env, guide recruiter to set credentials or use direct setup
      toast.info(
        "Meta Developer App credentials not configured in environment. Please add META_APP_ID to enable Embedded Signup, or contact your administrator.",
      );
      setConnectingWhatsApp(false);
      return;
    }

    // Launch Meta Embedded Signup popup
    const redirectUri = encodeURIComponent(window.location.origin);
    const url = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=whatsapp_business_management,whatsapp_business_messaging&extras=${encodeURIComponent(
      JSON.stringify({
        feature: "whatsapp_embedded_signup",
        version: 2,
        ...(configId ? { setup: { config_id: configId } } : {}),
      }),
    )}`;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      "MetaWhatsAppSignup",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
    );

    // Watch for popup close
    const checkTimer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(checkTimer);
        setConnectingWhatsApp(false);
      }
    }, 1000);
  };

  // 4. Disconnect WhatsApp
  const handleDisconnectWhatsApp = async () => {
    setDisconnectingWhatsApp(true);
    try {
      const res = await fetch("/api/integrations/whatsapp", {
        method: "DELETE",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to disconnect WhatsApp.");
      }

      toast.success(
        "WhatsApp disconnected. Future candidate messages will send via ScalePods fallback.",
      );
      void loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect WhatsApp.");
    } finally {
      setDisconnectingWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading channel sending identities...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 1. EMAIL CHANNEL (OAuth2 + ScalePods Fallback) ── */}
      <div className="rounded-xl border border-border/60 bg-card p-4 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 border border-sky-500/20">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">Email Sending Channel</h4>
                {integrations.email.connected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-[11px] font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected via Google
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                    <Radio className="h-2.5 w-2.5 text-amber-500 animate-pulse" />
                    ScalePods Fallback
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {integrations.email.connected ? (
                  <>
                    Sending all candidate invites, reminders, and offer letters directly from{" "}
                    <strong className="text-foreground">{integrations.email.sender_email}</strong>.
                    Candidate replies will arrive directly in your personal inbox.
                  </>
                ) : (
                  <>
                    Currently sending via{" "}
                    <strong className="text-foreground">{integrations.fallbacks.email}</strong> with
                    your account email set as the <code>Reply-To</code> header. Connect your Google
                    account to send directly from your personal or work email.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {integrations.email.connected ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-rose-500 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-600"
                onClick={handleDisconnectEmail}
                disabled={disconnectingEmail}
              >
                {disconnectingEmail ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
                <span>Disconnect</span>
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-white shadow-xs"
                onClick={handleConnectEmail}
                disabled={connectingEmail}
              >
                {connectingEmail ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                <span>Connect Google Email</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. WHATSAPP CHANNEL (Meta Embedded Signup + ScalePods Fallback) ── */}
      <div className="rounded-xl border border-border/60 bg-card p-4 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">WhatsApp Business Channel</h4>
                {integrations.whatsapp.connected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-[11px] font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified Business Number
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                    <Radio className="h-2.5 w-2.5 text-amber-500 animate-pulse" />
                    ScalePods Fallback
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {integrations.whatsapp.connected ? (
                  <>
                    Sending official candidate outreach, reminders, and links from your company
                    number{" "}
                    <strong className="text-foreground">
                      {integrations.whatsapp.phone_number}
                    </strong>{" "}
                    (WABA ID: {integrations.whatsapp.waba_id}).
                  </>
                ) : (
                  <>
                    Currently sending automated notifications through the ScalePods managed line (
                    <strong className="text-foreground">{integrations.fallbacks.whatsapp}</strong>
                    ). Connect your WhatsApp Business number via Meta Embedded Signup to use your
                    company line.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {integrations.whatsapp.connected ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-rose-500 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-600"
                onClick={handleDisconnectWhatsApp}
                disabled={disconnectingWhatsApp}
              >
                {disconnectingWhatsApp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
                <span>Disconnect</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 shadow-xs"
                onClick={handleConnectWhatsApp}
                disabled={connectingWhatsApp}
              >
                {connectingWhatsApp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                <span>Connect WhatsApp Business</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. VOICE LINE CHANNEL (Telephony / DialNexa) ── */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">AI Voice Screening Line</h4>
                <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                  ScalePods Managed Telephony
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Outbound AI qualification calls are routed through ScalePods high-reputation
                telephony line (
                <strong className="text-foreground">{integrations.fallbacks.voice}</strong>). Caller
                ID verification is configurable per campaign in the campaign wizard.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-primary shrink-0" />
        <span>
          <strong>Zero daily configuration:</strong> Once you connect your email or WhatsApp account
          here, all campaigns and candidate workflows will automatically dispatch from your
          identities without any additional daily setup.
        </span>
      </div>
    </div>
  );
}
