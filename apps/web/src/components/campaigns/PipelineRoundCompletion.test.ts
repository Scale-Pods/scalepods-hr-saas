import { describe, expect, it } from "vitest";
import type { ViewCandidate } from "@/features/campaigns/api";
import { isCandidateRoundCompleted } from "@/features/campaigns/round-completion";

describe("isCandidateRoundCompleted", () => {
  const baseCandidate: ViewCandidate = {
    application_id: "app-1",
    candidate_id: "cand-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    current_stage: "Round 1",
    current_round_number: 1,
    status: "active",
    decision: "pending",
    interview_status: "not_started",
    latest_score: 85, // Resume score present
    resume_score: 85,
    ai_interview_score: null,
    answers_count: 0,
  };

  it("does not allow advance when candidate only has a resume score and has not started the round", () => {
    expect(isCandidateRoundCompleted(baseCandidate)).toBe(false);
  });

  it("does not allow advance when round status is incomplete", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      decision: "incomplete",
      interview_status: "incomplete",
    };
    expect(isCandidateRoundCompleted(cand)).toBe(false);
  });

  it("does not allow advance when interview status is incomplete even if candidate answered questions", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      interview_status: "incomplete",
      answers_count: 4,
    };
    expect(isCandidateRoundCompleted(cand)).toBe(false);
  });

  it("does not allow advance when interview is in_progress", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      interview_status: "in_progress",
      answers_count: 2,
    };
    expect(isCandidateRoundCompleted(cand)).toBe(false);
  });

  it("allows advance when round decision is completed", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      decision: "completed",
    };
    expect(isCandidateRoundCompleted(cand)).toBe(true);
  });

  it("allows advance when round decision is passed", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      decision: "passed",
    };
    expect(isCandidateRoundCompleted(cand)).toBe(true);
  });

  it("allows advance when round decision is awaiting_review", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      decision: "awaiting_review",
    };
    expect(isCandidateRoundCompleted(cand)).toBe(true);
  });

  it("allows advance when interview status is evaluated with an AI interview score", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      interview_status: "evaluated",
      ai_interview_score: 78,
    };
    expect(isCandidateRoundCompleted(cand)).toBe(true);
  });

  it("treats non-round stages as completed for round stage check", () => {
    const cand: ViewCandidate = {
      ...baseCandidate,
      current_stage: "Resume Screening",
      current_round_number: null,
      round_number: undefined,
    };
    expect(isCandidateRoundCompleted(cand)).toBe(true);
  });
});
