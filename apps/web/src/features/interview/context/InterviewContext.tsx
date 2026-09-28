import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchSessionContext, scoreInterview } from "@/features/candidate/api";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import type {
  AuthenticitySignal,
  InterviewBlueprint,
  InterviewerTurn,
  InterviewQuestion,
  InterviewSession,
  LiveAssessmentNote,
  Scorecard,
} from "../types";
import {
  analyzeAnswerInRealtime,
  generateInterviewerTurn,
  generateTargetedFollowUp,
} from "../utils/llm";

interface InterviewContextType {
  session: InterviewSession | null;
  questions: InterviewQuestion[];
  currentTurn: InterviewerTurn | null;
  currentQuestionIndex: number;
  currentQuestionId: string;
  scorecard: Scorecard | null;
  loading: boolean;
  loadError: string;
  isGeneratingTurn: boolean;
  isAnalyzingAnswer: boolean;
  liveAssessmentNotes: LiveAssessmentNote[];
  authenticitySignals: AuthenticitySignal[];
  blueprint: InterviewBlueprint | null;
  resumeText: string;
  jdText: string;
  avStream: MediaStream | null;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  recordingDuration: number;
  recordingStatus: string;
  recordingError: string | null;
  setMediaStreams: (
    av: MediaStream | null,
    audio: MediaStream | null,
    screen: MediaStream | null,
  ) => void;
  loadSession: (id: string) => Promise<void>;
  submitAnswer: (questionId: string, answerText: string, audioUrl?: string) => Promise<void>;
  generateNextTurn: () => Promise<void>;
  markInterviewStarted: () => Promise<void>;
  startRecording: (
    sessionId: string,
    streams: { camera: MediaStream; screen?: MediaStream | null; audio?: MediaStream | null },
  ) => Promise<void>;
  completeInterview: () => Promise<void>;
}

const InterviewContext = createContext<InterviewContextType | null>(null);

const INTRO_QUESTION_TEXT =
  "Hello! I am your AI Interviewer today. Welcome to your interview. To start off, how are you doing today?";
const OPENING_ACKNOWLEDGMENT =
  "Hello, and thank you for joining today. I'm Alex, and I'll be guiding your interview.";

export function InterviewProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentTurn, setCurrentTurn] = useState<InterviewerTurn | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestionId, setCurrentQuestionId] = useState("");
  const [scorecard, _setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isGeneratingTurn, setIsGeneratingTurn] = useState(false);
  const [isAnalyzingAnswer, setIsAnalyzingAnswer] = useState(false);
  const [liveAssessmentNotes, setLiveAssessmentNotes] = useState<LiveAssessmentNote[]>([]);
  const [authenticitySignals, setAuthenticitySignals] = useState<AuthenticitySignal[]>([]);
  const [blueprint, _setBlueprint] = useState<InterviewBlueprint | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");

  const [avStream, setAvStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const recorder = useMediaRecorder();
  const recorderStopRef = useRef(recorder.stop);
  recorderStopRef.current = recorder.stop;

  const authenticitySignalsRef = useRef<AuthenticitySignal[]>([]);
  const liveAssessmentNotesRef = useRef<LiveAssessmentNote[]>([]);
  const followUpCountRef = useRef<Record<string, number>>({});
  const lastAssessmentNoteRef = useRef<LiveAssessmentNote | null>(null);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const localAnswersMapRef = useRef<Map<string, string>>(new Map());
  const isGeneratingTurnRef = useRef(false);
  const sessionMetadataRef = useRef<{
    round_number?: number;
    campaign_id?: string;
    number_of_rounds?: number;
    cutoff_score?: number | null;
  }>({});

  const setMediaStreams = useCallback(
    (av: MediaStream | null, audio: MediaStream | null, screen: MediaStream | null) => {
      setAvStream(av);
      setAudioStream(audio);
      setScreenStream(screen);
    },
    [],
  );

  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError("");
    answeredQuestionIdsRef.current.clear();
    localAnswersMapRef.current.clear();
    setLiveAssessmentNotes([]);
    liveAssessmentNotesRef.current = [];
    setAuthenticitySignals([]);
    authenticitySignalsRef.current = [];
    followUpCountRef.current = {};
    lastAssessmentNoteRef.current = null;
    setCurrentTurn(null);
    setCurrentQuestionId("");

    try {
      const ctx = await fetchSessionContext(id);
      if (!ctx?.session) {
        setLoadError("Interview session not found. The link may be expired or invalid.");
        setLoading(false);
        return;
      }

      const candidateName = ctx.candidate?.name || "Candidate";
      const initialSession: InterviewSession = {
        id: ctx.session.id,
        account_id: ctx.account?.id,
        candidate_id: ctx.candidate?.id || "",
        round_instance_id: ctx.round_instance?.id,
        status: (ctx.session.status as InterviewSession["status"]) || "invited",
        expires_at: ctx.session.expires_at,
        candidate: {
          id: ctx.candidate?.id || "",
          name: candidateName,
          email: ctx.candidate?.email || "",
        },
        campaign_name: ctx.campaign?.name,
        jd_text: ((ctx.campaign as Record<string, unknown> | null)?.jd_text as string) || "",
        resume_text: `Candidate: ${candidateName}, Email: ${ctx.candidate?.email || ""}`,
      };

      setSession(initialSession);
      sessionMetadataRef.current = {
        round_number: ctx.round?.round_number ?? 1,
        campaign_id: ctx.campaign?.id,
        number_of_rounds: ctx.campaign?.number_of_rounds ?? 1,
        cutoff_score: ctx.round?.cutoff_score ?? 70,
      };
      if (initialSession.jd_text) setJdText(initialSession.jd_text);
      if (initialSession.resume_text) setResumeText(initialSession.resume_text);

      const firstQuestion: InterviewQuestion = {
        id: "q-intro-0",
        session_id: id,
        question_text: INTRO_QUESTION_TEXT,
        question_type: "cultural",
        order_index: 0,
        source: "llm_ts_dynamic_intro",
      };

      setQuestions([firstQuestion]);
      setCurrentQuestionId(firstQuestion.id);
      setCurrentQuestionIndex(0);
    } catch (err) {
      console.warn("Failed to load session context:", err);
      setLoadError((err as Error).message || "Unable to load interview session");
    } finally {
      setLoading(false);
    }
  }, []);

  const markInterviewStarted = useCallback(async () => {
    if (!session) return;

    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: "in_progress",
            started_at: prev.started_at || new Date().toISOString(),
          }
        : null,
    );

    const _introText = `${OPENING_ACKNOWLEDGMENT} ${INTRO_QUESTION_TEXT}`;
    setCurrentTurn({
      interviewer_text: OPENING_ACKNOWLEDGMENT,
      question_text: INTRO_QUESTION_TEXT,
      turn_type: "question",
      question_type: "cultural",
      should_continue: true,
    });
  }, [session]);

  const submitAnswer = useCallback(
    async (questionId: string, answerText: string, _audioUrl?: string) => {
      if (!session) return;

      answeredQuestionIdsRef.current.add(questionId);
      localAnswersMapRef.current.set(questionId, answerText);

      const currentQuestion = questions.find((q) => q.id === questionId);
      if (!currentQuestion) return;

      const isAlreadyFollowUp = currentQuestion.source === "llm_ts_followup";
      setIsAnalyzingAnswer(true);

      try {
        const historyMap = questions
          .filter((q) => answeredQuestionIdsRef.current.has(q.id))
          .map((q) => ({
            question: q.question_text,
            answer: localAnswersMapRef.current.get(q.id) || "",
            type: q.source === "llm_ts_followup" ? "follow_up" : q.question_type,
          }));

        const note = await analyzeAnswerInRealtime(
          currentQuestion.question_text,
          answerText,
          resumeText,
          jdText,
          historyMap,
          questionId,
          blueprint,
          currentQuestion.competency_ids || [],
          currentQuestion.question_type,
          isAlreadyFollowUp,
          session.id,
          session.account_id,
          session.candidate_id,
        );

        if (note.recommended_action === "follow_up" && note.insufficiency_reason) {
          try {
            const targetedQuestion = await generateTargetedFollowUp(
              currentQuestion.question_text,
              answerText,
              note.insufficiency_reason,
              note.follow_up_question || "",
              resumeText,
              jdText,
            );
            note.follow_up_question = targetedQuestion;
          } catch {}
        }

        lastAssessmentNoteRef.current = note;
        setLiveAssessmentNotes((prev) => [...prev, note]);
        liveAssessmentNotesRef.current = [...liveAssessmentNotesRef.current, note];

        const signal: AuthenticitySignal = {
          question_id: questionId,
          signal: note.authenticity_signal,
          depth: note.depth_signal,
          follow_up_count: 0,
        };
        authenticitySignalsRef.current = [...authenticitySignalsRef.current, signal];
        setAuthenticitySignals((prev) => [...prev, signal]);
      } catch (err) {
        console.warn("[submitAnswer] Error analyzing answer:", err);
      } finally {
        setIsAnalyzingAnswer(false);
      }
    },
    [session, questions, resumeText, jdText, blueprint],
  );

  const generateNextTurn = useCallback(async () => {
    if (!session || isGeneratingTurnRef.current) return;
    isGeneratingTurnRef.current = true;
    setIsGeneratingTurn(true);

    try {
      const history = questions
        .filter((q) => answeredQuestionIdsRef.current.has(q.id))
        .map((q) => ({
          id: q.id,
          question: q.question_text,
          answer: localAnswersMapRef.current.get(q.id) || "",
          type: q.source === "llm_ts_followup" ? "follow_up" : q.question_type,
        }));

      const answeredCount = answeredQuestionIdsRef.current.size;
      const lastNote = lastAssessmentNoteRef.current;
      const allowFollowUp = Boolean(lastNote?.follow_up_prompted && lastNote?.follow_up_question);

      const turn = await generateInterviewerTurn(
        resumeText,
        jdText,
        history,
        answeredCount,
        null,
        authenticitySignalsRef.current,
        lastNote,
        0,
        [],
        allowFollowUp,
        null,
        10,
        1,
        undefined,
        false,
        0,
        true,
        false,
        session.id,
        session.account_id,
        session.candidate_id,
      );

      if (turn.turn_type === "closing" || !turn.should_continue) {
        setCurrentTurn({
          interviewer_text:
            turn.interviewer_text || "Thank you for your time. Your interview is complete.",
          question_text: "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
        });
        return;
      }

      if (turn.question_text) {
        const nextQ: InterviewQuestion = {
          id: `q-turn-${Date.now()}`,
          session_id: session.id,
          question_text: turn.question_text,
          question_type: turn.question_type || "technical",
          source: turn.turn_type === "follow_up" ? "llm_ts_followup" : "ai_generated",
          order_index: questions.length,
        };

        setQuestions((prev) => [...prev, nextQ]);
        setCurrentQuestionId(nextQ.id);
        setCurrentQuestionIndex((prev) => prev + 1);
      }

      setCurrentTurn(turn);
    } catch (err) {
      console.error("[InterviewContext] generateNextTurn error:", err);
    } finally {
      isGeneratingTurnRef.current = false;
      setIsGeneratingTurn(false);
    }
  }, [session, questions, resumeText, jdText]);

  const startRecording = useCallback(
    async (
      sid: string,
      streams: { camera: MediaStream; screen?: MediaStream | null; audio?: MediaStream | null },
    ) => {
      await recorder.start(sid, streams, session?.account_id);
    },
    [recorder, session],
  );

  const completeInterview = useCallback(async () => {
    if (!session) return;

    const recResult = await recorderStopRef.current();
    const recordingUrl = recResult?.filePath ?? null;
    setMediaStreams(null, null, null);

    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: "completed",
            completed_at: new Date().toISOString(),
            recording_url: recordingUrl || prev.recording_url,
          }
        : null,
    );

    try {
      await scoreInterview({
        account_id: session.account_id || "",
        session_id: session.id,
        candidate_id: session.candidate_id,
        round_number: sessionMetadataRef.current.round_number ?? 1,
        campaign_id: sessionMetadataRef.current.campaign_id || "",
        number_of_rounds: sessionMetadataRef.current.number_of_rounds ?? 1,
        cutoff_score: sessionMetadataRef.current.cutoff_score ?? 70,
        recording_url: recordingUrl,
      });
    } catch (err) {
      console.warn("Scoring webhook note:", err);
    }
  }, [session, setMediaStreams]);

  useEffect(() => {
    return () => {
      avStream?.getTracks().forEach((track) => {
        track.stop();
      });
      audioStream?.getTracks().forEach((track) => {
        track.stop();
      });
      screenStream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [avStream, audioStream, screenStream]);

  return (
    <InterviewContext.Provider
      value={{
        session,
        questions,
        currentTurn,
        currentQuestionIndex,
        currentQuestionId,
        scorecard,
        loading,
        loadError,
        isGeneratingTurn,
        isAnalyzingAnswer,
        liveAssessmentNotes,
        authenticitySignals,
        blueprint,
        resumeText,
        jdText,
        avStream,
        audioStream,
        screenStream,
        recordingDuration: recorder.duration,
        recordingStatus: recorder.status,
        recordingError: recorder.error,
        setMediaStreams,
        loadSession,
        submitAnswer,
        generateNextTurn,
        completeInterview,
        markInterviewStarted,
        startRecording,
      }}
    >
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterviewContext() {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error("useInterviewContext must be used within InterviewProvider");
  return ctx;
}
