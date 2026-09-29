"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  analyzeCandidateFit,
  analyzeResumeJdAlignment,
  type CandidateAnalysis,
  extractJdToolsAndTech,
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
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
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

  const candidateAnalysisRef = useRef<CandidateAnalysis | null>(null);
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
    candidateAnalysisRef.current = null;
    setCurrentTurn(null);
    setCurrentQuestionId("");

    try {
      const res = await fetch(`/api/interview/session?sessionId=${id}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setLoadError(
          errJson.error || "Interview session not found. The link may be expired or invalid.",
        );
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (!data.session) {
        setLoadError("Interview session not found. The link may be expired or invalid.");
        setLoading(false);
        return;
      }

      const candidateName = data.candidate?.name || "Candidate";
      const resolvedSession: InterviewSession = {
        id: data.session.id,
        account_id: data.session.account_id || data.account?.id,
        candidate_id: data.session.candidate_id || data.candidate?.id || "",
        round_instance_id: data.session.round_instance_id || data.round_instance?.id,
        status: (data.session.status as InterviewSession["status"]) || "invited",
        expires_at: data.session.expires_at,
        created_at: data.session.created_at,
        recording_url: data.session.recording_url,
        candidate: {
          id: data.candidate?.id || data.session.candidate_id,
          name: candidateName,
          email: data.candidate?.email || "",
        },
        campaign_name: data.campaign?.name,
        jd_text: data.jdText || "",
        resume_text:
          data.resumeText || `Candidate: ${candidateName}, Email: ${data.candidate?.email || ""}`,
      };

      setSession(resolvedSession);
      sessionMetadataRef.current = {
        round_number: data.round?.round_number ?? 1,
        campaign_id: data.campaign?.id,
        number_of_rounds: data.campaign?.number_of_rounds ?? 1,
        cutoff_score: data.round?.cutoff_score ?? 70,
      };

      if (data.jdText) setJdText(data.jdText);
      if (data.resumeText) setResumeText(data.resumeText);
      if (data.scorecard) setScorecard(data.scorecard);

      const existingQuestions: InterviewQuestion[] = Array.isArray(data.questions)
        ? data.questions
        : [];
      const existingAnswers: Array<{
        question_id: string;
        answer_text?: string;
        ai_live_note?: LiveAssessmentNote;
      }> = Array.isArray(data.answers) ? data.answers : [];

      if (existingAnswers.length > 0) {
        for (const ans of existingAnswers) {
          answeredQuestionIdsRef.current.add(ans.question_id);
          if (ans.answer_text) {
            localAnswersMapRef.current.set(ans.question_id, ans.answer_text);
          }
        }
        const persistedNotes = existingAnswers
          .map((a) => a.ai_live_note as LiveAssessmentNote | null)
          .filter((note): note is LiveAssessmentNote => Boolean(note));

        const persistedSignals = persistedNotes.map((note) => ({
          question_id: note.question_id,
          signal: note.authenticity_signal,
          depth: note.depth_signal,
          follow_up_count: 0,
        }));

        setLiveAssessmentNotes(persistedNotes);
        liveAssessmentNotesRef.current = persistedNotes;
        setAuthenticitySignals(persistedSignals);
        authenticitySignalsRef.current = persistedSignals;
      }

      if (existingQuestions.length > 0) {
        setQuestions(existingQuestions);
        const answeredCount = answeredQuestionIdsRef.current.size;
        const currentIdx = Math.min(
          answeredCount,
          existingQuestions.length > 0 ? existingQuestions.length - 1 : 0,
        );
        setCurrentQuestionIndex(currentIdx);
        setCurrentQuestionId(existingQuestions[currentIdx]?.id || existingQuestions[0]?.id || "");
      } else {
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

        // Persist intro question to database
        fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "insert_question",
            sessionId: id,
            questionText: INTRO_QUESTION_TEXT,
            questionType: "cultural",
            orderIndex: 0,
            source: "llm_ts_dynamic_intro",
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((persisted) => {
            if (persisted?.question?.id) {
              setQuestions([persisted.question]);
              setCurrentQuestionId(persisted.question.id);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn("Failed to load interview session context:", err);
      setLoadError((err as Error).message || "Unable to load interview session");
    } finally {
      setLoading(false);
    }
  }, []);

  const markInterviewStarted = useCallback(async () => {
    if (!session) return;

    fetch("/api/interview/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        sessionId: session.id,
      }),
    }).catch((err) => console.warn("Could not mark interview started on server:", err));

    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: "in_progress",
            started_at: prev.started_at || new Date().toISOString(),
          }
        : null,
    );

    const firstQ = questions[0];
    const initialQuestionText = firstQ?.question_text || INTRO_QUESTION_TEXT;
    const greetingQuestionText =
      initialQuestionText.toLowerCase().includes("hello") ||
      initialQuestionText.toLowerCase().includes("welcome")
        ? initialQuestionText
        : `${OPENING_ACKNOWLEDGMENT} ${initialQuestionText}`;

    setCurrentTurn({
      interviewer_text: OPENING_ACKNOWLEDGMENT,
      question_text: greetingQuestionText,
      turn_type: "question",
      question_type: firstQ?.question_type || "cultural",
      should_continue: true,
    });
  }, [session, questions]);

  const submitAnswer = useCallback(
    async (questionId: string, answerText: string, audioUrl?: string) => {
      if (!session) return;

      answeredQuestionIdsRef.current.add(questionId);
      localAnswersMapRef.current.set(questionId, answerText);

      // Persist raw answer immediately to database
      fetch("/api/interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          sessionId: session.id,
          questionId,
          answerText,
          audioUrl,
        }),
      }).catch((err) => console.warn("Failed to persist answer to DB:", err));

      const currentQuestion = questions.find((q) => q.id === questionId);
      if (!currentQuestion || !answerText) return;

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
          } catch (followUpErr) {
            console.warn(
              "[submitAnswer] generateTargetedFollowUp failed, keeping fallback:",
              followUpErr,
            );
          }
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

        // Update answer row with completed live assessment note
        fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_answer",
            sessionId: session.id,
            questionId,
            answerText,
            aiLiveNote: note,
          }),
        }).catch((err) => console.warn("Failed to persist live assessment note:", err));
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

      const currentQ = questions.find((q) => q.id === currentQuestionId);
      const trackingKey =
        currentQ?.parent_question_id || currentQ?.id || lastNote?.question_id || "";
      const currentFollowUpCount = trackingKey ? followUpCountRef.current[trackingKey] || 0 : 0;
      const isAlreadyFollowUp = currentQ?.source === "llm_ts_followup";

      const allowFollowUp = Boolean(
        lastNote?.follow_up_prompted &&
          lastNote?.follow_up_question &&
          currentFollowUpCount < 1 &&
          !isAlreadyFollowUp,
      );

      if (!candidateAnalysisRef.current && (resumeText || jdText)) {
        try {
          const [analysis, extractedTools, alignment] = await Promise.all([
            analyzeCandidateFit(resumeText, jdText),
            extractJdToolsAndTech(resumeText, jdText),
            analyzeResumeJdAlignment(resumeText, jdText),
          ]);
          candidateAnalysisRef.current = { ...analysis, extractedTools, alignment };
        } catch {}
      }

      const turn = await generateInterviewerTurn(
        resumeText,
        jdText,
        history,
        answeredCount,
        candidateAnalysisRef.current,
        authenticitySignalsRef.current,
        lastNote,
        currentFollowUpCount,
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

      if (turn.turn_type === "follow_up" && trackingKey) {
        followUpCountRef.current[trackingKey] = currentFollowUpCount + 1;
      }
      lastAssessmentNoteRef.current = null;

      if (turn.turn_type === "closing" || !turn.should_continue) {
        setCurrentTurn({
          interviewer_text:
            turn.interviewer_text ||
            "That brings us to the end of the interview. Thank you so much for your time and for sharing your experience. Your responses have been successfully recorded.",
          question_text: "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
        });
        return;
      }

      if (turn.question_text) {
        const isFollowUp = turn.turn_type === "follow_up";
        let nextQ: InterviewQuestion = {
          id: `q-turn-${Date.now()}`,
          session_id: session.id,
          question_text: turn.question_text,
          question_type: turn.question_type || "technical",
          order_index: questions.length,
          source: isFollowUp ? "llm_ts_followup" : "llm_ts_dynamic",
        };

        // Persist question to DB
        try {
          const qRes = await fetch("/api/interview/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "insert_question",
              sessionId: session.id,
              questionText: turn.question_text,
              questionType: turn.question_type || "technical",
              orderIndex: questions.length,
              source: isFollowUp ? "llm_ts_followup" : "llm_ts_dynamic",
              parentQuestionId: lastNote?.question_id || null,
            }),
          });
          if (qRes.ok) {
            const qData = await qRes.json();
            if (qData?.question?.id) {
              nextQ = qData.question;
            }
          }
        } catch (insertErr) {
          console.warn("Could not insert dynamic question to DB:", insertErr);
        }

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
  }, [session, questions, resumeText, jdText, currentQuestionId]);

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

    // Call complete API to finalize session record and trigger scoring pipeline
    fetch("/api/interview/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        sessionId: session.id,
        recordingUrl,
      }),
    }).catch((err) => console.warn("Failed to finalize session on server:", err));
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
