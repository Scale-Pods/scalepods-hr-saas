import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewRoom } from "./components/InterviewRoom";
import { InterviewProvider } from "./context/InterviewContext";
import { ProctoringProvider } from "./context/ProctoringContext";
import {
  getDynamicCandidateQuestion,
  hasSimilarQuestionBeenAsked,
  isSimilarQuestion,
} from "./utils/llm";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ session_id: "test-session-123" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.restoreAllMocks();

  const mockTrack = {
    stop: vi.fn(),
    getSettings: () => ({ width: 640, height: 480 }),
  };

  const mockStream = {
    getTracks: () => [mockTrack],
    getVideoTracks: () => [mockTrack],
    getAudioTracks: () => [mockTrack],
    addTrack: vi.fn(),
  } as unknown as MediaStream;

  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
      getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: "videoinput", deviceId: "cam-1" },
        { kind: "audioinput", deviceId: "mic-1" },
      ]),
    },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, "speechSynthesis", {
    value: {
      getVoices: () => [],
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
        setTimeout(() => {
          utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }, 50);
      }),
      cancel: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      onvoiceschanged: null,
    },
    configurable: true,
    writable: true,
  });

  class MockMediaRecorder {
    state = "inactive";
    ondataavailable: ((e: unknown) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
    static isTypeSupported() {
      return true;
    }
  }

  (globalThis as unknown as Record<string, unknown>).MediaRecorder = MockMediaRecorder;

  class MockAudioContext {
    state = "running";
    currentTime = 0;
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSource = vi.fn().mockReturnValue({
      connect: vi.fn(),
    });
    createBiquadFilter = vi.fn().mockReturnValue({
      type: "highpass",
      frequency: { setValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    });
    createAnalyser = vi.fn().mockReturnValue({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
      connect: vi.fn(),
    });
  }

  (globalThis as unknown as Record<string, unknown>).AudioContext = MockAudioContext;
  (globalThis as unknown as Record<string, unknown>).webkitAudioContext = MockAudioContext;

  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();

  globalThis.fetch = vi.fn().mockImplementation((url: string | URL) => {
    const urlStr = url.toString();

    if (urlStr.includes("/api/interview/session")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          session: {
            id: "test-session-123",
            account_id: "acc-123",
            candidate_id: "cand-123",
            round_instance_id: "ri-123",
            status: "invited",
            created_at: new Date().toISOString(),
          },
          candidate: {
            id: "cand-123",
            name: "John Doe",
            email: "john@example.com",
          },
          campaign: {
            id: "camp-123",
            name: "Full Stack Engineer",
            number_of_rounds: 1,
            jd_text: "We are looking for a Senior React / TypeScript engineer.",
          },
          round_instance: {
            id: "ri-123",
            round_type: "ai_interview",
            round_number: 1,
          },
          round: {
            round_number: 1,
            round_type: "ai_interview",
            cutoff_score: 70,
          },
          account: {
            id: "acc-123",
            tier: "enterprise",
          },
          jdText: "We are looking for a Senior React / TypeScript engineer.",
          resumeText: "Candidate: John Doe, Experience: 5 years in React & Node.js",
          questions: [
            {
              id: "q-1",
              session_id: "test-session-123",
              question_text: "Welcome to your interview! Can you tell me about your background?",
              question_type: "cultural",
              order_index: 0,
              source: "llm_ts_dynamic_intro",
            },
          ],
          answers: [],
          scorecard: null,
        }),
      });
    }

    if (urlStr.includes("/webhook/interview-engine")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          turn_type: "question",
          question_text: "What is your experience with Next.js App Router and server components?",
          interviewer_text: "Thank you for introducing yourself! Let's dive deeper.",
          question_type: "technical",
          should_continue: true,
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true }),
    });
  });
});

describe("Interview Room & Flow", () => {
  it("loads candidate session and displays PreCheck verification screen", async () => {
    render(
      <ProctoringProvider>
        <InterviewProvider>
          <InterviewRoom sessionId="test-session-123" />
        </InterviewProvider>
      </ProctoringProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Pre-Interview Check/i)).toBeInTheDocument();
    });

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(/Camera/i)).toBeInTheDocument();
    expect(screen.getByText(/Microphone/i)).toBeInTheDocument();
    expect(screen.getByText(/Internet Connection/i)).toBeInTheDocument();
  });

  it("completes device check and starts interview successfully", async () => {
    render(
      <ProctoringProvider>
        <InterviewProvider>
          <InterviewRoom sessionId="test-session-123" />
        </InterviewProvider>
      </ProctoringProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Pre-Interview Check/i)).toBeInTheDocument();
    });

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const startButton = screen.getByRole("button", { name: /Start Interview/i });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("AI Interview")).toBeInTheDocument();
      expect(screen.getByText("End Interview")).toBeInTheDocument();
    });
  });

  it("detects similar questions and selects unique next questions without repeating", () => {
    const q1 = "Could you walk me through your recent hands-on technical experience?";
    const q1Variant =
      "could you walk me through your recent hands-on technical experience and tools";
    const q2 =
      "What is an important technical trade-off or architectural decision you made in a recent project?";

    expect(isSimilarQuestion(q1, q1Variant)).toBe(true);
    expect(isSimilarQuestion(q1, q2)).toBe(false);

    const existing = [q1];
    expect(hasSimilarQuestionBeenAsked(q1Variant, existing)).toBe(true);
    expect(hasSimilarQuestionBeenAsked(q2, existing)).toBe(false);

    // Pick dynamic question avoiding already asked questions
    const nextQ = getDynamicCandidateQuestion(1, existing);
    expect(nextQ.question_text).not.toBe(q1);
    expect(hasSimilarQuestionBeenAsked(nextQ.question_text, existing)).toBe(false);
  });
});
