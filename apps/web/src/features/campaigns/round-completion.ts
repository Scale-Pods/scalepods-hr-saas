import type { ViewCandidate } from "./api";

/**
 * Determines whether a candidate's current round has been completed.
 * Candidates in a round MUST NOT be advanced unless their round is completed.
 *
 * An incomplete interview or round (e.g. status "incomplete", "in_progress", or "not_started")
 * does NOT count as completed.
 * Also, a candidate's resume screening score (latest_score) must NOT be confused with
 * an evaluated round score.
 */
export function isCandidateRoundCompleted(cand: ViewCandidate): boolean {
  const stage = (cand.current_stage || "").toLowerCase();
  const isRound =
    cand.current_round_number != null || Boolean(cand.round_number) || stage.includes("round");

  if (!isRound) return true;

  // Check round decision / status (must NOT include "incomplete")
  const status = (cand.decision || "").toLowerCase();
  if (
    status === "completed" ||
    status === "passed" ||
    status === "awaiting_review" ||
    status === "evaluated" ||
    status === "reviewed"
  ) {
    return true;
  }

  // Check interview status (must NOT include "incomplete")
  if (cand.interview_status === "completed" || cand.interview_status === "evaluated") {
    return true;
  }

  // Check score evaluation strictly for this round (NOT latest_score, which includes resume score)
  if (
    cand.ai_interview_score != null &&
    cand.interview_status !== "not_started" &&
    cand.interview_status !== "in_progress" &&
    cand.interview_status !== "incomplete"
  ) {
    return true;
  }

  return false;
}
