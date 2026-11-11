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
import { type CandidateAnalysis, generateInterviewerTurn } from "../utils/llm";

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
  answeredCount: number;
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
  completeInterview: (isEndedEarly?: boolean) => Promise<void>;
}

const InterviewContext = createContext<InterviewContextType | null>(null);

const INTRO_QUESTION_TEXT =
  "Hello! I am Aria, your AI Interviewer today. Welcome to your interview. To start off, how are you doing today?";

function buildPersonalizedGreeting(candidateName?: string, roleName?: string): string {
  const firstName = (candidateName || "").trim().split(/\s+/)[0] || "";
  const validName = firstName && firstName.toLowerCase() !== "candidate" ? firstName : "";
  const roleClause = roleName ? ` for the ${roleName.trim()} position` : "";
  return validName
    ? `Hello ${validName}! I am Aria, your AI Interviewer today${roleClause}. Welcome to your interview. To start off, how are you doing today?`
    : `Hello! I am Aria, your AI Interviewer today${roleClause}. Welcome to your interview. To start off, how are you doing today?`;
}

export function InterviewProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentTurn, setCurrentTurn] = useState<InterviewerTurn | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestionId, setCurrentQuestionId] = useState("");
  const [answeredCount, setAnsweredCount] = useState(0);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isGeneratingTurn, setIsGeneratingTurn] = useState(false);
  const [isAnalyzingAnswer] = useState(false);
  const [liveAssessmentNotes, setLiveAssessmentNotes] = useState<LiveAssessmentNote[]>([]);
  const [authenticitySignals, setAuthenticitySignals] = useState<AuthenticitySignal[]>([]);
  const [blueprint, _setBlueprint] = useState<InterviewBlueprint | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");

  const [avStream, setAvStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const avStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const recorder = useMediaRecorder();
  const recorderStopRef = useRef(recorder.stop);
  recorderStopRef.current = recorder.stop;

  const candidateAnalysisRef = useRef<CandidateAnalysis | null>(null);
  const authenticitySignalsRef = useRef<AuthenticitySignal[]>([]);
  const liveAssessmentNotesRef = useRef<LiveAssessmentNote[]>([]);
  const followUpCountRef = useRef<Record<string, number>>({});
  const lastAssessmentNoteRef = useRef<LiveAssessmentNote | null>(null);
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const answeredOrderRef = useRef<string[]>([]);
  const localAnswersMapRef = useRef<Map<string, string>>(new Map());
  const questionAckMapRef = useRef<Map<string, string>>(new Map());
  const isGeneratingTurnRef = useRef(false);
  const sessionMetadataRef = useRef<{
    round_number?: number;
    campaign_id?: string;
    number_of_rounds?: number;
    cutoff_score?: number | null;
  }>({});

  const setMediaStreams = useCallback(
    (av: MediaStream | null, audio: MediaStream | null, screen: MediaStream | null) => {
      if (avStreamRef.current && avStreamRef.current !== av) {
        avStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      if (audioStreamRef.current && audioStreamRef.current !== audio) {
        audioStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      if (screenStreamRef.current && screenStreamRef.current !== screen) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      avStreamRef.current = av;
      audioStreamRef.current = audio;
      screenStreamRef.current = screen;
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
    answeredOrderRef.current = [];
    localAnswersMapRef.current.clear();
    questionAckMapRef.current.clear();
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

      const rawCandidateName = (data.candidate?.name || "").trim();
      const candEmail = (data.candidate?.email || "").trim();
      let candidateName = rawCandidateName.toLowerCase() === "candidate" ? "" : rawCandidateName;
      if (!candidateName && candEmail && candEmail.includes("@")) {
        const prefix = candEmail
          .split("@")[0]
          .replace(/[0-9._-]+/g, " ")
          .trim();
        if (prefix) {
          candidateName = prefix
            .split(/\s+/)
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
        }
      }
      const existingAnswers: Array<{
        question_id: string;
        answer_text?: string;
        ai_live_note?: LiveAssessmentNote;
      }> = Array.isArray(data.answers) ? data.answers : [];

      let rawStatus = (data.session.status as InterviewSession["status"]) || "invited";
      // If session was prematurely marked incomplete or completed without any answers (e.g. reload on precheck),
      // recover it so the candidate can proceed with precheck instead of being locked out
      if (
        (rawStatus === "incomplete" || rawStatus === "completed") &&
        existingAnswers.length === 0
      ) {
        rawStatus = "invited";
      }

      const resolvedSession: InterviewSession = {
        id: data.session.id,
        account_id: data.session.account_id || data.account?.id,
        candidate_id: data.session.candidate_id || data.candidate?.id || "",
        round_instance_id: data.session.round_instance_id || data.round_instance?.id,
        status: rawStatus,
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
          data.resumeText ||
          (candidateName || data.candidate?.email
            ? `Candidate: ${candidateName || "Candidate"}, Email: ${data.candidate?.email || ""}`
            : ""),
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

      const existingQuestions: InterviewQuestion[] = (
        Array.isArray(data.questions) ? data.questions : []
      ).filter((q: { question_type?: string } | null | undefined) =>
        Boolean(q && q.question_type !== "blueprint_meta"),
      );

      if (existingAnswers.length > 0) {
        for (const ans of existingAnswers) {
          answeredQuestionIdsRef.current.add(ans.question_id);
          if (!answeredOrderRef.current.includes(ans.question_id)) {
            answeredOrderRef.current.push(ans.question_id);
          }
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
        setAnsweredCount(answeredQuestionIdsRef.current.size);
      }

      const personalizedIntro = buildPersonalizedGreeting(candidateName, data.campaign?.name);

      if (existingQuestions.length > 0) {
        const answerByQid = new Map(existingAnswers.map((a) => [a.question_id, a]));

        const cleanExisting = existingQuestions.map((q, idx) => {
          let qText = q.question_text;
          if (
            idx === 0 &&
            q.question_type === "cultural" &&
            qText.startsWith("Hello! I am your AI Interviewer today") &&
            candidateName
          ) {
            qText = personalizedIntro;
          }
          const ansNote = answerByQid.get(q.id)?.ai_live_note as
            | Record<string, unknown>
            | undefined;
          const inferredSubSource =
            q.source === "llm_ts_followup" || q.source === "llm_ts_clarification"
              ? q.source
              : (q.question_type as string | undefined) === "follow_up" ||
                  ansNote?.is_follow_up === true
                ? "llm_ts_followup"
                : q.source;
          return {
            ...q,
            question_text: qText,
            source: inferredSubSource,
          };
        });
        setQuestions(cleanExisting);
        const firstUnansweredIdx = cleanExisting.findIndex(
          (q) => !answeredQuestionIdsRef.current.has(q.id),
        );
        const currentIdx =
          firstUnansweredIdx !== -1 ? firstUnansweredIdx : Math.max(0, cleanExisting.length - 1);
        setCurrentQuestionIndex(currentIdx);
        setCurrentQuestionId(cleanExisting[currentIdx]?.id || cleanExisting[0]?.id || "");
      } else {
        const firstQuestionId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.floor(
                Math.random() * 0xffffffffffff,
              )
                .toString(16)
                .padStart(12, "0")}`;

        const firstQuestion: InterviewQuestion = {
          id: firstQuestionId,
          session_id: id,
          question_text: personalizedIntro,
          question_type: "cultural",
          order_index: 0,
          source: "llm_ts_dynamic_intro",
        };
        setQuestions([firstQuestion]);
        setCurrentQuestionId(firstQuestionId);
        setCurrentQuestionIndex(0);

        // Persist intro question to database with fixed UUID
        fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "insert_question",
            sessionId: id,
            questionId: firstQuestionId,
            questionText: personalizedIntro,
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

    questionAckMapRef.current.clear();
    const firstQ = questions[0];
    const initialQuestionText = firstQ?.question_text || INTRO_QUESTION_TEXT;
    const initialQuestionType = firstQ?.question_type || "cultural";
    if (firstQ?.id) {
      setCurrentQuestionId(firstQ.id);
      questionAckMapRef.current.set(firstQ.id, "");
    }

    setCurrentTurn({
      interviewer_text: "",
      question_text: initialQuestionText,
      turn_type: "question",
      question_type: initialQuestionType,
      should_continue: true,
    });
  }, [session, questions]);

  const submitAnswer = useCallback(
    async (questionId: string, answerText: string, _audioUrl?: string) => {
      if (!session) return;

      answeredQuestionIdsRef.current.add(questionId);
      answeredOrderRef.current = [
        ...answeredOrderRef.current.filter((qid) => qid !== questionId),
        questionId,
      ];
      setAnsweredCount(answeredQuestionIdsRef.current.size);
      localAnswersMapRef.current.set(questionId, answerText);

      const currentQuestion = questions.find((q) => q.id === questionId);
      const ackText =
        questionAckMapRef.current.get(questionId) ||
        (currentTurn?.question_text === currentQuestion?.question_text
          ? currentTurn?.interviewer_text
          : null) ||
        "";

      const spokenQuestionText =
        currentTurn?.question_text?.trim() || currentQuestion?.question_text?.trim() || "";

      const isAlreadyFollowUp =
        currentQuestion?.source === "llm_ts_followup" ||
        currentQuestion?.source === "llm_ts_clarification" ||
        Boolean(currentQuestion?.parent_question_id);

      // Persist raw answer immediately to database with current interviewer_text and actual question text asked
      try {
        await fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_answer",
            sessionId: session.id,
            questionId,
            answerText,
            aiLiveNote: {
              interviewer_text: ackText,
              question_text: spokenQuestionText,
              is_follow_up: isAlreadyFollowUp,
              parent_question_id: currentQuestion?.parent_question_id || null,
            },
          }),
        });
      } catch (err) {
        console.warn("Failed to persist answer to DB:", err);
      }
    },
    [session, questions, currentTurn?.interviewer_text, currentTurn?.question_text],
  );

  const generateNextTurn = useCallback(async () => {
    if (!session || isGeneratingTurnRef.current) return;
    isGeneratingTurnRef.current = true;
    setIsGeneratingTurn(true);

    try {
      const questionsById = new Map(questions.map((q) => [q.id, q]));
      const orderedIds = [
        ...answeredOrderRef.current.filter((qid) => answeredQuestionIdsRef.current.has(qid)),
        ...questions
          .map((q) => q.id)
          .filter(
            (qid) =>
              answeredQuestionIdsRef.current.has(qid) && !answeredOrderRef.current.includes(qid),
          ),
      ];
      const history = orderedIds
        .map((qid) => questionsById.get(qid))
        .filter((q): q is InterviewQuestion => Boolean(q))
        .map((q) => {
          const isSub =
            q.source === "llm_ts_followup" ||
            q.source === "llm_ts_clarification" ||
            (q.question_type as string | undefined) === "follow_up" ||
            Boolean(q.parent_question_id);
          return {
            id: q.id,
            question: q.question_text,
            answer: localAnswersMapRef.current.get(q.id) || "",
            type: q.question_type,
            source: q.source,
            is_sub_question: isSub,
          };
        });

      const currentQ = questions.find((q) => q.id === currentQuestionId);
      const currentQType = currentQ?.question_type || "technical";
      const isAlreadyFollowUp = Boolean(
        currentQ?.source === "llm_ts_followup" ||
          currentQ?.source === "llm_ts_clarification" ||
          (currentQ?.question_type as string | undefined) === "follow_up" ||
          currentQ?.parent_question_id,
      );
      const trackingKey = currentQ?.parent_question_id || currentQ?.id || "";

      // Next unanswered planned main question (legacy sessions only)
      const nextPlannedQuestion = questions.find(
        (q) =>
          !answeredQuestionIdsRef.current.has(q.id) &&
          q.source !== "llm_ts_followup" &&
          q.source !== "llm_ts_clarification" &&
          q.id !== currentQuestionId &&
          q.id !== currentQ?.parent_question_id,
      );

      const currentHistoryItem = currentQ
        ? history.find((item) => item.id === currentQ.id) || {
            id: currentQ.id,
            question: currentQ.question_text,
            answer: localAnswersMapRef.current.get(currentQ.id) || "",
            type: currentQ.question_type,
            source: currentQ.source,
            is_sub_question: isAlreadyFollowUp,
          }
        : undefined;
      const lastItem = currentHistoryItem || history[history.length - 1];
      const lastAnswer = lastItem?.answer || "";
      const lastQ = lastItem?.question || currentQ?.question_text || "";

      const turn = await generateInterviewerTurn({
        sessionId: session.id,
        accountId: session.account_id,
        candidateId: session.candidate_id,
        candidateName: session.candidate?.name,
        resumeText,
        jdText,
        history,
        currentQuestionId: currentQ?.id,
        askedQuestionText: lastQ,
        currentQuestionType: currentQType,
        currentQuestionSource: currentQ?.source,
        isAlreadyFollowUp,
        answerText: lastAnswer,
      });

      // Sync evaluation note returned by n8n back to state and DB row
      if (turn.evaluation_note && currentQ) {
        const evalNote = turn.evaluation_note;
        const fullNote: LiveAssessmentNote = {
          question_id: currentQ.id,
          authenticity_signal:
            (evalNote.authenticity_signal as LiveAssessmentNote["authenticity_signal"]) ||
            "genuine",
          depth_signal: (evalNote.depth_signal as LiveAssessmentNote["depth_signal"]) || "surface",
          recommended_action:
            turn.turn_type === "follow_up"
              ? "follow_up"
              : turn.recommended_action === "clarify"
                ? "rephrase_primary"
                : "advance",
          red_flags: Array.isArray(evalNote.red_flags) ? (evalNote.red_flags as string[]) : [],
          note: typeof evalNote.note === "string" ? evalNote.note : "",
          follow_up_prompted: turn.turn_type === "follow_up",
          follow_up_question:
            turn.turn_type === "follow_up" ? turn.question_text || undefined : undefined,
          requested_clarification: Boolean(evalNote.requested_clarification),
          answer_was_irrelevant: Boolean(
            turn.answer_was_irrelevant || evalNote.answer_was_irrelevant,
          ),
        };

        setLiveAssessmentNotes((prev) => [...prev, fullNote]);
        liveAssessmentNotesRef.current = [...liveAssessmentNotesRef.current, fullNote];

        const signal: AuthenticitySignal = {
          question_id: currentQ.id,
          signal: fullNote.authenticity_signal,
          depth: fullNote.depth_signal,
          follow_up_count: turn.turn_type === "follow_up" ? 1 : 0,
        };
        authenticitySignalsRef.current = [...authenticitySignalsRef.current, signal];
        setAuthenticitySignals((prev) => [...prev, signal]);

        const { turn_type: nextTurnType, ...evalNoteFields } = evalNote;
        const prevAckText = questionAckMapRef.current.get(currentQ.id) || "";
        fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_answer",
            sessionId: session.id,
            questionId: currentQ.id,
            answerText: lastAnswer,
            aiLiveNote: {
              ...evalNoteFields,
              next_turn_type: nextTurnType,
              interviewer_text: prevAckText,
              question_text: currentQ.question_text,
              is_follow_up: isAlreadyFollowUp,
              parent_question_id: currentQ.parent_question_id || null,
            },
          }),
        }).catch((err) => console.warn("Failed to sync n8n evaluation note:", err));
      }

      lastAssessmentNoteRef.current = null;

      if (turn.is_final_question || turn.turn_type === "closing" || !turn.should_continue) {
        setCurrentTurn({
          interviewer_text: turn.interviewer_text || "",
          question_text: turn.question_text || "",
          turn_type: "closing",
          question_type: "cultural",
          should_continue: false,
          is_final_question: true,
        });
        return;
      }

      if (turn.question_text) {
        const isFollowUp = turn.turn_type === "follow_up";
        const isClarifyTurn = turn.recommended_action === "clarify";
        let targetQId = "";
        if (!isFollowUp && !isClarifyTurn && nextPlannedQuestion) {
          setCurrentQuestionId(nextPlannedQuestion.id);
          targetQId = nextPlannedQuestion.id;
          const plannedIdx = questions.findIndex((q) => q.id === nextPlannedQuestion.id);
          if (plannedIdx !== -1) {
            setCurrentQuestionIndex(plannedIdx);
          }
          turn.question_text = nextPlannedQuestion.question_text;
          turn.question_type = nextPlannedQuestion.question_type;
        } else {
          const resolvedType = turn.question_type || "technical";
          const generatedUuid =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.floor(
                  Math.random() * 0xffffffffffff,
                )
                  .toString(16)
                  .padStart(12, "0")}`;

          const qSource = isClarifyTurn
            ? "llm_ts_clarification"
            : isFollowUp
              ? "llm_ts_followup"
              : "llm_ts_dynamic";
          const parentId = isFollowUp || isClarifyTurn ? trackingKey || null : null;

          let nextQ: InterviewQuestion = {
            id: generatedUuid,
            session_id: session.id,
            round_instance_id: session.round_instance_id,
            question_text: turn.question_text,
            question_type: resolvedType,
            order_index: questions.length,
            source: qSource,
            parent_question_id: parentId,
          };

          // Persist question to DB while preserving local source & parent_question_id metadata
          try {
            const qRes = await fetch("/api/interview/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "insert_question",
                sessionId: session.id,
                questionId: generatedUuid,
                questionText: turn.question_text,
                questionType: resolvedType,
                orderIndex: questions.length,
                source: qSource,
                parentQuestionId: parentId,
              }),
            });
            if (qRes.ok) {
              const qData = await qRes.json();
              if (qData?.question?.id) {
                nextQ = {
                  ...qData.question,
                  source: qSource,
                  parent_question_id: parentId,
                };
              }
            }
          } catch (insertErr) {
            console.warn("Could not insert dynamic question to DB:", insertErr);
          }

          setQuestions((prev) => {
            const updated = [...prev, nextQ];
            setCurrentQuestionIndex(updated.length - 1);
            return updated;
          });
          setCurrentQuestionId(nextQ.id);
          targetQId = nextQ.id;
        }

        if (targetQId && turn.interviewer_text) {
          questionAckMapRef.current.set(targetQId, turn.interviewer_text.trim());
        }
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

  const completeInterview = useCallback(
    async (isEndedEarly: boolean = false) => {
      if (!session) return;

      const recResult = await recorderStopRef.current();
      const recordingUrl = recResult?.filePath ?? null;
      setMediaStreams(null, null, null);

      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: isEndedEarly ? "incomplete" : "completed",
              completed_at: new Date().toISOString(),
              recording_url: recordingUrl || prev.recording_url,
            }
          : null,
      );

      // Call complete API to finalize session record and trigger scoring pipeline
      try {
        await fetch("/api/interview/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            sessionId: session.id,
            recordingUrl,
            endedEarly: isEndedEarly,
          }),
        });
      } catch (err) {
        console.warn("Failed to finalize session on server:", err);
      }
    },
    [session, setMediaStreams],
  );

  useEffect(() => {
    return () => {
      for (const stream of [avStreamRef.current, audioStreamRef.current, screenStreamRef.current]) {
        stream?.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []);

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
        answeredCount,
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
