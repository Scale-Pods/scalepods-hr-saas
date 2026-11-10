import { afterEach, describe, expect, it, vi } from "vitest";
import { generateInterviewerTurn } from "./llm";

describe("generateInterviewerTurn n8n passthrough", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("forwards session and conversation context to /webhook/interview-engine and returns n8n output verbatim", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        turn_type: "follow_up",
        recommended_action: "follow_up",
        question_type: "technical",
        interviewer_text: "You mentioned using OpenAI embeddings.",
        question_text: "How did you handle similarity thresholds and chunking in that pipeline?",
        should_continue: true,
        is_final_question: false,
        evaluation_note: {
          relevance: "partial",
          score: 3,
          depth_signal: "surface",
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const turn = await generateInterviewerTurn({
      sessionId: "sess-1",
      accountId: "acc-1",
      candidateId: "cand-1",
      candidateName: "Aqib",
      resumeText: "Built chatbot platform with OpenAI embeddings",
      jdText: "AI Automation Intern",
      history: [
        {
          id: "q-2",
          question: "Walk me through your chatbot architecture.",
          answer: "We used OpenAI embeddings and vector search.",
          type: "technical",
          is_sub_question: false,
        },
      ],
      currentQuestionId: "q-2",
      askedQuestionText: "Walk me through your chatbot architecture.",
      currentQuestionType: "technical",
      currentQuestionSource: "llm_ts_dynamic",
      isAlreadyFollowUp: false,
      answerText: "We used OpenAI embeddings and vector search.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/webhook/interview-engine");
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.action).toBe("generate-turn");
    expect(sentBody.candidate_name).toBe("Aqib");
    expect(sentBody.asked_question_text).toBe("Walk me through your chatbot architecture.");
    expect(sentBody.answer_text).toBe("We used OpenAI embeddings and vector search.");

    expect(turn.turn_type).toBe("follow_up");
    expect(turn.recommended_action).toBe("follow_up");
    expect(turn.question_type).toBe("technical");
    expect(turn.interviewer_text).toBe("You mentioned using OpenAI embeddings.");
    expect(turn.question_text).toBe(
      "How did you handle similarity thresholds and chunking in that pipeline?",
    );
    expect(turn.should_continue).toBe(true);
    expect(turn.is_final_question).toBe(false);
  });

  it("respects n8n closing decision verbatim", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        turn_type: "closing",
        recommended_action: "advance",
        question_type: "cultural",
        interviewer_text: "Thank you for completing all questions today.",
        question_text: "",
        should_continue: false,
        is_final_question: true,
      }),
    }) as unknown as typeof fetch;

    const turn = await generateInterviewerTurn({
      sessionId: "sess-1",
      resumeText: "Resume",
      jdText: "JD",
      history: [],
      askedQuestionText: "Tell me about a teammate disagreement.",
      answerText: "We aligned around shared latency metrics.",
    });

    expect(turn.turn_type).toBe("closing");
    expect(turn.is_final_question).toBe(true);
    expect(turn.should_continue).toBe(false);
    expect(turn.question_text).toBe("");
  });

  it("throws when n8n responds with an HTTP error instead of overriding in code", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    }) as unknown as typeof fetch;

    await expect(
      generateInterviewerTurn({
        sessionId: "sess-1",
        resumeText: "Resume",
        jdText: "JD",
        history: [],
        askedQuestionText: "Hello",
        answerText: "Doing well.",
      }),
    ).rejects.toThrow("n8n interview-engine responded with status 502");
  });
});
