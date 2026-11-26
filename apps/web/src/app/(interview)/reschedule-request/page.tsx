"use client";

import {
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  User,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface RescheduleContext {
  is_valid: boolean;
  status: "active" | "already_requested" | "not_scheduled" | "expired" | "revoked";
  round_instance_id: string;
  candidate_name: string;
  candidate_email: string;
  role_title: string;
  company_name: string;
  round_number: number;
  scheduled_at: string | null;
  timezone: string;
  interviewer_email: string;
  expires_at: string;
  requested_at: string | null;
  reschedule_reason: string | null;
}

const QUICK_REASONS = ["Schedule conflict", "Urgent meeting", "Out of office", "Other"] as const;

function formatScheduledTime(iso: string | null, tz: string): string {
  if (!iso) return "Not scheduled";
  try {
    const date = new Date(iso);
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz || "Asia/Kolkata",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz || "Asia/Kolkata",
    });
    const tzLabel = tz === "Asia/Kolkata" || tz === "Asia/Calcutta" ? "IST" : tz;
    return `${dateStr} · ${timeStr} (${tzLabel})`;
  } catch {
    return iso;
  }
}

function RescheduleRequestContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<RescheduleContext | null>(null);
  const [selectedChip, setSelectedChip] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No reschedule token provided in the URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/interview/reschedule-request?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Unable to validate reschedule link.");
          return;
        }
        setContext(data as RescheduleContext);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load reschedule details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    const combinedReason = [
      selectedChip && selectedChip !== "Other" ? selectedChip : "",
      note.trim(),
    ]
      .filter(Boolean)
      .join(": ");

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/interview/reschedule-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reason: combinedReason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send reschedule request.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reschedule request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Loading interview details...</p>
        </div>
      </div>
    );
  }

  if (error && !context) {
    return (
      <div className="mx-auto max-w-lg pt-16 px-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-3" />
          <h2 className="text-lg font-semibold text-foreground">Reschedule Link Error</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted || context?.status === "already_requested") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-emerald-500/20 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Reschedule Request Sent!</h2>
          <p className="text-sm text-muted-foreground">
            <strong>{context?.candidate_name}</strong> has been notified with a link to pick a new
            interview slot. Your Google Calendar event will automatically update once they select a
            new time.
          </p>
        </div>
      </div>
    );
  }

  if (context?.status === "expired" || context?.status === "revoked") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {context.status === "expired" ? "Reschedule Link Expired" : "Reschedule Link Revoked"}
          </h2>
          <p className="text-sm text-muted-foreground">
            This reschedule link is no longer active. Please contact the recruiter if you still need
            to move this interview.
          </p>
        </div>
      </div>
    );
  }

  if (context?.status === "not_scheduled") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-amber-500/20 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Interview Not Scheduled</h2>
          <p className="text-sm text-muted-foreground">
            This interview round is no longer in a scheduled state, so a reschedule cannot be
            requested.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4 sm:px-6 space-y-6">
      <div className="rounded-3xl border border-border/80 bg-card/40 backdrop-blur-xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Building className="h-3.5 w-3.5" />
            <span>{context?.company_name}</span>
            <span>&bull;</span>
            <span>Round {context?.round_number} (Human Interview)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Request Candidate to Reschedule
          </h1>
          <p className="text-sm text-muted-foreground">
            Send a reschedule link to the candidate so they can pick a new time that works for both
            of you.
          </p>
        </div>

        {/* Interview Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-border/50 bg-background/40 p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 text-primary shrink-0" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Candidate
              </div>
              <div className="font-semibold text-foreground text-sm">{context?.candidate_name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-primary shrink-0" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Role
              </div>
              <div className="font-semibold text-foreground text-sm">{context?.role_title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:col-span-2 pt-2 border-t border-border/40">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Current Scheduled Time
              </div>
              <div className="font-semibold text-foreground text-sm">
                {formatScheduledTime(
                  context?.scheduled_at ?? null,
                  context?.timezone ?? "Asia/Kolkata",
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2.5">
            <label
              htmlFor="reschedule-reason-note"
              className="block text-sm font-medium text-foreground"
            >
              Reason / Note for Candidate{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((chip) => {
                const active = selectedChip === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setSelectedChip(active ? "" : chip)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <textarea
              id="reschedule-reason-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (e.g., I have a conflict at this time — please pick another slot after 2 PM or later this week.)"
              className="w-full rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Sending Request..." : "Send Reschedule Request to Candidate"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RescheduleRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <RescheduleRequestContent />
    </Suspense>
  );
}
