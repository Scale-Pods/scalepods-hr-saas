"use client";

import { AlertCircle, CheckCircle, Clock, Loader2, Monitor, PhoneOff, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useInterviewContext } from "../context/InterviewContext";
import { useProctoringContext } from "../context/ProctoringContext";
import { useInterviewTimer } from "../hooks/useInterviewTimer";
import { getMediaDevicesStream, getScreenStream } from "../utils/mediaHelpers";
import { useTTSEngine } from "../utils/tts";
import type { AnswerRecorderState } from "./AnswerRecorder";
import { AnswerRecorder } from "./AnswerRecorder";
import type { ChatMessage } from "./ChatBubble";
import { ChatBubble, TypingBubble } from "./ChatBubble";
import { ChatInputBar } from "./ChatInputBar";
import { Completion } from "./Completion";
import { LoadingSpinner } from "./LoadingSpinner";
import { PreCheck } from "./PreCheck";
import { ProctoringOverlay } from "./ProctoringOverlay";
import { RecruiterPersona } from "./RecruiterPersona";
import { VideoFeed } from "./VideoFeed";

const INTERVIEW_TIME_MINUTES = 25;
const DEFAULT_TARGET_QUESTIONS = 11;

interface InterviewRoomProps {
  sessionId?: string;
}

const PROGRESS_BAR_STEPS = Array.from({ length: 64 }, (_, idx) => `q-step-${idx + 1}`);

export function InterviewRoom({ sessionId: propSessionId }: InterviewRoomProps) {
  const params = useParams();
  const sessionId = propSessionId || (params?.session_id as string) || (params?.token as string);

  const {
    session,
    questions,
    currentTurn,
    currentQuestionIndex,
    currentQuestionId,
    loading,
    loadError,
    loadSession,
    avStream,
    audioStream,
    screenStream,
    setMediaStreams,
    submitAnswer,
    generateNextTurn,
    completeInterview,
    markInterviewStarted,
    startRecording,
    recordingDuration,
    recordingError,
    isGeneratingTurn,
    isAnalyzingAnswer,
    liveAssessmentNotes,
  } = useInterviewContext();

  const { violations, startProctoring, stopProctoring } = useProctoringContext();
  const startingRef = useRef(false);
  const completionStartedRef = useRef(false);
  const { speak, cancel } = useTTSEngine();
  const [answerState, setAnswerState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastError, setLastError] = useState("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const isAiSpeakingRef = useRef(false);
  const [endEarly, setEndEarly] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completingError, setCompletingError] = useState("");
  const globalTimer = useInterviewTimer(INTERVIEW_TIME_MINUTES);
  const turnIdRef = useRef<string | undefined>(undefined);
  const [, setCurrentlySpeakingText] = useState("");
  const [speakingPhase, setSpeakingPhase] = useState<"acknowledgment" | "question" | null>(null);
  const [activeVideoTab, setActiveVideoTab] = useState<"camera" | "screen">("camera");

  // ── Chat UI state ─────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [recorderState, setRecorderState] = useState<AnswerRecorderState>({
    transcript: "",
    isThinking: false,
    silenceCountdown: 40,
    countdownTenths: 40,
    thinkingCountdown: 250,
    thinkingCountdownTenths: 250,
    isRecording: false,
  });

  const chatFeedRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const stopAndSubmitRef = useRef<((overrideText?: string) => void) | null>(null);
  const currentAlexBubbleIdRef = useRef<string | null>(null);
  const currentAckBubbleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId) loadSession(sessionId);
  }, [sessionId, loadSession]);

  useEffect(() => {
    completionStartedRef.current = false;
  }, []);

  const [startError, setStartError] = useState("");

  const handleStart = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartError("");
    try {
      const { camera: av, audio } = await getMediaDevicesStream();
      let screen: MediaStream | null = null;
      try {
        screen = await getScreenStream();
      } catch (screenErr) {
        console.warn("Screen sharing not available, continuing without it:", screenErr);
      }
      await markInterviewStarted();
      setMediaStreams(av, audio, screen);
      if (session) {
        await startRecording(session.id, {
          camera: av,
          screen: screen ?? null,
          audio: audio ?? null,
        });
        startProctoring(session.id);
      }
    } catch (err) {
      console.error("Failed to get media streams:", err);
      setStartError(
        (err as Error).message ||
          "Camera permission was denied. Please allow device access to proceed.",
      );
      startingRef.current = false;
    }
  }, [session, markInterviewStarted, setMediaStreams, startRecording, startProctoring]);

  const finishInterview = useCallback(async () => {
    if (completionStartedRef.current || session?.status === "completed") return;
    completionStartedRef.current = true;
    setCompleting(true);
    setCompletingError("");
    stopProctoring();
    try {
      await completeInterview();
    } catch (err) {
      setCompletingError((err as Error).message || "Failed to complete interview");
    } finally {
      setCompleting(false);
    }
  }, [completeInterview, session?.status, stopProctoring]);

  const onSpeakCompleteRef = useRef<() => void>(undefined);
  onSpeakCompleteRef.current = () => {
    isAiSpeakingRef.current = false;
    setIsAiSpeaking(false);
    setCurrentlySpeakingText("");
    setSpeakingPhase(null);
    const bid = currentAlexBubbleIdRef.current;
    if (bid) {
      setChatMessages((prev) => prev.map((m) => (m.id === bid ? { ...m, status: "done" } : m)));
    }
    if (currentTurn?.turn_type === "closing" && !completionStartedRef.current) {
      setTimeout(() => {
        if (!completionStartedRef.current) finishInterview();
      }, 3000);
    }
  };

  const handleSkipSpeaking = useCallback(() => {
    cancel();
    isAiSpeakingRef.current = false;
    setIsAiSpeaking(false);
    setCurrentlySpeakingText("");
    setSpeakingPhase(null);
    const bid = currentAlexBubbleIdRef.current;
    if (bid) {
      setChatMessages((prev) => prev.map((m) => (m.id === bid ? { ...m, status: "done" } : m)));
    }
    const ackId = currentAckBubbleIdRef.current;
    if (ackId) {
      setChatMessages((prev) => prev.map((m) => (m.id === ackId ? { ...m, status: "done" } : m)));
      currentAckBubbleIdRef.current = null;
    }
  }, [cancel]);

  useEffect(() => {
    if (currentTurn && avStream && !completionStartedRef.current) {
      const acknowledgment = (currentTurn.interviewer_text || "").trim();
      const questionText = currentTurn.question_text?.trim() || "";

      const turnId = `${currentTurn.turn_type}-${acknowledgment.slice(0, 40)}-${Date.now()}`;
      turnIdRef.current = turnId;
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);

      const speakQuestion = () => {
        if (turnIdRef.current !== turnId) return;
        const ackId = currentAckBubbleIdRef.current;
        if (ackId) {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === ackId ? { ...m, status: "done" } : m)),
          );
          currentAckBubbleIdRef.current = null;
        }
        if (!questionText) {
          onSpeakCompleteRef.current?.();
          return;
        }
        setSpeakingPhase("question");
        setCurrentlySpeakingText(questionText);
        speak(questionText, () => {
          if (turnIdRef.current === turnId) {
            onSpeakCompleteRef.current?.();
          }
        });
      };

      if (acknowledgment) {
        setSpeakingPhase("acknowledgment");
        setCurrentlySpeakingText(acknowledgment);
        speak(acknowledgment, () => {
          if (turnIdRef.current === turnId) {
            setTimeout(speakQuestion, 400);
          }
        });
      } else if (questionText) {
        speakQuestion();
      }
    }
    return () => {
      cancel();
    };
  }, [currentTurn, avStream, cancel, speak]);

  useEffect(() => {
    if (!currentTurn || !avStream) return;
    const acknowledgmentText = (currentTurn.interviewer_text || "").trim();
    const questionText = currentTurn.question_text?.trim() || "";

    const now = Date.now();
    const ackBubbleId = acknowledgmentText ? `alex-ack-${now}` : null;
    const bubbleId = `alex-${currentTurn.turn_type}-${now}`;
    currentAlexBubbleIdRef.current = bubbleId;
    currentAckBubbleIdRef.current = ackBubbleId;

    const newMessages: ChatMessage[] = [];

    if (acknowledgmentText && ackBubbleId) {
      newMessages.push({
        id: ackBubbleId,
        role: "alex",
        text: acknowledgmentText,
        phase: "acknowledgment",
        status: "speaking",
        timestamp: now,
      });
    }

    if (questionText) {
      newMessages.push({
        id: bubbleId,
        role: "alex",
        text: questionText,
        phase: currentTurn.turn_type === "closing" ? "closing" : "question",
        questionType: (currentTurn.question_type as ChatMessage["questionType"]) || "technical",
        isFollowUp: currentTurn.turn_type === "follow_up",
        status: "speaking",
        timestamp: now + 1,
      });
    }

    setChatMessages((prev) => [...prev, ...newMessages]);
  }, [
    currentTurn?.interviewer_text,
    currentTurn?.question_text,
    currentTurn?.turn_type,
    currentTurn?.question_type,
    avStream,
    currentTurn,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever chatMessages updates
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (globalTimer.isExpired && session?.status !== "completed" && !completionStartedRef.current) {
      speak(
        "Your time has expired. We are wrapping up the interview now. Thank you for your time.",
        () => {
          finishInterview();
        },
      );
    }
  }, [globalTimer.isExpired, session?.status, speak, finishInterview]);

  const endEarlyRef = useRef(endEarly);
  endEarlyRef.current = endEarly;
  useEffect(() => {
    if (!endEarly || completionStartedRef.current) return;
    const timer = setTimeout(() => {
      if (endEarlyRef.current && !completionStartedRef.current) {
        finishInterview();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [endEarly, finishInterview]);

  const handleAnswerComplete = useCallback(
    async (text: string, audioBlob?: Blob) => {
      if (!currentQuestionId) {
        setAnswerState("error");
        setLastError(
          "The active question was not ready. Please wait for the interviewer to repeat it.",
        );
        return;
      }

      const candidateBubble: ChatMessage = {
        id: `candidate-${Date.now()}`,
        role: "candidate",
        text: text || "Candidate responded via voice.",
        answerStatus: "submitted",
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, candidateBubble]);

      setAnswerState("saving");
      setLastError("");

      try {
        const qId = currentQuestionId;
        const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : undefined;
        await submitAnswer(qId, text, audioUrl);
        setAnswerState("saved");

        if (endEarly || currentTurn?.turn_type === "closing") {
          setEndEarly(false);
          setTimeout(() => finishInterview(), 1500);
          return;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        await generateNextTurn();
        setAnswerState("idle");
      } catch (err) {
        setAnswerState("error");
        setLastError((err as Error).message || "Unable to save this answer");
      }
    },
    [currentQuestionId, currentTurn, submitAnswer, generateNextTurn, endEarly, finishInterview],
  );

  if (loading || !session) {
    if (!loading && !session) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md text-center">
            <AlertCircle size={40} className="mx-auto mb-4" style={{ color: "var(--red)" }} />
            <p className="font-medium text-lg mb-2" style={{ color: "var(--label-primary)" }}>
              Session Not Found
            </p>
            <p className="text-sm" style={{ color: "var(--label-secondary)" }}>
              {loadError ||
                "Unable to load your interview session. Please check your invite link or contact the recruiter."}
            </p>
          </div>
        </div>
      );
    }
    return <LoadingSpinner text="Loading interview room parameters..." />;
  }

  if (completing || session.status === "completed") {
    if (!completing && session.status === "completed") {
      return <Completion />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div
              className="absolute inset-0 rounded-full opacity-20 animate-ping"
              style={{ background: "var(--blue)" }}
            />
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "var(--blue)" }}
            >
              <Upload size={32} className="text-white" />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--label-primary)" }}>
            Completing Your Interview
          </h2>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "var(--label-secondary)" }}>
            Please wait while we securely save your responses and finalize the recording.
          </p>
          <div
            className="flex items-center justify-center gap-2 text-sm mt-4"
            style={{ color: "var(--blue)" }}
          >
            <Loader2 size={18} className="animate-spin" />
            <span>Processing...</span>
          </div>
          {completingError && (
            <div
              className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{
                background: "color-mix(in srgb, var(--red) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)",
              }}
            >
              <AlertCircle size={14} className="shrink-0" style={{ color: "var(--red)" }} />
              <p className="text-sm" style={{ color: "var(--red)" }}>
                {completingError}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!avStream) {
    return (
      <div className="space-y-4">
        {startError && (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl animate-fade-in max-w-lg"
            style={{
              background: "color-mix(in srgb, var(--red) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--red) 30%, transparent)",
            }}
          >
            <AlertCircle size={16} className="shrink-0" style={{ color: "var(--red)" }} />
            <p className="text-sm" style={{ color: "var(--red)" }}>
              {startError}
            </p>
          </div>
        )}
        <PreCheck key={String(startError)} onComplete={handleStart} session={session} />
      </div>
    );
  }

  const timerColor = globalTimer.isExpired
    ? "var(--red)"
    : globalTimer.isWarning
      ? "var(--orange)"
      : "var(--label-secondary)";

  const primaryQuestions = questions.filter(
    (q) =>
      q.source !== "llm_ts_followup" &&
      q.source !== "llm_ts_dynamic_intro" &&
      q.source !== "hr_reviewed_intro",
  );
  const progressTarget = Math.max(
    primaryQuestions.length > 0 ? primaryQuestions.length : DEFAULT_TARGET_QUESTIONS,
    1,
  );

  const currentQuestion = questions.find((q) => q.id === currentQuestionId);
  const isCurrentFollowUp = currentQuestion?.source === "llm_ts_followup";
  const primaryQuestionsAnsweredOrActive = questions.filter(
    (q, idx) =>
      q.source !== "llm_ts_followup" &&
      q.source !== "llm_ts_dynamic_intro" &&
      q.source !== "hr_reviewed_intro" &&
      idx <= currentQuestionIndex,
  ).length;
  const primaryBarIndex = Math.max(0, primaryQuestionsAnsweredOrActive - 1);
  const isClosingTurn = currentTurn?.turn_type === "closing";

  const candidateDisplayName =
    session.candidate?.name ||
    (session as unknown as Record<string, { name?: string }>).candidates_ai_interview?.name ||
    "Candidate";

  return (
    <div className="min-h-screen flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
      {session && <ProctoringOverlay violations={violations} sessionId={session.id} />}

      {/* ─── Header ──────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: "1px solid var(--separator)",
          background: "rgba(28,28,30,0.6)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
        className="sticky top-0 z-30 shrink-0"
      >
        <div className="px-4 sm:px-5 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--blue)" }}
              >
                <Monitor size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold" style={{ color: "var(--label-primary)" }}>
                  AI Interview
                </h1>
                <p className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>
                  {candidateDisplayName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-1.5 text-sm font-mono font-bold"
                style={{ color: timerColor }}
              >
                <Clock size={14} />
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{globalTimer.formatted}</span>
                {globalTimer.isWarning && !globalTimer.isExpired && (
                  <span
                    className="text-[10px] font-normal ml-1"
                    style={{ color: "color-mix(in srgb, var(--orange) 70%, transparent)" }}
                  >
                    Warning
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-medium badge-red">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--red)" }}
                />
                <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {Math.floor(recordingDuration / 60)}:
                  {(recordingDuration % 60).toString().padStart(2, "0")}
                </span>
              </div>
              {recordingError && (
                <div
                  className="flex items-center gap-1.5 text-[10px]"
                  style={{ color: "var(--red)" }}
                >
                  <AlertCircle size={12} />
                  {recordingError}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center gap-1">
              {PROGRESS_BAR_STEPS.slice(0, progressTarget).map((stepKey, i) => {
                const isActive = i === primaryBarIndex && !isClosingTurn;
                const isDone = i < primaryBarIndex || isClosingTurn;
                return (
                  <div key={stepKey} className="flex items-center gap-1 flex-1">
                    <div
                      className="w-full h-1 rounded-full transition-all duration-500"
                      style={{
                        background: isActive
                          ? "var(--blue)"
                          : isDone
                            ? "var(--green)"
                            : "var(--fill-tertiary)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-[10px]" style={{ color: "var(--label-tertiary)" }}>
                Question {Math.min(primaryBarIndex + 1, progressTarget)} of {progressTarget}
              </p>
              {isCurrentFollowUp && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider"
                  style={{
                    background: "color-mix(in srgb, var(--purple) 15%, transparent)",
                    color: "var(--purple)",
                    border: "1px solid color-mix(in srgb, var(--purple) 25%, transparent)",
                  }}
                >
                  Follow-up
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main chat layout ─────────────────────────────────────── */}
      <div className="interview-chat-layout flex-1">
        {/* Chat column */}
        <div className="chat-column">
          {/* Scrollable chat feed */}
          <div className="chat-feed" ref={chatFeedRef}>
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 opacity-40">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--fill-quaternary)" }}
                >
                  <Monitor size={20} style={{ color: "var(--label-tertiary)" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--label-tertiary)" }}>
                  Interview starting…
                </p>
              </div>
            )}

            {chatMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {/* Typing indicator while generating next question */}
            {isGeneratingTurn && <TypingBubble />}

            {/* Timer expired notice */}
            {globalTimer.isExpired && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl animate-fade-in self-center"
                style={{
                  background: "color-mix(in srgb, var(--red) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)",
                }}
              >
                <AlertCircle size={16} className="shrink-0" style={{ color: "var(--red)" }} />
                <p className="text-sm" style={{ color: "var(--red)" }}>
                  Time's up! The interview is ending.
                </p>
              </div>
            )}

            {/* Save state feedback inside chat */}
            {(answerState === "saving" || answerState === "saved" || answerState === "error") && (
              <div className="flex justify-center animate-fade-in">
                <div
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background:
                      answerState === "error"
                        ? "color-mix(in srgb, var(--red) 12%, transparent)"
                        : "var(--fill-quaternary)",
                    border: "1px solid var(--separator)",
                    color:
                      answerState === "saving"
                        ? "var(--blue)"
                        : answerState === "saved"
                          ? "var(--green)"
                          : "var(--red)",
                  }}
                >
                  {answerState === "saving" && (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={11} className="animate-spin" /> Saving response…
                    </span>
                  )}
                  {answerState === "saved" && (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle size={11} /> Response saved
                    </span>
                  )}
                  {answerState === "error" && (
                    <span className="flex items-center gap-1.5">
                      <AlertCircle size={11} /> {lastError}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Closing message */}
            {isClosingTurn && !isAiSpeaking && (
              <div className="flex flex-col items-center gap-2 py-6 animate-fade-in">
                <CheckCircle size={32} style={{ color: "var(--green)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                  Thank you! Your responses have been recorded.
                </p>
              </div>
            )}
          </div>

          {/* ── Fixed bottom input bar ────────────────────────────── */}
          <ChatInputBar
            recorderState={recorderState}
            isAiSpeaking={isAiSpeaking}
            isGeneratingTurn={isGeneratingTurn}
            isAnalyzingAnswer={isAnalyzingAnswer}
            onManualSubmit={(overrideText) => stopAndSubmitRef.current?.(overrideText)}
            onSkipSpeaking={handleSkipSpeaking}
            canvasRef={waveformCanvasRef}
          />

          {/* Hidden AnswerRecorder — all audio & transcription logic runs here */}
          {currentTurn && !isClosingTurn && (
            <div
              style={{
                position: "absolute",
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
              aria-hidden
            >
              <AnswerRecorder
                key={currentQuestionId}
                onAnswerComplete={handleAnswerComplete}
                onStateChange={setRecorderState}
                externalCanvasRef={waveformCanvasRef}
                isAiSpeaking={isAiSpeaking}
                expired={globalTimer.isExpired}
                endEarly={endEarly}
                audioStream={audioStream}
                stopAndSubmitRef={stopAndSubmitRef}
              />
            </div>
          )}
        </div>

        {/* ─── Right sidebar ────────────────────────────────────── */}
        <aside className="interview-sidebar">
          <RecruiterPersona
            isAiSpeaking={isAiSpeaking}
            isAnalyzingAnswer={isAnalyzingAnswer}
            isGeneratingTurn={isGeneratingTurn}
            liveAssessmentNotes={liveAssessmentNotes}
            currentQuestionIndex={currentQuestionIndex}
            currentQuestionId={currentQuestionId || ""}
            speakingPhase={speakingPhase}
          />

          <div
            className="rounded-2xl p-3 space-y-3"
            style={{
              background: "rgba(28,28,30,0.6)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold" style={{ color: "var(--label-secondary)" }}>
                Your Video Feed
              </span>
              {screenStream && (
                <div
                  className="flex gap-1 p-0.5 rounded-lg"
                  style={{ background: "var(--fill-tertiary)" }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("camera")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      activeVideoTab === "camera"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVideoTab("screen")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      activeVideoTab === "screen"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Screen
                  </button>
                </div>
              )}
            </div>

            {activeVideoTab === "camera" || !screenStream ? (
              <VideoFeed
                stream={avStream}
                muted
                label="Camera"
                className="aspect-video rounded-xl overflow-hidden shadow-inner"
              />
            ) : (
              <VideoFeed
                stream={screenStream}
                muted
                mirrored={false}
                label="Screen"
                className="aspect-video rounded-xl overflow-hidden shadow-inner"
              />
            )}
          </div>

          {!showEndConfirm ? (
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                color: "var(--red)",
                background: "color-mix(in srgb, var(--red) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--red) 25%, transparent)",
              }}
            >
              <PhoneOff size={14} />
              <span>End Interview</span>
            </button>
          ) : (
            <div
              className="w-full p-3.5 rounded-xl flex flex-col gap-2.5 animate-fade-in text-center"
              style={{
                background: "color-mix(in srgb, var(--red) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--red) 30%, transparent)",
              }}
            >
              <div
                className="flex items-center justify-center gap-1.5 text-xs font-semibold"
                style={{ color: "var(--red)" }}
              >
                <PhoneOff size={14} />
                <span>End interview early?</span>
              </div>
              <p className="text-[11px]" style={{ color: "var(--label-secondary)" }}>
                Are you sure you want to end the session now?
              </p>
              <div className="flex items-center justify-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowEndConfirm(false);
                    setEndEarly(true);
                  }}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold text-white transition-all shadow-sm active:scale-95"
                  style={{ background: "var(--red)" }}
                >
                  Yes, End
                </button>
                <button
                  type="button"
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all active:scale-95"
                  style={{
                    color: "var(--label-primary)",
                    background: "var(--fill-tertiary)",
                    border: "1px solid var(--separator)",
                  }}
                >
                  No
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
