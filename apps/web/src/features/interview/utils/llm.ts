import { getEnv } from "@/env";
import type { InterviewerTurn, InterviewerTurnType, JdTool } from "../types";

function n8nBase(): string {
  try {
    return getEnv().NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "");
  } catch {
    return "https://n8n.srv1711190.hstgr.cloud";
  }
}

export interface InterviewHistoryEntry {
  id?: string;
  question: string;
  answer: string;
  type: string;
  source?: string;
  is_sub_question?: boolean;
}

export interface GenerateInterviewerTurnParams {
  sessionId?: string;
  accountId?: string;
  candidateId?: string;
  candidateName?: string;
  resumeText: string;
  jdText: string;
  history: InterviewHistoryEntry[];
  currentQuestionId?: string;
  askedQuestionText: string;
  currentQuestionType?: string;
  currentQuestionSource?: string;
  isAlreadyFollowUp?: boolean;
  answerText: string;
}

export interface CandidateAnalysis {
  skills: Array<{
    skill: string;
    source: "jd_required" | "resume_claimed" | "both";
    status: "match" | "gap" | "strength";
    evidence: string;
    priority: number;
  }>;
  projectMappings: Array<{ resumeProject: string; relatedJdRequirement: string; notes: string }>;
  summary: string;
  extractedTools?: JdTool[];
}

/**
 * Pure n8n /webhook/interview-engine transport client.
 * All interview rules, classifications, follow-ups, clarifications, and closing decisions
 * are handled exclusively inside n8n and its OpenAI prompts.
 */
export async function generateInterviewerTurn(
  params: GenerateInterviewerTurnParams,
): Promise<InterviewerTurn> {
  const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate-turn",
      session_id: params.sessionId,
      account_id: params.accountId,
      candidate_id: params.candidateId,
      candidate_name: params.candidateName || "",
      question_id: params.currentQuestionId || null,
      asked_question_text: params.askedQuestionText,
      question: params.askedQuestionText,
      question_type: params.currentQuestionType || "technical",
      question_source: params.currentQuestionSource || "",
      is_already_follow_up: Boolean(params.isAlreadyFollowUp),
      isAlreadyFollowUp: Boolean(params.isAlreadyFollowUp),
      answer_text: params.answerText,
      answer: params.answerText,
      response_transcript: params.answerText,
      resume_text: params.resumeText,
      resumeText: params.resumeText,
      jd_text: params.jdText,
      jdText: params.jdText,
      history: params.history,
    }),
  });

  if (!response.ok) {
    throw new Error(`n8n interview-engine responded with status ${response.status}`);
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  const isFinal = Boolean(parsed.is_final_question || parsed.turn_type === "closing");
  const turnType = (
    isFinal ? "closing" : String(parsed.turn_type || "question")
  ) as InterviewerTurnType;

  return {
    interviewer_text: typeof parsed.interviewer_text === "string" ? parsed.interviewer_text : "",
    question_text: typeof parsed.question_text === "string" ? parsed.question_text : "",
    turn_type: turnType,
    question_type: (parsed.question_type as InterviewerTurn["question_type"]) || "technical",
    should_continue:
      parsed.should_continue !== undefined ? Boolean(parsed.should_continue) : !isFinal,
    recommended_action: parsed.recommended_action as InterviewerTurn["recommended_action"],
    evaluation_note: (parsed.evaluation_note as Record<string, unknown> | null | undefined) ?? null,
    answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
    is_final_question: isFinal,
    next_question_id: typeof parsed.next_question_id === "string" ? parsed.next_question_id : null,
  };
}
