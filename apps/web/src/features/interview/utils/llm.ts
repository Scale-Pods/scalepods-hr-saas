// Technical Interview Engine — automated deployment verification
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

export type CandidateAnswerIntent =
  | "clarification_request"
  | "refusal"
  | "uncertain_or_unknown"
  | "greeting_or_social"
  | "substantive_answer";

export function isClarificationRequested(answer: string): boolean {
  const text = (answer || "").toLowerCase().trim();
  if (!text) return false;
  return /\b(clarify|clarification|rephrase|repeat|pardon|elaborate|can'?t understand|cannot understand|don'?t understand|do not understand|didn'?t understand|did not understand|what do you mean|what does that mean|what is meant|explain the question|explain what you mean|could you explain|can you explain)\b/i.test(
    text,
  );
}

export function detectCandidateIntent(answer: string, question?: string): CandidateAnswerIntent {
  const text = (answer || "").toLowerCase().trim();
  if (!text) return "uncertain_or_unknown";
  const words = text.split(/\s+/).filter(Boolean);

  // 1. Refusal or Skip request
  if (
    /(\bi\s+(will\s+not|won'?t|refuse\s+to|do\s+not\s+want\s+to|prefer\s+not\s+to)\s+answer\b|\b(skip|pass|next\s+question|skip\s+this|pass\s+this)\b|\bno\s+comment\b)/i.test(
      text,
    )
  ) {
    return "refusal";
  }

  // 2. Explicit Clarification, Premise Dispute, or Confusion request
  if (
    isClarificationRequested(text) ||
    /(\b(can('?t|not)|\bdo(n'?t)?)\s+(understand|get\s+it)\b|\b(can|could|please)\s+(you\s+)?(elaborat\w*|explain|clarif\w*|rephrase|repeat|simplify)\b|\bwhat\s+(do\s+you\s+mean|does\s+that\s+mean|are\s+you\s+talking\s+about|project\s+are\s+you)\b|\b(which\s+(project|approach|system)|never\s+mentioned|not\s+(on|in)\s+my\s+resume|making\s+things\s+up)\b|\bmore\s+details?\b)/i.test(
      text,
    )
  ) {
    return "clarification_request";
  }

  // 3. Unknown / Unsure / No experience
  if (
    isVagueOrUncertainAnswer(text) ||
    /(\b(i\s+)?(don'?t|do\s+not)\s+know\b|\bno\s+idea\b|\bnot\s+sure\b|\bnever\s+worked\s+(with|on)\b|\bhave(n'?t| not)\s+(used|worked|done)\b|\bno\s+experience\b)/i.test(
      text,
    )
  ) {
    return "uncertain_or_unknown";
  }

  // 4. Greeting or Social Intro response
  const q = (question || "").toLowerCase();
  if (
    (q.includes("how are you") || q.includes("welcome") || q.includes("start off")) &&
    words.length <= 15
  ) {
    return "greeting_or_social";
  }

  // 5. Very brief non-answer (1-3 tokens) without any identified topic
  if (words.length < 4 && !extractAnswerEntities(answer).primaryTopic) {
    return "uncertain_or_unknown";
  }

  return "substantive_answer";
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

export function inferQuestionType(
  questionText: string,
  rawType?: string,
): "technical" | "behavioral" | "situational" | "cultural" {
  const text = (questionText || "").toLowerCase();

  // Intro greeting turn
  if (text.includes("how are you doing today") || text.includes("welcome to your interview")) {
    return "cultural";
  }

  // Behavioral keywords must precede generic technical keywords (e.g. "technical disagreement")
  if (
    text.includes("teammate") ||
    text.includes("disagree") ||
    text.includes("conflict") ||
    text.includes("collaborat") ||
    text.includes("feedback") ||
    text.includes("stakeholder") ||
    text.includes("communication")
  ) {
    return "behavioral";
  }

  // Situational keywords must precede generic technical keywords (e.g. "incident while working on an n8n workflow")
  if (
    text.includes("tell me about a time") ||
    text.includes("describe a time") ||
    text.includes("describe a complex problem") ||
    text.includes("if you faced") ||
    text.includes("how would you approach") ||
    text.includes("how would you handle")
  ) {
    return "situational";
  }

  // Technical keywords
  if (
    text.includes("technical") ||
    text.includes("technically") ||
    text.includes("hands-on") ||
    text.includes("code") ||
    text.includes("coding") ||
    text.includes("architect") ||
    text.includes("database") ||
    text.includes("sql") ||
    text.includes("nosql") ||
    text.includes("postgres") ||
    text.includes("api") ||
    text.includes("endpoint") ||
    text.includes("debug") ||
    text.includes("bottleneck") ||
    text.includes("performance") ||
    text.includes("latency") ||
    text.includes("cache") ||
    text.includes("framework") ||
    text.includes("library") ||
    text.includes("system") ||
    text.includes("trade-off") ||
    text.includes("automation") ||
    text.includes("workflow") ||
    text.includes("tools") ||
    text.includes("pipeline") ||
    text.includes("microservice") ||
    text.includes("distributed") ||
    text.includes("cloud") ||
    text.includes("docker") ||
    text.includes("kubernetes") ||
    text.includes("react") ||
    text.includes("software engineering") ||
    text.includes("n8n")
  ) {
    return "technical";
  }

  // Cultural keywords
  if (
    text.includes("team environment") ||
    text.includes("work culture") ||
    text.includes("values") ||
    text.includes("culture")
  ) {
    return "cultural";
  }

  const validTypes: Array<"technical" | "behavioral" | "situational" | "cultural"> = [
    "technical",
    "behavioral",
    "situational",
    "cultural",
  ];
  if (rawType && validTypes.includes(rawType as "technical")) {
    return rawType as "technical" | "behavioral" | "situational" | "cultural";
  }

  return "technical";
}

export interface ExtractedAnswerDetails {
  matchedKeywords: string[];
  primaryTopic: string;
}

export function extractAnswerEntities(answer: string): ExtractedAnswerDetails {
  const ans = (answer || "").toLowerCase();
  const candidates: Array<{ key: string; match: RegExp }> = [
    // Multi-model failover & resilience
    {
      key: "LLM failover and fallback architecture",
      match:
        /\b(groq|gemini|openai|anthropic|claude|llm|model)\b.*\b(fallback|failover|downtime|resilience|timeout)\b|\b(fallback|failover|downtime|resilience|timeout)\b.*\b(groq|gemini|openai|anthropic|claude|llm|model)\b/i,
    },
    { key: "Gemini and Groq integration", match: /\b(groq|gemini)\b/i },
    {
      key: "LLM engineering and prompt orchestration",
      match: /\b(llm|llms|gpt-4|gpt|anthropic|claude|openai|genai|generative ai)\b/i,
    },
    {
      key: "AI assessment and interview systems",
      match: /\b(skillgap|skill gap|authenticity|ai interview)\b/i,
    },
    // Strict grounding: Only tag specific brand/tools if literally mentioned
    { key: "Redis caching", match: /\bredis\b/i },
    { key: "caching and data retrieval", match: /\b(cache|cached|caching|memcached)\b/i },
    {
      key: "latency and performance optimization",
      match: /\b(latency|throughput|performance|bottleneck|optimiz\w*)\b/i,
    },
    { key: "PostgreSQL", match: /\b(postgres|postgresql)\b/i },
    { key: "MongoDB", match: /\b(mongo|mongodb)\b/i },
    {
      key: "database queries and data modeling",
      match: /\b(database|databases|sql|mysql|schema|indexing|query|queries)\b/i,
    },
    {
      key: "microservices and API architecture",
      match: /\b(microservice|microservices|api|apis|rest|graphql|grpc|endpoint|endpoints)\b/i,
    },
    { key: "Kafka streaming", match: /\bkafka\b/i },
    {
      key: "asynchronous messaging and queues",
      match: /\b(rabbitmq|queue|queues|event-driven|pubsub|pub-sub)\b/i,
    },
    { key: "Kubernetes orchestration", match: /\b(kubernetes|k8s)\b/i },
    {
      key: "containerization and deployment",
      match: /\b(docker|container|containers|containerized|helm)\b/i,
    },
    {
      key: "CI/CD and deployment pipelines",
      match: /\b(ci\/cd|pipeline|pipelines|deploy|deployment|github actions|jenkins|terraform)\b/i,
    },
    {
      key: "debugging and production incident resolution",
      match: /\b(debug|debugging|incident|outage|root cause|datadog|sentry|logs|monitoring)\b/i,
    },
    {
      key: "React and frontend state management",
      match: /\b(react|next\.js|nextjs|vue|angular|frontend|state management|tailwind|css)\b/i,
    },
    {
      key: "automated testing and test suites",
      match: /\b(test|testing|unit test|integration test|jest|vitest|cypress|coverage)\b/i,
    },
    {
      key: "team collaboration and code reviews",
      match: /\b(code review|pr|pull request|stakeholder|teammate|mentor|leadership)\b/i,
    },
    {
      key: "LangChain and AI agent pipelines",
      match: /\b(langchain|langgraph|agent|agents|rag|prompt chaining)\b/i,
    },
    { key: "n8n and workflow automation", match: /\b(n8n|webhook|webhooks)\b/i },
    { key: "Python and backend services", match: /\b(python|django|fastapi|flask)\b/i },
    { key: "Node.js and TypeScript services", match: /\b(node|nodejs|typescript|express|nest)\b/i },
  ];

  const matched: string[] = [];
  for (const c of candidates) {
    if (c.match.test(ans)) {
      matched.push(c.key);
    }
  }

  const primaryTopic = matched[0] || "";
  return { matchedKeywords: matched, primaryTopic };
}

export function isGenericAcknowledgment(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);

  // Very short phrases under 5 words without content are generic fillers
  if (words.length <= 4) return true;

  // Exact matches of known robotic canned templates that lack candidate-specific context
  const cannedTemplates = [
    "that's a helpful starting point. let's look closer at your reasoning there.",
    "got it, that gives helpful background on how you tackled that.",
    "got it, thanks for explaining your approach and problem-solving process.",
    "makes sense, that highlights your engineering reasoning well.",
    "appreciate you sharing that context. let's move to our next topic.",
  ];
  if (cannedTemplates.some((t) => lower.startsWith(t) || lower === t)) {
    return true;
  }

  return false;
}

/**
 * Validates that an AI-generated follow-up question does not hallucinate or introduce
 * specific brand-name infrastructure, databases, or orchestrators that were never mentioned
 * by the candidate or in the question prompt.
 */
export function isFollowUpGrounded(
  followUpText: string,
  candidateAnswer: string,
  originalQuestion: string,
): boolean {
  if (!followUpText) return false;
  const followUp = followUpText.toLowerCase();
  const context = `${(candidateAnswer || "").toLowerCase()} ${(originalQuestion || "").toLowerCase()}`;

  // High-risk proprietary technologies that must NOT be hallucinated if absent from context
  const specificTechTools = [
    "redis",
    "kubernetes",
    "k8s",
    "kafka",
    "elasticsearch",
    "cassandra",
    "dynamodb",
    "rabbitmq",
    "terraform",
    "ansible",
  ];

  for (const tool of specificTechTools) {
    const pattern = new RegExp(`\\b${tool}\\b`, "i");
    if (pattern.test(followUp) && !pattern.test(context)) {
      return false;
    }
  }

  return true;
}

export function generateProbingFollowUp(_question: string, answer: string): string {
  const { primaryTopic } = extractAnswerEntities(answer);
  const ans = (answer || "").toLowerCase();

  // 0. AI / LLM Multi-model Failover & Resilience
  if (
    /\b(groq|gemini|openai|anthropic|claude|llm|model)\b/i.test(ans) &&
    /\b(fallback|failover|downtime|latency|timeout|uptime)\b/i.test(ans)
  ) {
    return "When configuring that fallback between LLMs to prevent downtime, how did you detect error conditions or latency spikes, and how did you manage differences in response format or token latency between the models?";
  }
  if (/\b(groq|gemini)\b/i.test(ans)) {
    return "When working with Gemini and Groq, what latency, throughput, or cost trade-offs influenced how you routed prompts between them?";
  }
  if (/\b(skillgap|skill gap|authenticity|ai interview)\b/i.test(ans)) {
    return "In that authenticity evaluation engine, how did you analyze candidate responses in real-time, and what metrics did you use to detect rehearsed versus hands-on answers?";
  }

  // 1. Caching: Only mention Redis if the candidate specifically named Redis
  if (/\bredis\b/i.test(ans)) {
    return "When implementing Redis caching to reduce latency, what cache invalidation or TTL strategy did you use, and how did you verify the performance gains?";
  }
  if (/\b(cache|caching|memcached)\b/i.test(ans)) {
    return "When implementing caching to reduce latency and system load, what cache invalidation or TTL strategy did you use, and how did you verify the performance gains?";
  }

  // 2. Containers & Orchestration: Only mention Kubernetes if the candidate specifically named Kubernetes/k8s
  if (/\b(kubernetes|k8s)\b/i.test(ans)) {
    return "When managing workloads on Kubernetes, how did you configure container health probes, resource limits, and zero-downtime rolling updates?";
  }
  if (/\b(docker|container|containers|helm)\b/i.test(ans)) {
    return "When containerizing your services, how did you structure your container images, resource constraints, and deployment workflow?";
  }

  // 3. Queues & Streaming: Only mention Kafka if the candidate specifically named Kafka
  if (/\bkafka\b/i.test(ans)) {
    return "When working with Kafka, how did you handle consumer offset commits, partition rebalancing, and retry dead-letter queues?";
  }
  if (/\b(queue|queues|rabbitmq|event-driven|pubsub|pub-sub)\b/i.test(ans)) {
    return "When designing asynchronous messaging or queues, how did you guarantee message delivery, handle retries, and manage queue backpressure?";
  }

  // 4. Databases
  if (/\b(postgres|postgresql)\b/i.test(ans)) {
    return "How did you handle query indexing, schema migrations, and connection pooling in PostgreSQL?";
  }
  if (/\b(mongo|mongodb)\b/i.test(ans)) {
    return "How did you structure your document schemas, indexing strategies, and aggregation pipelines in MongoDB?";
  }
  if (/\b(database|sql|mysql|schema|indexing|query|queries)\b/i.test(ans)) {
    return "How did you handle query indexing, schema migrations, or data consistency guarantees in that database setup?";
  }

  // 5. APIs and Microservices
  if (/\b(microservice|microservices|api|apis|rest|graphql|grpc|endpoint|endpoints)\b/i.test(ans)) {
    return "How did you design failure handling, circuit breaking, or backwards compatibility across those API endpoints?";
  }

  // 6. CI/CD & Deployments
  if (
    /\b(ci\/cd|pipeline|pipelines|deploy|deployment|github actions|jenkins|terraform)\b/i.test(ans)
  ) {
    return "How did you balance deployment velocity against system stability and rollback safety in that pipeline?";
  }

  // 7. Debugging & Incidents
  if (
    /\b(debug|debugging|incident|outage|root cause|datadog|sentry|logs|monitoring)\b/i.test(ans)
  ) {
    return "Once you identified the root cause, what preventive alerts, observability metrics, or regression tests did you put in place?";
  }

  // 8. Frontend & UI
  if (/\b(react|next\.js|nextjs|vue|angular|frontend|state management|tailwind|css)\b/i.test(ans)) {
    return "How did you manage component state synchronization and rendering performance as the user interface scaled?";
  }

  // 9. Testing
  if (/\b(test|testing|unit test|integration test|jest|vitest|cypress|coverage)\b/i.test(ans)) {
    return "How did you balance mock dependencies against realistic integration tests in that test suite?";
  }

  // 10. Automation & Workflows
  if (/\b(langchain|langgraph)\b/i.test(ans)) {
    return "When building with LangChain, how did you handle state management, tool execution error recovery, and context window limits?";
  }
  if (/\b(agent|agents)\b/i.test(ans)) {
    return "When architecting those AI agents, how did you manage prompt chaining, tool execution reliability, and token latency trade-offs?";
  }
  if (/\bn8n\b/i.test(ans)) {
    return "When connecting n8n workflows, how did you handle asynchronous worker execution, retry logic, and webhook failure fallbacks?";
  }
  if (/\b(automation|webhook|webhooks)\b/i.test(ans)) {
    return "When designing those automation workflows and webhooks, how did you handle retry policies and failure handling?";
  }

  if (primaryTopic) {
    return `Looking closer at your work with ${primaryTopic}, what was one of the key trade-offs you had to make, and what alternative approach did you consider?`;
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
  const intent = detectCandidateIntent(answer, question);

  // 1. Explicit Clarification or Elaboration Request
  if (candidateRequestedClarification || intent === "clarification_request") {
    const clarificationAcks = [
      "No problem at all, let me clarify that for you.",
      "Certainly, let me break that down in simpler terms.",
      "Of course, happy to elaborate on that for you.",
    ];
    return clarificationAcks[index % clarificationAcks.length];
  }

  // 2. Explicit Refusal or Skip Request ("I will not answer this", "skip", "pass")
  if (intent === "refusal") {
    const refusalAcks = [
      "Understood, no problem at all. Let's move on to the next question.",
      "That's completely fine, we can skip that. Let's proceed.",
      "No worries, let's move forward to our next topic.",
    ];
    return refusalAcks[index % refusalAcks.length];
  }

  // 3. Uncertain / Unknown / No Experience ("I don't know", "not sure", "no idea")
  if (intent === "uncertain_or_unknown") {
    const unknownAcks = [
      "No worries at all, that is completely fine. Let's move to our next technical subject.",
      "Understood. Let's explore a different area of your background.",
      "That's perfectly okay. Let's shift into another key engineering area.",
    ];
    return unknownAcks[index % unknownAcks.length];
  }

  // 4. Greeting or Social Intro Response
  if (intent === "greeting_or_social") {
    return "Good to have you here. Let's dive straight into your technical experience.";
  }

  const { primaryTopic } = extractAnswerEntities(answer);

  // 5. Follow-up turn acknowledgment
  if (turnType === "follow_up") {
    if (primaryTopic) {
      return `Understood. Your explanation of ${primaryTopic} gives helpful technical context; let's drill into that specific decision.`;
    }
    const followUpAcks = [
      "That is a clear technical overview. Let's drill down into that specific design choice.",
      "Understood. I'd like to probe a bit deeper into the trade-offs you faced there.",
      "Appreciate the explanation. Let's examine the edge cases of that approach.",
    ];
    return followUpAcks[index % followUpAcks.length];
  }

  // 6. Substantive Answer with identified primary topic
  if (primaryTopic) {
    return `Thank you for sharing those details on ${primaryTopic}. Let's continue with the next point.`;
  }

  return "Understood, thank you for sharing that context. Let's proceed to the next question.";
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
        : (rawAction === "follow_up" || Boolean(insufficiencyReason)) && canAdaptPrimary
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
          ? parsed.follow_up_direction &&
            isFollowUpGrounded(parsed.follow_up_direction, answer, question) &&
            !parsed.follow_up_direction.includes("fundamental concepts you do know") &&
            !parsed.follow_up_direction.includes("Could you share any related experience")
            ? parsed.follow_up_direction
            : fallback.follow_up_question || probingFollowUp
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
  sessionId?: string,
  accountId?: string,
  candidateId?: string,
): Promise<string> {
  const dynamicProbing = generateProbingFollowUp(originalQuestion, candidateAnswer);
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "targeted-followup",
        session_id: sessionId,
        account_id: accountId,
        candidate_id: candidateId,
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
    const candidateQ = (parsed.question_text || gapDirection || "").trim();
    if (
      !candidateQ ||
      !isFollowUpGrounded(candidateQ, candidateAnswer, originalQuestion) ||
      candidateQ.includes("Could you share a specific example that illustrates that?") ||
      candidateQ.includes("Could you walk me through a specific implementation example") ||
      candidateQ.includes("Could you share any related experience")
    ) {
      return dynamicProbing;
    }
    return candidateQ;
  } catch {
    return dynamicProbing;
  }
}

const TOTAL_WANTED_JOB_QUESTIONS = 10;

const STAGE_QUESTIONS: Array<{ q: string; type: QuestionResponse["question_type"] }> = [
  {
    q: "Looking across the projects on your resume, which system represents your most complex hands-on engineering work? Walk me through the core architecture, the technologies you chose, and why.",
    type: "technical",
  },
  {
    q: "In that system, what was the most critical technical trade-off you faced — around latency, scaling, consistency, or cost — and what data or constraints drove your final architectural decision?",
    type: "technical",
  },
  {
    q: "Walk me through a severe production incident, memory leak, or performance bottleneck you personally debugged. What observability tools, logs, or profiling techniques did you use to isolate the root cause?",
    type: "technical",
  },
  {
    q: "When calling external APIs, webhooks, or third-party services in your projects, how did you handle idempotency, retry logic, and partial failure scenarios to guarantee data consistency?",
    type: "technical",
  },
  {
    q: "Describe a situation where you had to adopt a database, framework, or infrastructure technology you had not used before. How did you evaluate it, validate its production readiness, and de-risk the integration?",
    type: "technical",
  },
  {
    q: "How have you handled database schema migrations, query optimization, or indexing on live production data without causing downtime or lock contention? Give me a specific example from your work.",
    type: "technical",
  },
  {
    q: "In any of your past projects, how did you design for resilience — rate limiting, circuit breaking, graceful degradation, or queue-based decoupling — when downstream services became unreliable?",
    type: "technical",
  },
  {
    q: "Describe a manual or error-prone engineering process you automated. What was the trigger, what did you build, and what measurable impact did it have on reliability or engineering velocity?",
    type: "technical",
  },
  {
    q: "Tell me about a significant technical decision in one of your projects that turned out to be wrong or needed rework in production. What led to that decision, and what did you change once you recognized it?",
    type: "technical",
  },
  {
    q: "Looking at the technical requirements of this role against your resume, where do you see the most significant gap in your current experience, and how have you been addressing it?",
    type: "technical",
  },
];

export function extractProjectsFromResume(resumeText: string): string[] {
  if (!resumeText) return [];
  const projects: string[] = [];
  const patterns = [
    /(?:^|\n)\s*([A-Z][A-Za-z0-9_\s]{2,35}?)\s*[—–-]\s*(?:AI|Python|FastAPI|React|Smart|Real|End|Built|Designed)/gi,
    /(?:SkillGap\s*AI|Crop\s*Price\s*and\s*Yield\s*Prediction|ScalePods|Deccan\s*AI)/gi,
    /(?:project[s]?\s*[:\-–]\s*|\bbuilt\s+|\bdeveloped\s+|\barchitected\s+|\bdesigned\s+)([A-Z0-9][A-Za-z0-9_\-\s]{2,30}?)(?=[,.\n\r()]|(?:\s+using|\s+with|\s+to|\s+for|\s+at))/gi,
    /(?:^|\n)\s*[-•*]?\s*([A-Z][A-Za-z0-9_\-\s]{2,25})\s*[:\-–]\s*(?:an?|the|built|developed)/gi,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(resumeText);
    while (match !== null) {
      const name = (match[1] || match[0] || "").trim().replace(/^PROJECTS?\s*/i, "");
      if (
        name.length >= 3 &&
        name.length <= 40 &&
        !/^(the|an?|this|and|with|from|using|which|that|experience|worked|responsible|designed|built)$/i.test(
          name,
        )
      ) {
        if (!projects.includes(name)) {
          projects.push(name);
        }
      }
      match = pattern.exec(resumeText);
    }
  }
  return projects.slice(0, 5);
}

export function sanitizeQuestionPlaceholders(
  questionText: string,
  resumeText?: string,
  _jdText?: string,
): string {
  if (!questionText?.includes("[")) return questionText;

  let text = questionText;
  const projects = resumeText ? extractProjectsFromResume(resumeText) : [];

  // Find candidate tools/technologies mentioned in resume
  const candidateTools: string[] = [];
  if (resumeText) {
    const techWords = [
      "n8n",
      "Groq",
      "Gemini",
      "Claude",
      "FastAPI",
      "Flask",
      "Supabase",
      "PostgreSQL",
      "Python",
      "React",
      "Next.js",
      "Node.js",
      "TypeScript",
      "JavaScript",
      "Redis",
      "Kafka",
      "GraphQL",
      "Docker",
      "Kubernetes",
      "AWS",
    ];
    for (const tw of techWords) {
      if (new RegExp(`\\b${tw}\\b`, "i").test(resumeText)) {
        candidateTools.push(tw);
      }
    }
  }
  const primaryTool = candidateTools[0] || "your core engineering tools";
  const secondaryTool = candidateTools[1] || candidateTools[0] || "your primary backend frameworks";

  // 1. [specific project] and variations
  text = text.replace(
    /\[specific project\/system\]/gi,
    projects[0] ? `"${projects[0]}"` : "your recent project",
  );
  text = text.replace(
    /\[specific project or technology\]/gi,
    projects[0] ? `"${projects[0]}"` : primaryTool,
  );
  text = text.replace(
    /\[specific project\]/gi,
    projects[0] ? `"${projects[0]}"` : "your recent production systems",
  );

  // 2. [specific tool/framework...] and variations
  text = text.replace(/\[specific tool\/framework[^\]]*\]/gi, primaryTool);
  text = text.replace(/\[specific tool[^\]]*\]/gi, primaryTool);
  text = text.replace(/\[specific framework[^\]]*\]/gi, secondaryTool);

  // 3. [missing technology...]
  text = text.replace(/\[missing technology[^\]]*\]/gi, "modern distributed architectures");

  // 4. Any remaining [bracketed] placeholders
  text = text.replace(
    /\[(?:project|system|application)[^\]]*\]/gi,
    projects[0] ? `"${projects[0]}"` : "your core system",
  );
  text = text.replace(/\[(?:tool|framework|technology|database|library)[^\]]*\]/gi, secondaryTool);
  text = text.replace(/\[[^\]]+\]/g, ""); // Strip any remaining brackets

  // 5. Clean whitespace and punctuation
  text = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,?.!])/g, "$1")
    .trim();
  return text;
}

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
  resumeText?: string,
  _jdText?: string,
): QuestionResponse {
  if (planItem?.objective && !hasSimilarQuestionBeenAsked(planItem.objective, existingQuestions)) {
    return {
      question_text: `To explore ${planItem.objective.toLowerCase()}, could you describe your practical approach and the trade-offs involved?`,
      question_type: planItem.question_type || "technical",
      follow_up_reason: "plan_item",
    };
  }

  // 1. Inspect specific project mappings from candidate analysis
  const projectMappings = analysis?.projectMappings || [];
  const unaskedProjectMapping = projectMappings.find(
    (p) => p.resumeProject && !hasSimilarQuestionBeenAsked(p.resumeProject, existingQuestions),
  );
  if (unaskedProjectMapping) {
    const text = unaskedProjectMapping.relatedJdRequirement
      ? `Looking at your work on "${unaskedProjectMapping.resumeProject}", how did you architect that system to meet the demands of ${unaskedProjectMapping.relatedJdRequirement.toLowerCase()}, and what key technical trade-offs did you make?`
      : `In your project "${unaskedProjectMapping.resumeProject}", could you walk me through the system architecture you designed and one of the toughest technical challenges you personally solved?`;
    return {
      question_text: text,
      question_type: "technical",
      follow_up_reason: "resume_project_deep_dive",
    };
  }

  // 2. Inspect raw extracted projects from resumeText
  if (resumeText) {
    const extractedProjects = extractProjectsFromResume(resumeText);
    const unaskedResumeProject = extractedProjects.find(
      (proj) => !hasSimilarQuestionBeenAsked(proj, existingQuestions),
    );
    if (unaskedResumeProject) {
      return {
        question_text: `In your project "${unaskedResumeProject}", could you walk me through the system architecture you designed, the primary tools you selected, and the key engineering trade-offs you navigated?`,
        question_type: "technical",
        follow_up_reason: "resume_project_extracted",
      };
    }
  }

  // 3. Inspect tools from candidate analysis
  const tools = analysis?.extractedTools || [];
  const unaskedTool = tools.find(
    (t) => t.name && !hasSimilarQuestionBeenAsked(t.name, existingQuestions),
  );
  if (unaskedTool) {
    const text = unaskedTool.mentioned_in_resume
      ? `Your background highlights experience with ${unaskedTool.name}${unaskedTool.resume_context ? ` in ${unaskedTool.resume_context}` : ""}. Could you detail how you applied ${unaskedTool.name} in your projects and the architectural trade-offs you made?`
      : `This position utilizes ${unaskedTool.name}. How familiar are you with ${unaskedTool.name}, and how would you apply your technical knowledge to adopt it?`;
    return {
      question_text: text,
      question_type: "technical",
      follow_up_reason: reason,
    };
  }

  // 4. Inspect candidate skills
  const skills = analysis?.skills || [];
  const unaskedSkill = skills.find(
    (s) => s.skill && !hasSimilarQuestionBeenAsked(s.skill, existingQuestions),
  );
  if (unaskedSkill) {
    return {
      question_text: `How have you applied ${unaskedSkill.skill} in your past roles or projects, and what key trade-offs or technical decisions did you handle?`,
      question_type: "technical",
      follow_up_reason: reason,
    };
  }

  // 5. Inspect stage questions (all technical) that have not been asked yet
  const unaskedStageQ = STAGE_QUESTIONS.find(
    (sq) => !hasSimilarQuestionBeenAsked(sq.q, existingQuestions),
  );
  if (unaskedStageQ) {
    return {
      question_text: unaskedStageQ.q,
      question_type: "technical",
      follow_up_reason: reason,
    };
  }

  const idx = Math.min(totalQuestions, STAGE_QUESTIONS.length - 1);
  const selected = STAGE_QUESTIONS[idx] || STAGE_QUESTIONS[0];
  return {
    question_text: selected.q,
    question_type: "technical",
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
  candidateName?: string,
  currentQuestionType?: string,
  isAlreadyFollowUp?: boolean,
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
      is_final_question: true,
    };
  }

  const lastItem = history[history.length - 1];
  const lastAnswer = lastItem?.answer || "";
  const lastQ = lastItem?.question || "";
  const lastQuestionId = lastItem?.id || "";

  // Attempt single unified backend n8n call (n8n is the primary evaluation & turn brain)
  try {
    const response = await fetch(`${n8nBase()}/webhook/interview-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        question_id: lastQuestionId || null,
        answer_text: lastAnswer,
        response_transcript: lastAnswer,
        asked_question_text: lastQ,
        question_type: currentQuestionType || lastItem?.type || "technical",
        is_already_follow_up: Boolean(isAlreadyFollowUp),
        isAlreadyFollowUp: Boolean(isAlreadyFollowUp),
        candidate_name: candidateName || "",
        action: "generate-turn",
        account_id: accountId,
        candidate_id: candidateId,
        resume_text: resumeText,
        resumeText: resumeText,
        jd_text: jdText,
        jdText: jdText,
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

      const sanitizeAckOnly = (raw: string, fallbackAck: string): string => {
        let s = (raw || "")
          .replace(/^(acknowledgment|acknowledgement|interviewer_text|interviewer)\s*:\s*/i, "")
          .replace(/^["']|["']$/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        const nonQuestionSentences = s
          .split(/(?<=[.!?])\s+/)
          .filter((sent) => sent && !sent.includes("?"));
        s = nonQuestionSentences.join(" ").trim();
        return s || fallbackAck;
      };

      const sanitizeQuestionOnly = (raw: string): string => {
        let s = sanitizeQuestionPlaceholders(raw, resumeText, jdText)
          .replace(/^(question|follow_up_question|clarified_question|follow-up)\s*:\s*/i, "")
          .replace(/^["']|["']$/g, "")
          .trim();
        const ackPrefixRe =
          /^(sure|certainly|of course|understood|got it|thank you|thanks|appreciate|i understand|no problem|no worries|that's okay|glad to hear|makes sense|good point|fair enough|your response|that response|that answer)[^.?!]*[.!]\s+/i;
        while (ackPrefixRe.test(s) && s.replace(ackPrefixRe, "").trim().length > 10) {
          s = s.replace(ackPrefixRe, "").trim();
        }
        return s;
      };

      const fallbackAck = generateContextualAcknowledgment(
        lastAnswer,
        lastQ,
        totalQuestions,
        parsed.turn_type,
        Boolean(parsed.requested_clarification),
      );
      const interviewerText = sanitizeAckOnly(parsed.interviewer_text || "", fallbackAck);

      const rawTurnType: InterviewerTurnType = parsed.turn_type || "question";
      const isClarifyOrOffTopicSub = Boolean(
        parsed.recommended_action === "clarify" ||
          parsed.requested_clarification ||
          parsed.answer_was_irrelevant ||
          parsed.is_sub_question,
      );
      const allowSubQuestion =
        !isAlreadyFollowUp &&
        followUpCount < maxFollowUps &&
        (allowFollowUp !== false || isClarifyOrOffTopicSub) &&
        (questionIsTechnical !== false || isClarifyOrOffTopicSub);

      // Enforce client-side safeguard: never nest a sub-question inside a sub-question
      if (
        (rawTurnType === "follow_up" ||
          parsed.recommended_action === "clarify" ||
          parsed.is_sub_question) &&
        !allowSubQuestion
      ) {
        if (targetQuestion) {
          const cleanTarget = sanitizeQuestionOnly(targetQuestion);
          return {
            interviewer_text: interviewerText,
            question_text: cleanTarget,
            turn_type: "question",
            question_type: inferQuestionType(cleanTarget, "technical"),
            should_continue: true,
            recommended_action: "advance",
            evaluation_note: parsed.evaluation_note || null,
            answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
          };
        }
        if (totalQuestions < (maxPrimaryQuestions || TOTAL_WANTED_JOB_QUESTIONS)) {
          const fallbackQ = getDynamicCandidateQuestion(
            totalQuestions,
            allSessionQuestions,
            analysis,
            planItem,
            "nested followup blocked fallback",
            resumeText,
            jdText,
          );
          const cleanFallback = sanitizeQuestionPlaceholders(
            fallbackQ.question_text,
            resumeText,
            jdText,
          );
          return {
            interviewer_text: interviewerText,
            question_text: cleanFallback,
            turn_type: "question",
            question_type: inferQuestionType(cleanFallback, fallbackQ.question_type),
            should_continue: true,
            recommended_action: "advance",
            evaluation_note: parsed.evaluation_note || null,
            answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
          };
        }
        return {
          interviewer_text: interviewerText,
          question_text: "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
          is_final_question: true,
          recommended_action: "advance",
          evaluation_note: parsed.evaluation_note || null,
          answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
        };
      }

      const rawQuestion = parsed.question_text || parsed.prompt || targetQuestion || "";
      const questionText = sanitizeQuestionOnly(rawQuestion);

      // Handle closing signal from n8n cleanly
      const targetQuestions = maxPrimaryQuestions || TOTAL_WANTED_JOB_QUESTIONS;
      const isPrematureClosing = totalQuestions < targetQuestions;

      if (parsed.is_final_question || rawTurnType === "closing") {
        if (isPrematureClosing && targetQuestion) {
          const cleanQ = sanitizeQuestionPlaceholders(targetQuestion, resumeText, jdText);
          return {
            interviewer_text: interviewerText,
            question_text: cleanQ,
            turn_type: "question",
            question_type: inferQuestionType(cleanQ, "technical"),
            should_continue: true,
            recommended_action: "advance",
            evaluation_note: parsed.evaluation_note || null,
            answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
          };
        }
        if (isPrematureClosing && !targetQuestion) {
          const fallback = getDynamicCandidateQuestion(
            totalQuestions,
            allSessionQuestions,
            analysis,
            planItem,
            "premature closing override",
            resumeText,
            jdText,
          );
          const cleanQ = sanitizeQuestionPlaceholders(fallback.question_text, resumeText, jdText);
          return {
            interviewer_text: interviewerText,
            question_text: cleanQ,
            turn_type: "question",
            question_type: inferQuestionType(cleanQ, fallback.question_type),
            should_continue: true,
            recommended_action: "advance",
            evaluation_note: parsed.evaluation_note || null,
            answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
          };
        }

        return {
          interviewer_text:
            interviewerText ||
            "Thank you so much for answering all the questions today. Your responses have been recorded.",
          question_text: "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
          is_final_question: true,
          evaluation_note: parsed.evaluation_note || null,
          answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
        };
      }

      if (!questionText) {
        throw new Error("Backend returned empty question text");
      }

      return {
        interviewer_text: interviewerText,
        question_text: questionText,
        turn_type: rawTurnType,
        question_type: inferQuestionType(questionText, parsed.question_type || "technical"),
        should_continue: parsed.should_continue !== false,
        recommended_action: parsed.recommended_action,
        evaluation_note: parsed.evaluation_note || null,
        answer_was_irrelevant: Boolean(parsed.answer_was_irrelevant),
        is_final_question: Boolean(parsed.is_final_question),
        next_question_id: parsed.next_question_id || null,
      };
    }
  } catch (err) {
    console.warn("[generateInterviewerTurn] n8n call failed, falling back:", err);
  }

  // Offline fallback only when n8n is unreachable
  const intent = detectCandidateIntent(lastAnswer, lastQ);
  if (
    (candidateRequestedClarification || intent === "clarification_request") &&
    !isAlreadyFollowUp
  ) {
    return {
      interviewer_text: "Understood, let me clarify that question for you.",
      question_text: lastQ,
      turn_type: "follow_up",
      question_type: inferQuestionType(lastQ, "technical"),
      should_continue: true,
      recommended_action: "clarify",
    };
  }

  // Robust fallback
  if (
    targetQuestion &&
    !hasSimilarQuestionBeenAsked(
      targetQuestion,
      history.map((h) => h.question),
    )
  ) {
    const cleanTarget = sanitizeQuestionPlaceholders(targetQuestion, resumeText, jdText);
    return {
      interviewer_text: generateContextualAcknowledgment(
        lastAnswer,
        lastQ,
        totalQuestions,
        "question",
        false,
      ),
      question_text: cleanTarget,
      turn_type: "question",
      question_type: inferQuestionType(cleanTarget, "technical"),
      should_continue: true,
    };
  }

  const fallbackQ = getDynamicCandidateQuestion(
    totalQuestions,
    allSessionQuestions,
    analysis,
    planItem,
    "stage_progression",
    resumeText,
    jdText,
  );
  const cleanFallback = sanitizeQuestionPlaceholders(fallbackQ.question_text, resumeText, jdText);
  return {
    interviewer_text: generateContextualAcknowledgment(
      lastAnswer,
      lastQ,
      totalQuestions,
      "question",
      false,
    ),
    question_text: cleanFallback,
    turn_type: "question",
    question_type: inferQuestionType(cleanFallback, fallbackQ.question_type),
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
