import { getEnv } from "@/env";
import type {
  AnswerInsufficiencyReason,
  AuthenticitySignal,
  InterviewBlueprint,
  InterviewerTurn,
  InterviewerTurnType,
  InterviewPlanItem,
  JdTool,
  LiveAssessmentNote,
  ResumeJdAlignment,
} from "../types";

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

export function generateProbingFollowUp(_question: string, answer: string): string {
  const ans = (answer || "").toLowerCase();
  if (
    ans.includes("cache") ||
    ans.includes("redis") ||
    ans.includes("latency") ||
    ans.includes("performance") ||
    ans.includes("optimiz")
  ) {
    return "What specific cache invalidation strategy or metrics did you use to evaluate those performance gains?";
  }
  if (
    ans.includes("database") ||
    ans.includes("sql") ||
    ans.includes("postgres") ||
    ans.includes("mongo") ||
    ans.includes("schema") ||
    ans.includes("index")
  ) {
    return "How did you handle data consistency, indexing, or migration challenges in that implementation?";
  }
  if (
    ans.includes("microservice") ||
    ans.includes("service") ||
    ans.includes("architecture") ||
    ans.includes("kafka") ||
    ans.includes("queue")
  ) {
    return "How did you manage failure handling, retries, or network timeouts across those services?";
  }
  if (
    ans.includes("debug") ||
    ans.includes("issue") ||
    ans.includes("incident") ||
    ans.includes("error") ||
    ans.includes("bug")
  ) {
    return "What preventive monitoring or regression testing did you put in place to ensure the issue wouldn't recur?";
  }
  if (
    ans.includes("pipeline") ||
    ans.includes("deploy") ||
    ans.includes("ci") ||
    ans.includes("docker") ||
    ans.includes("kubernetes")
  ) {
    return "How did you balance deployment velocity against system stability and rollback safety in that pipeline?";
  }
  if (
    ans.includes("test") ||
    ans.includes("testing") ||
    ans.includes("unit test") ||
    ans.includes("qa")
  ) {
    return "How did you prioritize critical test coverage without slowing down development momentum?";
  }
  if (
    ans.includes("react") ||
    ans.includes("frontend") ||
    ans.includes("state") ||
    ans.includes("ui")
  ) {
    return "How did you manage state complexity and rendering performance as the user interface scaled?";
  }
  return "What was one key technical trade-off or constraint you faced in that approach, and how did you navigate it?";
}

export function generateContextualAcknowledgment(
  answer: string,
  question: string,
  index: number,
  turnType?: string,
  candidateRequestedClarification?: boolean,
): string {
  if (candidateRequestedClarification) {
    return "No problem at all! Let me clarify that point for you.";
  }

  const ans = (answer || "").toLowerCase().trim();
  const q = (question || "").toLowerCase().trim();

  // Handle intro question acknowledgment
  if (
    q.includes("how are you doing") ||
    q.includes("welcome to your interview") ||
    q.includes("to start off")
  ) {
    if (
      ans.includes("good") ||
      ans.includes("great") ||
      ans.includes("well") ||
      ans.includes("fine") ||
      ans.includes("doing well") ||
      ans.includes("excited")
    ) {
      return "Glad to hear that! It's great to have you with us today. Let's dive into your experience.";
    }
    return "Thanks for joining us today! It's great to meet you. Let's get started with our first topic.";
  }

  if (turnType === "follow_up") {
    if (
      ans.includes("cache") ||
      ans.includes("redis") ||
      ans.includes("latency") ||
      ans.includes("performance") ||
      ans.includes("optimiz")
    ) {
      return "Thanks for detailing your caching and performance strategy. Let's look a bit deeper into that approach.";
    }
    if (
      ans.includes("database") ||
      ans.includes("sql") ||
      ans.includes("postgres") ||
      ans.includes("mongo") ||
      ans.includes("schema") ||
      ans.includes("query")
    ) {
      return "Got it, that clarifies how you structured the data layer. I'd like to probe a bit further on that.";
    }
    if (
      ans.includes("service") ||
      ans.includes("api") ||
      ans.includes("architecture") ||
      ans.includes("microservice") ||
      ans.includes("system design")
    ) {
      return "Appreciate you explaining that architecture. Let's dig deeper into the design choices and trade-offs.";
    }
    if (
      ans.includes("debug") ||
      ans.includes("issue") ||
      ans.includes("incident") ||
      ans.includes("error") ||
      ans.includes("outage")
    ) {
      return "Thanks for walking through that troubleshooting workflow. Let's examine one specific detail a bit further.";
    }
    if (
      ans.includes("test") ||
      ans.includes("pipeline") ||
      ans.includes("ci") ||
      ans.includes("deploy") ||
      ans.includes("docker")
    ) {
      return "Understood, that gives good context on your deployment pipeline. Let's explore one aspect in more detail.";
    }
    const followUpAcks = [
      "Thanks for sharing that overview. Let's dig a bit deeper into that specific point.",
      "Appreciate that explanation. I'd like to explore one detail a bit further.",
      "That's a helpful starting point. Let's look closer at your reasoning there.",
      "Got it. I'd like to touch on one specific aspect of that approach.",
    ];
    return followUpAcks[index % followUpAcks.length];
  }

  // Standard turn acknowledgment: dynamically echo candidate's topic
  if (
    ans.includes("cache") ||
    ans.includes("redis") ||
    ans.includes("latency") ||
    ans.includes("performance") ||
    ans.includes("throughput") ||
    ans.includes("optimiz")
  ) {
    return "Thank you for detailing your approach to caching and latency optimization.";
  }
  if (
    ans.includes("microservice") ||
    ans.includes("architecture") ||
    ans.includes("kafka") ||
    ans.includes("event-driven") ||
    ans.includes("distributed") ||
    ans.includes("monolith")
  ) {
    return "Appreciate you breaking down your architectural design and service boundaries.";
  }
  if (
    ans.includes("postgres") ||
    ans.includes("mysql") ||
    ans.includes("database") ||
    ans.includes("sql") ||
    ans.includes("schema") ||
    ans.includes("index") ||
    ans.includes("queries")
  ) {
    return "Got it, that gives great clarity on how you structured the database queries and data model.";
  }
  if (
    ans.includes("debug") ||
    ans.includes("incident") ||
    ans.includes("outage") ||
    ans.includes("root cause") ||
    ans.includes("datadog") ||
    ans.includes("sentry") ||
    ans.includes("logs")
  ) {
    return "Thanks for walking through your debugging workflow and root-cause analysis.";
  }
  if (
    ans.includes("docker") ||
    ans.includes("kubernetes") ||
    ans.includes("k8s") ||
    ans.includes("ci/cd") ||
    ans.includes("pipeline") ||
    ans.includes("terraform") ||
    ans.includes("github actions")
  ) {
    return "Understood, having automated pipelines and reliable deployments is critical.";
  }
  if (
    ans.includes("react") ||
    ans.includes("next.js") ||
    ans.includes("frontend") ||
    ans.includes("component") ||
    ans.includes("tailwind") ||
    ans.includes("state management")
  ) {
    return "Thanks for explaining how you handled component structure and frontend state.";
  }
  if (
    ans.includes("test") ||
    ans.includes("unit test") ||
    ans.includes("integration") ||
    ans.includes("jest") ||
    ans.includes("vitest") ||
    ans.includes("cypress") ||
    ans.includes("coverage")
  ) {
    return "Understood, that highlights your commitment to automated testing and code quality.";
  }
  if (
    ans.includes("team") ||
    ans.includes("conflict") ||
    ans.includes("disagree") ||
    ans.includes("code review") ||
    ans.includes("mentor") ||
    ans.includes("stakeholder")
  ) {
    return "I appreciate that thoughtful perspective on team collaboration and technical communication.";
  }

  const standardAcks = [
    "Thank you for walking me through your approach and problem-solving process.",
    "Got it, that gives helpful context on how you tackled that.",
    "Thanks for explaining that clearly. Let's move to our next topic.",
    "Understood, that highlights your engineering reasoning well.",
    "Appreciate you sharing those details. Let's explore another area.",
  ];
  return standardAcks[index % standardAcks.length];
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
  const words = (answer || "").trim().split(/\s+/).filter(Boolean);
  const canAdaptPrimary = isTechnical && !isAlreadyFollowUp;

  const probingFollowUp = generateProbingFollowUp(question, answer);
  const fallbackAction = (
    isExplicitClarification && canAdaptPrimary
      ? "rephrase_primary"
      : canAdaptPrimary && (isVague || words.length >= 8)
        ? "follow_up"
        : "advance"
  ) as LiveAssessmentNote["recommended_action"];

  const fallback: LiveAssessmentNote = {
    question_id: questionId,
    authenticity_signal: isVague ? "vague" : "genuine",
    depth_signal: isVague ? "empty" : words.length > 20 ? "deep" : "surface",
    red_flags: [],
    note: isExplicitClarification
      ? "Candidate requested clarification."
      : isVague
        ? "Candidate gave a brief or uncertain answer."
        : "Answer recorded with substantive technical detail.",
    follow_up_prompted: fallbackAction === "rephrase_primary" || fallbackAction === "follow_up",
    rephrased_question:
      fallbackAction === "rephrase_primary"
        ? `Could you clarify or simplify the question: "${question}"?`
        : undefined,
    follow_up_question:
      fallbackAction === "follow_up"
        ? isVague
          ? `Could you walk me through a specific concrete example from your past projects regarding "${question}"?`
          : probingFollowUp
        : undefined,
    insufficiency_reason:
      fallbackAction === "follow_up" ? (isVague ? "vague" : "lacks_depth") : null,
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
          : words.length >= 8
            ? "lacks_depth"
            : null;

    const rawAction = parsed.recommended_action;
    const recommendedAction = (
      (rawAction === "rephrase_primary" ||
        isExplicitClarification ||
        Boolean(parsed.requested_clarification)) &&
      canAdaptPrimary
        ? "rephrase_primary"
        : (rawAction === "follow_up" || isVague || insufficiencyReason || words.length >= 8) &&
            canAdaptPrimary
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
          ? parsed.follow_up_direction || fallback.follow_up_question || probingFollowUp
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

function normalizeQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export function isSimilarQuestion(a: string, b: string): boolean {
  const normalizedA = normalizeQuestion(a);
  const normalizedB = normalizeQuestion(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;

  const importantWordsA = normalizedA.split(" ").filter((word) => word.length > 3);
  const importantWordsB = new Set(normalizedB.split(" ").filter((word) => word.length > 3));
  if (importantWordsA.length === 0 || importantWordsB.size === 0) return false;

  const overlap = importantWordsA.filter((word) => importantWordsB.has(word)).length;
  return overlap / Math.min(importantWordsA.length, importantWordsB.size) >= 0.65;
}

export function hasSimilarQuestionBeenAsked(
  question: string,
  existingQuestions: string[],
): boolean {
  return existingQuestions.some((item) => isSimilarQuestion(item, question));
}

export function getDynamicCandidateQuestion(
  totalQuestions: number,
  existingQuestions: string[],
  analysis?: CandidateAnalysis | null,
  planItem?: InterviewPlanItem | null,
  reason = "Dynamic candidate question",
): QuestionResponse {
  if (planItem?.objective && !hasSimilarQuestionBeenAsked(planItem.objective, existingQuestions)) {
    return {
      question_text: `To explore ${planItem.objective.toLowerCase()}, could you describe your practical approach and the trade-offs involved?`,
      question_type: planItem.question_type || "technical",
      follow_up_reason: "plan_item",
    };
  }

  // Inspect tools from candidate analysis
  const tools = analysis?.extractedTools || [];
  const unaskedTool = tools.find(
    (t) => t.name && !hasSimilarQuestionBeenAsked(t.name, existingQuestions),
  );
  if (unaskedTool) {
    const text = unaskedTool.mentioned_in_resume
      ? `Your background highlights experience with ${unaskedTool.name}. Could you detail how you applied ${unaskedTool.name} in your projects and the outcomes achieved?`
      : `This position utilizes ${unaskedTool.name}. How familiar are you with ${unaskedTool.name}, and how would you apply your technical knowledge to adopt it?`;
    return {
      question_text: text,
      question_type: "technical",
      follow_up_reason: reason,
    };
  }

  // Inspect candidate skills
  const skills = analysis?.skills || [];
  const unaskedSkill = skills.find(
    (s) => s.skill && !hasSimilarQuestionBeenAsked(s.skill, existingQuestions),
  );
  if (unaskedSkill) {
    return {
      question_text: `How have you applied ${unaskedSkill.skill} in your past roles, and what key trade-offs or decisions did you handle?`,
      question_type: "technical",
      follow_up_reason: reason,
    };
  }

  // Inspect stage questions that have not been asked yet
  const unaskedStageQ = STAGE_QUESTIONS.find(
    (sq) => !hasSimilarQuestionBeenAsked(sq.q, existingQuestions),
  );
  if (unaskedStageQ) {
    return {
      question_text: unaskedStageQ.q,
      question_type: unaskedStageQ.type,
      follow_up_reason: reason,
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
  _resumeText: string,
  _jdText: string,
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
  const allSessionQuestions = [
    ...history.map((h) => h.question),
    ...pendingQuestions,
    ...(targetQuestion ? [targetQuestion] : []),
  ];

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
    lastAssessmentNote?.follow_up_prompted &&
    lastAssessmentNote?.follow_up_question &&
    !hasSimilarQuestionBeenAsked(lastAssessmentNote.follow_up_question, allSessionQuestions) &&
    followUpCount < maxFollowUps;

  const lastItem = history[history.length - 1];
  const lastAnswer = lastItem?.answer || "";
  const lastQ = lastItem?.question || "";
  const lastQuestionId = lastItem?.id || "";

  if (shouldFollowUp && lastAssessmentNote?.follow_up_question) {
    const contextualAck = generateContextualAcknowledgment(
      lastAnswer,
      lastQ,
      totalQuestions,
      "follow_up",
      candidateRequestedClarification,
    );
    return {
      interviewer_text: contextualAck,
      question_text: lastAssessmentNote.follow_up_question,
      turn_type: "follow_up",
      question_type: "technical",
      should_continue: true,
    };
  }

  function isGreetingText(text: string): boolean {
    if (!text) return true;
    const lower = text.toLowerCase();
    return (
      lower.includes("hello and welcome") ||
      lower.includes("welcome to your interview") ||
      lower.includes("great to meet you") ||
      lower.includes("i'm alex") ||
      lower.includes("i am alex") ||
      lower.includes("guide you through") ||
      lower.includes("guiding your interview") ||
      lower.includes("thank you for joining") ||
      lower.includes("to start off") ||
      lower.includes("how are you doing today")
    );
  }

  // Attempt backend n8n call
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        question_id: lastQuestionId || null,
        answer_text: lastAnswer,
        response_transcript: lastAnswer,
        action: "generate-turn",
        account_id: accountId,
        candidate_id: candidateId,
        question: lastQ,
        answer: lastAnswer,
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
      const rawAck = (parsed.interviewer_text || "").trim();

      // For any turn answering a question (turns > 0 or with history), never repeat opening greeting
      const interviewerText =
        isGreetingText(rawAck) || !rawAck
          ? generateContextualAcknowledgment(
              lastAnswer,
              lastQ,
              totalQuestions,
              parsed.turn_type,
              candidateRequestedClarification,
            )
          : rawAck;

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

      if (!targetQuestion && hasSimilarQuestionBeenAsked(questionText, allSessionQuestions)) {
        console.warn(
          "[generateInterviewerTurn] Duplicate question detected, choosing unique next question",
        );
        const fallback = getDynamicCandidateQuestion(
          totalQuestions,
          allSessionQuestions,
          analysis,
          planItem,
          "repeated question prevented",
        );
        return {
          interviewer_text: interviewerText,
          question_text: fallback.question_text,
          turn_type: "question",
          question_type: fallback.question_type,
          should_continue: true,
        };
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
  if (
    targetQuestion &&
    !hasSimilarQuestionBeenAsked(
      targetQuestion,
      history.map((h) => h.question),
    )
  ) {
    return {
      interviewer_text: generateContextualAcknowledgment(
        lastAnswer,
        lastQ,
        totalQuestions,
        "question",
        candidateRequestedClarification,
      ),
      question_text: targetQuestion,
      turn_type: "question",
      question_type: "technical",
      should_continue: true,
    };
  }

  const fallbackQ = getDynamicCandidateQuestion(
    totalQuestions,
    allSessionQuestions,
    analysis,
    planItem,
  );
  return {
    interviewer_text: generateContextualAcknowledgment(
      lastAnswer,
      lastQ,
      totalQuestions,
      "question",
      candidateRequestedClarification,
    ),
    question_text: fallbackQ.question_text,
    turn_type: "question",
    question_type: fallbackQ.question_type,
    should_continue: true,
  };
}

export async function analyzeCandidateFit(
  resumeText: string,
  jdText: string,
): Promise<CandidateAnalysis> {
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "analyze-fit", resumeText, jdText }),
    });
    if (!response.ok) throw new Error(`n8n analyze-fit failed: ${response.status}`);
    const parsed = (await response.json()) as Record<string, unknown>;
    const rawSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
    const skills = rawSkills.map((s: Record<string, unknown>) => ({
      skill: String(s.skill || ""),
      source: String(s.source || "jd_required") as SkillAssessment["source"],
      status: String(s.status || "match").toLowerCase() as SkillAssessment["status"],
      evidence: String(s.evidence || ""),
      priority: Number(s.priority) || 5,
    }));
    return {
      skills,
      projectMappings: Array.isArray(parsed.projectMappings) ? parsed.projectMappings : [],
      summary: (parsed.summary as string) || "",
    };
  } catch (err) {
    console.warn("[analyzeCandidateFit] n8n call failed, returning fallback:", err);
    return { skills: [], projectMappings: [], summary: "Skill analysis unavailable." };
  }
}

export async function extractJdToolsAndTech(resumeText: string, jdText: string): Promise<JdTool[]> {
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract-tools", resumeText, jdText }),
    });
    if (!response.ok) throw new Error(`n8n extract-tools failed: ${response.status}`);
    const parsed = (await response.json()) as Record<string, unknown>;
    if (!Array.isArray(parsed.tools)) return [];
    return parsed.tools.map((t: Record<string, unknown>) => ({
      name: String(t.name || ""),
      category: String(t.category || "General"),
      importance: String(t.importance || "nice_to_have") as JdTool["importance"],
      mentioned_in_resume: Boolean(t.mentioned_in_resume),
      resume_context: t.resume_context ? String(t.resume_context) : null,
    }));
  } catch (err) {
    console.warn("[extractJdToolsAndTech] n8n call failed, returning empty list:", err);
    return [];
  }
}
