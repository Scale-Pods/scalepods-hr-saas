"use client";

import {
  AlertTriangle,
  Briefcase,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Send,
  Sparkles,
  UserCheck,
  UserX,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { anonClient } from "@/lib/supabase/anon";

interface EvaluationCriterion {
  name: string;
  weight?: number;
  description?: string;
}

interface FeedbackContext {
  is_valid: boolean;
  status: "active" | "already_submitted" | "no_show_reported" | "expired" | "revoked";
  candidate_name: string;
  candidate_email: string;
  role_title: string;
  company_name: string;
  round_number: number;
  scheduled_at: string;
  interviewer_name: string;
  interviewer_email: string;
  evaluation_criteria: EvaluationCriterion[];
  questions?: string[];
  expires_at: string;
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<FeedbackContext | null>(null);

  // Form states
  const [criterionScores, setCriterionScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [noShowSuccess, setNoShowSuccess] = useState(false);
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No evaluation token provided in the URL.");
      setLoading(false);
      return;
    }

    async function fetchContext() {
      if (!token) return;
      try {
        setLoading(true);
        const client = anonClient();
        const rpcFn = client.rpc as unknown as (
          fn: string,
          params: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
        const { data, error: rpcErr } = await rpcFn("get_interviewer_feedback_context", {
          p_token: token,
        });

        if (rpcErr) {
          setError(rpcErr.message || "Failed to validate evaluation link.");
          return;
        }

        const ctx = data as unknown as FeedbackContext;
        setContext(ctx);

        // Pre-fill initial scores for criteria
        if (ctx.evaluation_criteria && Array.isArray(ctx.evaluation_criteria)) {
          const initialScores: Record<string, number> = {};
          ctx.evaluation_criteria.forEach((c) => {
            initialScores[c.name] = 75; // default competent score
          });
          setCriterionScores(initialScores);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchContext();
  }, [token]);

  // Compute weighted or average score
  const computedScore = useMemo(() => {
    if (!context?.evaluation_criteria?.length) return 75;
    let totalWeight = 0;
    let weightedSum = 0;

    for (const c of context.evaluation_criteria) {
      const weight = c.weight ?? 1;
      const score = criterionScores[c.name] ?? 75;
      totalWeight += weight;
      weightedSum += score * weight;
    }

    return Math.round(weightedSum / (totalWeight || 1));
  }, [context, criterionScores]);

  const activeOverallScore = overallScoreManual ?? computedScore;

  const scoreBadge = useMemo(() => {
    if (activeOverallScore >= 85)
      return {
        label: "Strong Hire",
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      };
    if (activeOverallScore >= 70)
      return { label: "Hire", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
    if (activeOverallScore >= 55)
      return {
        label: "Marginal / Consider",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      };
    return { label: "Do Not Hire", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
  }, [activeOverallScore]);

  async function handleSubmit() {
    if (!token) return;
    try {
      setSubmitting(true);
      setError(null);

      const criteriaArray = Object.entries(criterionScores).map(([name, score]) => ({
        name,
        score,
      }));

      const client = anonClient();
      const { error: submitErr } = await client.rpc("submit_interviewer_feedback", {
        p_token: token,
        p_criteria_scores: criteriaArray,
        p_overall_score: activeOverallScore,
        p_notes: notes.trim() || null,
      });

      if (submitErr) {
        throw new Error(submitErr.message || "Failed to submit feedback.");
      }

      setSubmittedSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit evaluation.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReportNoShow() {
    if (!token) return;
    try {
      setSubmitting(true);
      setError(null);

      const client = anonClient();
      const { error: noShowErr } = await client.rpc("report_interviewer_no_show", {
        p_token: token,
      });

      if (noShowErr) {
        throw new Error(noShowErr.message || "Failed to report no-show.");
      }

      setShowNoShowConfirm(false);
      setNoShowSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to report no-show.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Loading interview evaluation session...</p>
        </div>
      </div>
    );
  }

  if (error && !context) {
    return (
      <div className="mx-auto max-w-lg pt-16 px-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-3" />
          <h2 className="text-lg font-semibold text-foreground">Evaluation Link Error</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submittedSuccess || context?.status === "already_submitted") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-emerald-500/20 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Evaluation Submitted!</h2>
          <p className="text-sm text-muted-foreground">
            Thank you for submitting your evaluation for <strong>{context?.candidate_name}</strong>.
            Your scores and notes have been securely recorded in the candidate decision ledger.
          </p>
        </div>
      </div>
    );
  }

  if (noShowSuccess || context?.status === "no_show_reported") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-amber-500/20 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <UserX className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Candidate No-Show Reported</h2>
          <p className="text-sm text-muted-foreground">
            This interview for <strong>{context?.candidate_name}</strong> has been flagged as a
            no-show. The recruiter will be notified to take action.
          </p>
        </div>
      </div>
    );
  }

  if (context?.status === "expired") {
    return (
      <div className="mx-auto max-w-lg pt-20 px-4 text-center">
        <div className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-8 shadow-2xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Evaluation Link Expired</h2>
          <p className="text-sm text-muted-foreground">
            This evaluation link expired on {new Date(context.expires_at).toLocaleDateString()}.
            Please contact your recruitment administrator to generate an updated evaluation link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-12 px-4 sm:px-6 space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl border border-border/80 bg-card/40 backdrop-blur-xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Building className="h-3.5 w-3.5" />
              <span>{context?.company_name}</span>
              <span>&bull;</span>
              <span>Round {context?.round_number} (Human Interview)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Candidate Evaluation
            </h1>
            <p className="text-sm text-muted-foreground">
              Submit structured ratings and post-interview feedback for this candidate.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNoShowConfirm(true)}
            className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
          >
            <UserX className="h-3.5 w-3.5" />
            Report No-Show
          </button>
        </div>

        {/* Candidate & Interview Details Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/30">
            <UserCheck className="h-4 w-4 text-primary shrink-0" />
            <div className="overflow-hidden">
              <span className="block font-semibold text-foreground truncate">
                {context?.candidate_name}
              </span>
              <span className="text-[11px] truncate block">{context?.candidate_email}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/30">
            <Briefcase className="h-4 w-4 text-primary shrink-0" />
            <div className="overflow-hidden">
              <span className="block font-semibold text-foreground truncate">
                {context?.role_title}
              </span>
              <span className="text-[11px] truncate block">Job Requisition</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/30">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <div className="overflow-hidden">
              <span className="block font-semibold text-foreground truncate">
                {context?.scheduled_at
                  ? new Date(context.scheduled_at).toLocaleDateString()
                  : "Concluded"}
              </span>
              <span className="text-[11px] truncate block">
                Interviewer: {context?.interviewer_name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Suggested Questions if configured */}
      {context?.questions && context.questions.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            <span>Assigned Interview Questions</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground pl-1">
            {context.questions.map((q) => (
              <li key={q} className="leading-relaxed">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evaluation Criteria Sliders */}
      <div className="rounded-3xl border border-border/80 bg-card/40 backdrop-blur-xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Competency Evaluation Criteria
            </h2>
            <p className="text-xs text-muted-foreground">
              Score the candidate on each pillar from 1 to 100.
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full border text-xs font-bold ${scoreBadge.color}`}>
            {scoreBadge.label} ({activeOverallScore}/100)
          </div>
        </div>

        <div className="space-y-6">
          {context?.evaluation_criteria?.map((criterion) => {
            const currentVal = criterionScores[criterion.name] ?? 75;
            return (
              <div
                key={criterion.name}
                className="space-y-2 p-4 rounded-2xl bg-muted/10 border border-border/40"
              >
                <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>{criterion.name}</span>
                  <span className="font-mono text-sm text-primary font-bold">
                    {currentVal} / 100
                  </span>
                </div>
                {criterion.description && (
                  <p className="text-xs text-muted-foreground">{criterion.description}</p>
                )}
                <div className="flex items-center gap-4 pt-1">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={currentVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setCriterionScores((prev) => ({ ...prev, [criterion.name]: val }));
                    }}
                    className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono">
                  <span>1 (Poor)</span>
                  <span>50 (Average)</span>
                  <span>75 (Good)</span>
                  <span>100 (Exceptional)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Score Override & Written Notes */}
      <div className="rounded-3xl border border-border/80 bg-card/40 backdrop-blur-xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Interview Notes & Synthesis
          </h2>
          <span className="text-xs text-muted-foreground">Optional, but highly recommended</span>
        </div>

        <div>
          <label
            htmlFor="detailed-feedback"
            className="block text-xs font-medium text-muted-foreground mb-2"
          >
            Detailed Feedback & Candidate Observations:
          </label>
          <textarea
            id="detailed-feedback"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key strengths, areas of concern, problem-solving approach, technical depth, and specific examples observed during the interview..."
            className="w-full rounded-2xl border border-border/80 bg-card/60 p-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-y"
          />
        </div>

        {/* Submit Action */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/40">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Evaluation Scorecard
              </>
            )}
          </button>
        </div>
      </div>

      {/* No-Show Confirmation Dialog */}
      {showNoShowConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <UserX className="h-6 w-6" />
              <h3 className="text-lg font-bold">Report Candidate No-Show?</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to mark <strong>{context?.candidate_name}</strong> as a no-show?
              This will notify the recruiter that the candidate did not attend the scheduled
              interview.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNoShowConfirm(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleReportNoShow}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? "Reporting..." : "Confirm No-Show"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterviewerFeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted-foreground">
          Loading evaluation scorecard...
        </div>
      }
    >
      <FeedbackContent />
    </Suspense>
  );
}
