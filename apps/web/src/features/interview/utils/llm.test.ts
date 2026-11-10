import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractAnswerEntities,
  generateInterviewerTurn,
  generateProbingFollowUp,
  inferQuestionType,
  isClarificationRequested,
  isFollowUpGrounded,
} from "./llm";

describe("interview follow-up generation & grounding", () => {
  it("extracts entities without assuming unmentioned brands", () => {
    const generalCache = extractAnswerEntities(
      "In my recent project we cached user profiles to reduce database load",
    );
    expect(generalCache.primaryTopic).toBe("caching and data retrieval");
    expect(generalCache.matchedKeywords).not.toContain("Redis caching");

    const generalContainer = extractAnswerEntities(
      "We packaged our services into containers for deployment",
    );
    expect(generalContainer.primaryTopic).toBe("containerization and deployment");
    expect(generalContainer.matchedKeywords).not.toContain("Kubernetes orchestration");
  });

  it("extracts specific tools when explicitly stated by candidate", () => {
    const explicitRedis = extractAnswerEntities("We used Redis as our in-memory key-value store");
    expect(explicitRedis.matchedKeywords).toContain("Redis caching");

    const explicitK8s = extractAnswerEntities(
      "We configured autoscaling on our Kubernetes cluster",
    );
    expect(explicitK8s.matchedKeywords).toContain("Kubernetes orchestration");
  });

  it("generates grounded probing follow-ups without hallucinating Redis or Kubernetes", () => {
    const generalProject = generateProbingFollowUp(
      "Could you walk me through your recent project?",
      "In my recent project, I built a web platform for internal analytics. I worked on API endpoints and data queries.",
    );
    expect(generalProject.toLowerCase()).not.toContain("redis");
    expect(generalProject.toLowerCase()).not.toContain("kubernetes");

    const cachingWithoutRedis = generateProbingFollowUp(
      "What did you build?",
      "We implemented a caching mechanism to speed up product catalog searches.",
    );
    expect(cachingWithoutRedis.toLowerCase()).not.toContain("redis");
    expect(cachingWithoutRedis).toContain("caching");

    const containersWithoutK8s = generateProbingFollowUp(
      "How did you deploy?",
      "We containerized each backend service and deployed via Docker.",
    );
    expect(containersWithoutK8s.toLowerCase()).not.toContain("kubernetes");
  });

  it("correctly includes Redis or Kubernetes when the candidate actually mentioned them", () => {
    const redisAnswer = generateProbingFollowUp(
      "Tell me about your architecture",
      "We used Redis clusters for session caching.",
    );
    expect(redisAnswer).toContain("Redis");

    const k8sAnswer = generateProbingFollowUp(
      "How did you manage scale?",
      "We managed our workloads on Kubernetes with HPA.",
    );
    expect(k8sAnswer).toContain("Kubernetes");
  });

  it("detects ungrounded follow-ups that hallucinate unmentioned technologies", () => {
    const answer = "We built a simple REST API with Node and Express.";
    const question = "Tell me about your recent project.";

    // Hallucinating Redis
    expect(
      isFollowUpGrounded(
        "How did you configure Redis cache eviction in that API?",
        answer,
        question,
      ),
    ).toBe(false);

    // Hallucinating Kubernetes
    expect(
      isFollowUpGrounded(
        "How did you set up Kubernetes pod autoscaling for the service?",
        answer,
        question,
      ),
    ).toBe(false);

    // Grounded follow-up
    expect(
      isFollowUpGrounded(
        "How did you handle error handling and input validation in Express?",
        answer,
        question,
      ),
    ).toBe(true);
  });
});

describe("follow-up cap enforcement in generateInterviewerTurn", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("blocks nested follow-ups when already on a follow-up with targetQuestion", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        turn_type: "follow_up",
        recommended_action: "follow_up",
        interviewer_text: "You mentioned cosine similarity.",
        question_text: "Can you explain the second follow-up?",
        is_sub_question: true,
      }),
    }) as unknown as typeof fetch;

    const turn = await generateInterviewerTurn(
      "Resume: Chatbot platform using OpenAI embeddings",
      "JD: AI Automation Intern",
      [
        {
          id: "q-2-1",
          question: "Can you explain the specific architecture?",
          answer: "We use OpenAI embeddings and cosine similarity.",
          type: "follow_up",
        },
      ],
      2,
      null,
      [],
      null,
      1,
      [],
      false,
      null,
      10,
      1,
      "In your next project, what trade-off did you make?",
      false,
      12,
      true,
      false,
      "sess-1",
      "acc-1",
      "cand-1",
      "Aqib",
      "technical",
      true,
    );

    expect(turn.turn_type).toBe("question");
    expect(turn.recommended_action).toBe("advance");
    expect(turn.question_text).toBe("In your next project, what trade-off did you make?");
  });

  it("blocks nested follow-ups even when targetQuestion is omitted", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        turn_type: "follow_up",
        recommended_action: "follow_up",
        interviewer_text: "You mentioned error handling.",
        question_text: "Can you explain the third follow-up?",
        is_sub_question: true,
      }),
    }) as unknown as typeof fetch;

    const turn = await generateInterviewerTurn(
      "Resume: Chatbot platform using OpenAI embeddings and n8n workflows",
      "JD: AI Automation Intern",
      [
        {
          id: "q-2-1",
          question: "Can you explain the specific architecture?",
          answer: "We use error handler workflows in n8n.",
          type: "follow_up",
        },
      ],
      2,
      null,
      [],
      null,
      1,
      [],
      false,
      null,
      10,
      1,
      undefined,
      false,
      10,
      true,
      false,
      "sess-1",
      "acc-1",
      "cand-1",
      "Aqib",
      "technical",
      true,
    );

    expect(turn.turn_type).toBe("question");
    expect(turn.recommended_action).toBe("advance");
    expect(turn.question_text).not.toBe("Can you explain the third follow-up?");
  });
});

describe("inferQuestionType", () => {
  it("prioritizes behavioral and situational classifications over incidental technical keywords", () => {
    expect(
      inferQuestionType(
        "Can you describe a technical disagreement or feedback you received while working on your automation projects, and how you resolved it?",
      ),
    ).toBe("behavioral");

    expect(
      inferQuestionType(
        "If you faced a tough production incident while working on an n8n workflow, how would you approach troubleshooting it?",
      ),
    ).toBe("situational");

    expect(
      inferQuestionType(
        "In your customer support chatbot platform, describe the architecture and data flow.",
      ),
    ).toBe("technical");
  });

  it("detects clarification phrasing like 'Can you help me with the question?'", () => {
    expect(isClarificationRequested("Can you help me with the question?")).toBe(true);
    expect(isClarificationRequested("Help me understand what you mean.")).toBe(true);
    expect(isClarificationRequested("I built n8n workflows to understand customer issues")).toBe(
      false,
    );
  });
});
