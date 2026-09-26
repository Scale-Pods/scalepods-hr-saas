import type {
  LiveAssessmentNote,
  AuthenticitySignal,
  InterviewerTurn,
  InterviewerTurnType,
  InterviewBlueprint,
  InterviewPlanItem,
  AnswerInsufficiencyReason,
  JdTool,
  ResumeJdAlignment,
} from "../types";
import { getEnv } from "@/env";

function n8nBase(): string {
  try {
    return getEnv().NEXT_PUBLIC_N8N_BASE_URL.replace(/\/+$/, "");
  } catch {
    return "https://n8n.srv1711190.hstgr.cloud";
  }
}

interface HistoryItem {
  id?: string;
  question: string;
  answer: string;
  type: string;
}

interface QuestionResponse {
  question_text: string;
  question_type: "technical" | "behavioral" | "situational" | "cultural";
  follow_up_reason: string;
}

interface SkillAssessment {
  skill: string;
  source: "jd_required" | "resume_claimed" | "both";
  status: "match" | "gap" | "strength";
  evidence: string;
  priority: number;
}

export interface CandidateAnalysis {
  skills: SkillAssessment[];
  projectMappings: Array<{ resumeProject: string; relatedJdRequirement: string; notes: string }>;
  summary: string;
  extractedTools?: JdTool[];
  alignment?: ResumeJdAlignment;
}

export async function analyzeResumeJdAlignment(
  resumeText: string,
  jdText: string,
): Promise<ResumeJdAlignment> {
  const fallback: ResumeJdAlignment = {
    domain_alignment: "aligned",
    domain_reasoning: "Standard alignment check.",
    experience_gap: {
      jd_required_years: null,
      candidate_years: null,
      status: "aligned",
      reasoning: "No clear experience gap identified.",
    },
    flagged_gaps: [],
  };

  if (!resumeText || !jdText) return fallback;

  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "analyze-alignment", resumeText, jdText }),
    });
    if (!response.ok) return fallback;
    const parsed = await response.json();
    return {
      domain_alignment: parsed.domain_alignment || "aligned",
      domain_reasoning: parsed.domain_reasoning || "",
      experience_gap: {
        jd_required_years: parsed.experience_gap?.jd_required_years ?? null,
        candidate_years: parsed.experience_gap?.candidate_years ?? null,
        status: parsed.experience_gap?.status || "aligned",
        reasoning: parsed.experience_gap?.reasoning || "",
      },
      flagged_gaps: Array.isArray(parsed.flagged_gaps) ? parsed.flagged_gaps : [],
    };
  } catch (err) {
    console.warn("[analyzeResumeJdAlignment] fallback:", err);
    return fallback;
  }
}

export function isClarificationRequested(answer: string): boolean {
  const text = (answer || "").toLowerCase().trim();
  if (!text) return false;
  const keywords = [
    "clarify",
    "clarification",
    "explain",
    "explanation",
    "understand",
    "rephrase",
    "what do you mean",
    "what does that mean",
    "what is meant",
    "repeat",
    "meaning of",
    "pardon",
    "elaborate on the question",
    "elaborate",
  ];
  return keywords.some((k) => text.includes(k));
}

export function isVagueOrUncertainAnswer(answer: string): boolean {
  const text = (answer || "").toLowerCase().trim();
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;

  const vaguePhrases = [
    "don't know",
    "do not know",
    "no idea",
    "not sure",
    "idk",
    "didn't see",
    "did not see",
    "no problems",
    "never used",
    "haven't used",
    "have not used",
    "cannot say",
    "can't say",
    "not experienced",
    "no experience",
    "dunno",
    "nothing specific",
    "no idea about",
    "face any problems",
    "dont know",
  ];
  return vaguePhrases.some((phrase) => text.includes(phrase));
}

export async function analyzeAnswerInRealtime(
  question: string,
  answer: string,
  resumeText: string,
  jdText: string,
  history: HistoryItem[],
  questionId: string,
  blueprint?: InterviewBlueprint | null,
  competencyIds: string[] = [],
  questionType: string = "technical",
  isAlreadyFollowUp = false,
  sessionId?: string,
  accountId?: string,
  candidateId?: string,
): Promise<LiveAssessmentNote> {
  const isTechnical = questionType === "technical";
  const isExplicitClarification = isClarificationRequested(answer);
  const isVague = isVagueOrUncertainAnswer(answer);
  const canAdaptPrimary = isTechnical && !isAlreadyFollowUp;

  const fallbackAction = (
    isExplicitClarification && canAdaptPrimary
      ? "rephrase_primary"
      : isVague && canAdaptPrimary
        ? "follow_up"
        : "advance"
  ) as LiveAssessmentNote["recommended_action"];

  const fallback: LiveAssessmentNote = {
    question_id: questionId,
    authenticity_signal: isVague ? "vague" : "genuine",
    depth_signal: isVague ? "empty" : "surface",
    red_flags: [],
    note: isExplicitClarification
      ? "Candidate requested clarification."
      : isVague
        ? "Candidate gave a brief or uncertain answer."
        : "Answer recorded.",
    follow_up_prompted: fallbackAction === "rephrase_primary" || fallbackAction === "follow_up",
    rephrased_question:
      fallbackAction === "rephrase_primary"
        ? `Could you clarify or simplify the question: "${question}"?`
        : undefined,
    follow_up_question:
      fallbackAction === "follow_up"
        ? `Could you share any related experience or fundamental concepts you do know regarding "${question}"?`
        : undefined,
    insufficiency_reason: fallbackAction === "follow_up" ? "vague" : null,
    recommended_action: fallbackAction,
    requested_clarification: isExplicitClarification,
  };

  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "analyze-answer",
        account_id: accountId,
        session_id: sessionId,
        candidate_id: candidateId,
        question,
        answer,
        response_transcript: answer,
        resumeText,
        jdText,
        history,
        questionId,
        blueprint,
        competencyIds,
        questionType,
        isAlreadyFollowUp,
      }),
    });

    if (!response.ok) return fallback;
    const parsed = await response.json();

    const PRIORITY: AnswerInsufficiencyReason[] = [
      "irrelevant",
      "lacks_evidence",
      "lacks_depth",
      "vague",
    ];
    const rawReason = parsed.insufficiency_reason as string | null | undefined;
    const insufficiencyReason: AnswerInsufficiencyReason | null =
      isTechnical && PRIORITY.includes(rawReason as AnswerInsufficiencyReason)
        ? (rawReason as AnswerInsufficiencyReason)
        : isVague
          ? "vague"
          : null;

    const rawAction = parsed.recommended_action;
    const recommendedAction = (
      (rawAction === "rephrase_primary" ||
        isExplicitClarification ||
        Boolean(parsed.requested_clarification)) &&
      canAdaptPrimary
        ? "rephrase_primary"
        : (rawAction === "follow_up" || isVague || insufficiencyReason) && canAdaptPrimary
          ? "follow_up"
          : "advance"
    ) as LiveAssessmentNote["recommended_action"];

    return {
      question_id: questionId,
      authenticity_signal: parsed.authenticity_signal || (isVague ? "vague" : "genuine"),
      depth_signal: parsed.depth_signal || (isVague ? "empty" : "surface"),
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      note:
        parsed.note || (isVague ? "Candidate gave a brief response." : "Clear answer provided."),
      follow_up_prompted:
        recommendedAction === "follow_up" || recommendedAction === "rephrase_primary",
      follow_up_question:
        recommendedAction === "follow_up"
          ? parsed.follow_up_direction || fallback.follow_up_question
          : undefined,
      rephrased_question:
        recommendedAction === "rephrase_primary"
          ? parsed.rephrase_direction || fallback.rephrased_question
          : undefined,
      insufficiency_reason: recommendedAction === "follow_up" ? insufficiencyReason : null,
      recommended_action: recommendedAction,
      requested_clarification:
        isExplicitClarification ||
        (recommendedAction === "rephrase_primary" && !parsed.answer_was_irrelevant),
      answer_was_irrelevant:
        recommendedAction === "rephrase_primary" && Boolean(parsed.answer_was_irrelevant),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 80)),
      competency_evidence: Array.isArray(parsed.competency_evidence)
        ? parsed.competency_evidence
        : [],
    };
  } catch (err) {
    console.warn("[analyzeAnswerInRealtime] n8n call failed, using fallback:", err);
    return fallback;
  }
}

export async function generateTargetedFollowUp(
  originalQuestion: string,
  candidateAnswer: string,
  insufficiencyReason: AnswerInsufficiencyReason,
  gapDirection: string,
  resumeText: string,
  jdText: string,
  mode: "follow_up" | "rephrase_primary" = "follow_up",
): Promise<string> {
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "targeted-followup",
        originalQuestion,
        candidateAnswer,
        insufficiencyReason,
        gapDirection,
        resumeText,
        jdText,
        mode,
      }),
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const parsed = await response.json();
    return (
      parsed.question_text ||
      gapDirection ||
      "Could you share a specific example that illustrates that?"
    );
  } catch {
    return gapDirection || "Could you walk me through a specific implementation example of that?";
  }
}

const TOTAL_WANTED_JOB_QUESTIONS = 10;

const STAGE_QUESTIONS: Array<{ q: string; type: QuestionResponse["question_type"] }> = [
  {
    q: "Could you walk me through your recent hands-on technical experience and the tools you use most frequently?",
    type: "technical",
  },
  {
    q: "What is an important technical trade-off or architectural decision you made in a recent project?",
    type: "technical",
  },
  {
    q: "How do you approach debugging a subtle production issue or performance bottleneck?",
    type: "technical",
  },
  {
    q: "Walk me through how you integrate automation workflows or external APIs into an existing application.",
    type: "technical",
  },
  {
    q: "Describe a complex technical problem where you had to learn an unfamiliar library or framework rapidly.",
    type: "situational",
  },
  {
    q: "Looking at the requirements for this role, how does your background in software engineering prepare you for this position?",
    type: "technical",
  },
  {
    q: "Tell me about a time you identified an area where process or test automation could save engineering time.",
    type: "situational",
  },
  {
    q: "How do you handle disagreement with a teammate over an engineering approach or code review feedback?",
    type: "cultural",
  },
  {
    q: "What kind of team environment and work culture helps you do your best, highest-impact work?",
    type: "cultural",
  },
  { q: "Where do you see yourself growing technically over the next year?", type: "cultural" },
];

export function getDynamicCandidateQuestion(
  totalQuestions: number,
  existingQuestions: string[],
  planItem?: InterviewPlanItem | null,
): QuestionResponse {
  if (planItem?.objective) {
    return {
      question_text: `To explore ${planItem.objective.toLowerCase()}, could you describe your practical approach and the trade-offs involved?`,
      question_type: planItem.question_type || "technical",
      follow_up_reason: "plan_item",
    };
  }

  const idx = Math.min(totalQuestions, STAGE_QUESTIONS.length - 1);
  const selected = STAGE_QUESTIONS[idx] || STAGE_QUESTIONS[0];
  return {
    question_text: selected.q,
    question_type: selected.type,
    follow_up_reason: "stage_progression",
  };
}

export async function generateInterviewerTurn(
  resumeText: string,
  jdText: string,
  history: HistoryItem[],
  totalQuestions: number,
  analysis: CandidateAnalysis | null,
  authenticitySignals: AuthenticitySignal[],
  lastAssessmentNote: LiveAssessmentNote | null,
  followUpCount: number,
  pendingQuestions: string[],
  allowFollowUp: boolean,
  planItem?: InterviewPlanItem | null,
  maxPrimaryQuestions = TOTAL_WANTED_JOB_QUESTIONS,
  maxFollowUps = 1,
  targetQuestion?: string,
  candidateRequestedClarification?: boolean,
  lastAnswerWordCount?: number,
  questionIsTechnical?: boolean,
  candidateAnswerWasIrrelevant?: boolean,
  sessionId?: string,
  accountId?: string,
  candidateId?: string,
): Promise<InterviewerTurn> {
  if (totalQuestions >= maxPrimaryQuestions && pendingQuestions.length === 0 && !targetQuestion) {
    return {
      interviewer_text:
        "That brings us to the end of the interview. Thank you so much for your time and for sharing your experience. Your responses have been successfully recorded. It is now safe to exit the interview.",
      question_text: "",
      turn_type: "closing" as InterviewerTurnType,
      should_continue: false,
    };
  }

  const shouldFollowUp =
    allowFollowUp &&
    !targetQuestion &&
    lastAssessmentNote?.follow_up_prompted &&
    lastAssessmentNote?.follow_up_question &&
    followUpCount < maxFollowUps;

  if (shouldFollowUp && lastAssessmentNote?.follow_up_question) {
    return {
      interviewer_text:
        "Thanks for explaining that. I'd like to explore one specific detail a bit further.",
      question_text: lastAssessmentNote.follow_up_question,
      turn_type: "follow_up",
      question_type: "technical",
      should_continue: true,
    };
  }

  // Attempt backend n8n call
  try {
    const lastAnswer = history[history.length - 1]?.answer || "";
    const lastQ = history[history.length - 1]?.question || "";
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate-turn",
        account_id: accountId,
        session_id: sessionId,
        candidate_id: candidateId,
        question: lastQ,
        answer: lastAnswer,
        response_transcript: lastAnswer,
        resumeText: resumeText || "",
        jdText: jdText || "",
        history: history.map((h) => ({ question: h.question, answer: h.answer, type: h.type })),
        totalQuestions,
        analysis,
        authenticitySignals,
        lastAssessmentNote,
        followUpCount,
        pendingQuestions,
        allowFollowUp,
        planItem,
        maxPrimaryQuestions,
        maxFollowUps,
        targetQuestion,
        candidateRequestedClarification: candidateRequestedClarification ?? false,
        lastAnswerWordCount: lastAnswerWordCount ?? 0,
        questionIsTechnical: questionIsTechnical !== false,
        candidateAnswerWasIrrelevant: candidateAnswerWasIrrelevant ?? false,
      }),
    });

    if (response.ok) {
      const parsed = await response.json();
      const questionText = parsed.question_text || parsed.prompt || targetQuestion || "";
      const interviewerText =
        parsed.interviewer_text ||
        (candidateRequestedClarification
          ? "No problem at all! Let's continue."
          : "Thank you for walking me through that.");

      if (parsed.is_final_question || parsed.turn_type === "closing") {
        return {
          interviewer_text:
            "Thank you so much for answering all the questions today. Your responses have been recorded.",
          question_text: "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
        };
      }

      if (!questionText) {
        throw new Error("Backend returned empty question text");
      }

      return {
        interviewer_text: interviewerText,
        question_text: questionText,
        turn_type: parsed.turn_type || "question",
        question_type: parsed.question_type || "technical",
        should_continue: parsed.should_continue !== false,
      };
    }
  } catch (err) {
    console.warn("[generateInterviewerTurn] n8n call failed, falling back:", err);
  }

  // Robust fallback
  if (targetQuestion) {
    return {
      interviewer_text: candidateRequestedClarification
        ? "No problem at all! Let's continue."
        : "Thanks for walking me through that.",
      question_text: targetQuestion,
      turn_type: "question",
      question_type: "technical",
      should_continue: true,
    };
  }

  const fallbackQ = getDynamicCandidateQuestion(totalQuestions, [], planItem);
  return {
    interviewer_text: "Thank you for walking me through that. Let's move on to the next topic.",
    question_text: fallbackQ.question_text,
    turn_type: "question",
    question_type: fallbackQ.question_type,
    should_continue: true,
  };
}
