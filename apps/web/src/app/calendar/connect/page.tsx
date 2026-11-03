"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  Shield,
  Building2,
  User,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ConnectInfo {
  valid: boolean;
  team_member_id: string;
  name: string;
  email: string;
  role: string;
  company_name: string;
  is_connected: boolean;
  google_email: string | null;
  status: string;
  error?: string;
}

function TeammateCalendarConnectContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const statusParam = searchParams.get("status") || searchParams.get("calendar");

  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (statusParam === "connected") {
      setLoading(false);
      return;
    }

    if (!token) {
      setError("No invitation token found in this link. Please check your invitation email.");
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/calendar/connect-info?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setError(data.error || "This invitation link is invalid or has expired.");
        } else {
          setInfo(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invitation information.");
      } finally {
        setLoading(false);
      }
    };

    void fetchInfo();
  }, [token, statusParam]);

  const handleConnect = async () => {
    if (!token) return;
    setAuthorizing(true);
    try {
      const res = await fetch("/api/calendar/authorize-teammate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || "Could not start Google authorization.");
      }
      window.location.assign(data.authorization_url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initiate Google authorization.";
      toast.error(msg);
      setAuthorizing(false);
    }
  };

  // State 1: Successfully connected screen
  if (statusParam === "connected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-border/60 shadow-xl overflow-hidden">
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-6 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 mb-3 shadow-inner">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Google Calendar Connected</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Your Google Calendar is successfully linked to ScalePods
            </p>
          </div>
          <CardContent className="p-6 space-y-4">
            <div className="rounded-xl bg-muted/40 p-4 border border-border/50 space-y-2 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Availability Synced:</strong> Candidates will only be able to book slots when you are free.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Automated Events:</strong> Confirmed interview rounds will automatically appear on your calendar with Google Meet video links.
                </p>
              </div>
            </div>

            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                You may now safely close this window or return to your tasks.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State 2: Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-border/60 p-8 flex flex-col items-center justify-center text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Verifying Invitation...</h2>
            <p className="text-xs text-muted-foreground">Connecting with ScalePods workspace</p>
          </div>
        </Card>
      </div>
    );
  }

  // State 3: Error
  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-destructive/30 shadow-xl overflow-hidden">
          <div className="bg-destructive/10 border-b border-destructive/20 p-6 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-destructive/20 flex items-center justify-center text-destructive mb-3">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Invitation Link Invalid</h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">{error}</p>
          </div>
          <CardContent className="p-6 text-center text-xs text-muted-foreground space-y-4">
            <p>
              Please contact your recruiting team lead or workspace administrator to request a fresh calendar invitation link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State 4: Interactive Teammate Connect View
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <Card className="max-w-lg w-full border-border/60 shadow-2xl overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-indigo-500/10 to-primary/5 border-b border-border/50 p-6 sm:p-7">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-lg text-foreground">
                Scale<span className="text-primary">Pods</span>
              </span>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-primary/30 text-primary">
                Interviewer Setup
              </Badge>
            </div>
            {info.is_connected && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1">
                <CheckCircle className="h-3 w-3" /> Connected
              </Badge>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            Connect Your Google Calendar
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Allow {info.company_name} to schedule candidate interview rounds according to your availability.
          </p>
        </div>

        <CardContent className="p-6 sm:p-7 space-y-6">
          {/* Teammate Profile Context */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-muted/40 border border-border/60 text-xs">
            <div className="space-y-0.5">
              <span className="text-muted-foreground flex items-center gap-1 font-medium">
                <User className="h-3.5 w-3.5" /> Teammate
              </span>
              <span className="font-semibold text-foreground text-sm block">{info.name}</span>
              <span className="text-[11px] text-muted-foreground block">{info.email}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-muted-foreground flex items-center gap-1 font-medium">
                <Building2 className="h-3.5 w-3.5" /> Workspace
              </span>
              <span className="font-semibold text-foreground text-sm block">{info.company_name}</span>
              <span className="text-[11px] text-muted-foreground block capitalize">{info.role}</span>
            </div>
          </div>

          {/* Connected State Badge if already linked */}
          {info.is_connected && info.google_email && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <span className="font-semibold text-foreground block">Calendar Already Linked</span>
                  <span className="text-muted-foreground font-mono text-[11px]">{info.google_email}</span>
                </div>
              </div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 shrink-0">
                Active
              </Badge>
            </div>
          )}

          {/* Permissions explanation */}
          <div className="space-y-2.5 text-xs text-muted-foreground">
            <span className="text-xs font-semibold text-foreground block uppercase tracking-wider">
              What ScalePods Will Access:
            </span>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-3 w-3" />
                </div>
                <span>
                  <strong className="text-foreground">Free/Busy Times:</strong> Checks your free time slots to prevent double-booking. Meeting titles and personal events remain private.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="h-3 w-3" />
                </div>
                <span>
                  <strong className="text-foreground">Interview Events:</strong> Adds scheduled interviews with candidate details and Google Meet video conference links.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Shield className="h-3 w-3" />
                </div>
                <span>
                  <strong className="text-foreground">Security Guaranteed:</strong> You can revoke access at any time from your Google Account security settings.
                </span>
              </div>
            </div>
          </div>

          {/* Connect Action Button */}
          <div className="pt-2">
            <Button
              type="button"
              size="lg"
              onClick={handleConnect}
              disabled={authorizing}
              className="w-full h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 border border-slate-300 shadow-md transition-all active:scale-[0.99]"
            >
              {authorizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                    />
                  </svg>
                  <span>
                    {info.is_connected ? "Reconnect Google Calendar" : "Sign in & Connect Google Calendar"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeammateCalendarConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <TeammateCalendarConnectContent />
    </Suspense>
  );
}

