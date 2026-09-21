import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { callEdge } from "../../lib/edge";
import { sessionContextSchema, type SessionContext } from "@scalepods/core";
import { CandidateShell, ErrorCard, useCandidateToken } from "./shared";

type QFormat = "open_ended" | "mcq" | "rating";
interface InterviewQuestion {
  type: "question";
  question_id: string;
  prompt: string;
  format: QFormat;
  options?: string[];
  is_final_question: boolean;
}
interface InterviewFinish {
  type: "finished";
}
type EngineResponse = InterviewQuestion | InterviewFinish;

interface TranscriptTurn {
  q: string;
  a: string;
}

const hasSpeechRec = typeof window !== "undefined" && "webkitSpeechRecognition" in window;

export function InterviewConductPage() {
  const { session_id } = useParams();
  const token = useCandidateToken();
  const navigate = useNavigate();

  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "answering" | "submitting" | "finishing" | "done" | "failed">("loading");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [mcq, setMcq] = useState<number | null>(null);
  const [visits, setVisits] = useState(0);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    if (!session_id || !token) {
      setError("Missing session or token.");
      return;
    }
    let cancelled = false;
    anonClient()
      .rpc("get_session_context", { p_session_id: session_id, p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message ?? "Link invalid or expired.");
          return;
        }
        const parsed = sessionContextSchema.safeParse(data);
        if (!parsed.success) {
          setError("Unrecognised session context.");
          return;
        }
        const active = parsed.data;
        setCtx(active);
        setStatus("ready");
        submitTurn(null, "", active);
      });
    return () => { cancelled = true; };
  }, [session_id, token]);

  // Proctoring: log tab switches/visibility changes.
  useEffect(() => {
    if (!session_id || !token) return;
    const onHide = () => {
      const ev = document.hidden && ctx?.session.id && document.hidden ? "tab_switch" : null;
      if (!ev) return;
      setVisits((v) => v + 1);
      void anonClient().rpc("insert_proctoring_event", {
        p_session_id: session_id,
        p_token: token,
        p_event_type: ev,
        p_detail: `tab switched away ${visits + 1} time(s)`,
      });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [session_id, token, ctx, visits]);

  const flushChunk = useCallback(
    async (blob: Blob) => {
      const name = `rec-${Date.now()}.webm`;
      const { uploads } = await callEdge<{ uploads: { name: string; url: string }[] }>("sign-upload", {
        body: { token, kind: "recording", resource_id: session_id, file_names: [name] },
      });
      const target = uploads.find((u) => u.name === name);
      if (target) await fetch(target.url, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } }).catch(() => {});
    },
    [session_id, token]
  );

  // Start incremental audio recording of the candidate's mic.
  const startRecording = useCallback(async () => {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(mic, { mimeType: "audio/webm" });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0 && session_id && token) void flushChunk(e.data);
      };
      rec.start(10000);
      mediaRecRef.current = rec;

      if (hasSpeechRec) {
        const SR = (window as unknown as { webkitSpeechRecognition?: { new (): SpeechRecognitionLike } }).webkitSpeechRecognition;
        if (SR) {
          const sr = new SR();
          sr.continuous = true;
          sr.interimResults = true;
          sr.lang = "en-US";
          let interim = "";
          sr.onresult = (ev) => {
            interim = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              if (ev.results[i].isFinal) setAnswer((prev) => prev + " " + ev.results[i][0].transcript);
              else interim += ev.results[i][0].transcript;
            }
            if (interim) setAnswer((prev) => (prev.endsWith("_") ? prev.slice(0, -1) : prev) + "_" + interim);
          };
          sr.start();
        }
      }
    } catch {
      // Recording is best-effort; the text box always works as a fallback.
    }
  }, [session_id, token, flushChunk]);

  const stopRecording = useCallback(() => {
    mediaRecRef.current?.stop();
    mediaRecRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRecRef.current = null;
  }, []);

  const submitTurn = async (responseTo: string | null, answerText: string, active?: SessionContext | null) => {
    const scope = active ?? ctx;
    setStatus("submitting");
    try {
      const body = {
        account_id: scope?.account.id,
        session_id,
        candidate_id: scope?.candidate.id,
        question_id: responseTo,
        response_transcript: answerText,
        history: transcriptRef.current,
      };
      const res = await fetch(`${import.meta.env.VITE_N8N_BASE_URL}/webhook/interview-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Engine error (${res.status})`);
      }
      const data = (await res.json()) as EngineResponse;
      if (data.type === "finished") {
        finishInterview();
        return;
      }
      const q: InterviewQuestion = data as InterviewQuestion;
      setQuestion(q);
      setAnswer("");
      setMcq(null);
      setStatus("answering");
      void startRecording();
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Could not reach the interview engine.");
    }
  };

  const submitAnswer = () => {
    if (!question) return;
    const text =
      question.format === "mcq" && mcq != null
        ? question.options?.[mcq] ?? String(mcq)
        : question.format === "rating"
          ? mcq != null ? `${mcq}/10` : answer
          : answer.trim();
    if (question.format === "open_ended" && !text) return;
    stopRecording();
    setTranscript((t) => [...t, { q: question.prompt, a: text }]);
    const qid = question.question_id;
    if (question.format === "mcq" && mcq == null) return;
    setStatus("submitting");
    void submitTurn(qid, text);
  };

  const finishInterview = async () => {
    stopRecording();
    setStatus("finishing");
    try {
      const res = await fetch(`${import.meta.env.VITE_N8N_BASE_URL}/webhook/score-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ account_id: ctx?.account.id, session_id, candidate_id: ctx?.candidate.id }),
      });
      if (res.ok) {
        navigate(`/interview/${session_id}/thanks`);
      } else {
        setStatus("failed");
        setError("Interview complete, but the evaluation step failed.");
      }
    } catch {
      setStatus("failed");
      setError("Interview complete, but the evaluation step failed.");
    }
  };

  if (error) return <CandidateShell><ErrorCard message={error} /></CandidateShell>;

  if (!ctx || status === "loading") {
    return (
      <CandidateShell>
        <div className="py-20 text-center text-sm text-muted-foreground">Preparing your interview…</div>
      </CandidateShell>
    );
  }

  if (status === "ready") {
    return (
      <CandidateShell>
        <div className="py-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl">
            🎙️
          </div>
          <h1 className="text-lg font-semibold text-foreground">You're up, {ctx.candidate.name ?? "candidate"}</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A friendly AI interviewer will ask a few questions ({ctx.campaign.name}, round {ctx.round.round_number}). Answer out loud or in the text box — whichever you prefer.
          </p>
          {ctx.round_instance.retake_of_round_instance_id && (
            <p className="mx-auto mt-2 max-w-sm text-xs text-accent-foreground">
              This is a retake after a brief platform issue — thank you for running through it again.
            </p>
          )}
          <button
            onClick={() => submitTurn(null, "")}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary"
          >
            Begin
          </button>
        </div>
      </CandidateShell>
    );
  }

  if (status === "failed") {
    return (
      <CandidateShell>
        <ErrorCard message={error ?? "Something went wrong."} title="Interview interrupted" />
      </CandidateShell>
    );
  }

  if (status === "done") {
    return (
      <CandidateShell>
        <p className="py-10 text-center text-sm text-muted-foreground">Thanks — wrapping up…</p>
      </CandidateShell>
    );
  }

  const q = question!;

  return (
    <CandidateShell>
      <div className="space-y-4">
        <div className="rounded-xl bg-foreground p-4 text-background">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">AI Interviewer</span>
          </div>
          <p className="text-sm leading-relaxed">{q.prompt}</p>
          {transcript.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {transcript.length} question{transcript.length > 1 ? "s" : ""} answered so far
            </p>
          )}
        </div>

        {q.format === "mcq" && q.options && (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setMcq(i)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  mcq === i
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {String.fromCharCode(65 + i)}. {opt}
              </button>
            ))}
          </div>
        )}

        {q.format === "rating" && (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setMcq(n)}
                className={`h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                  mcq === n ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {q.format === "open_ended" && (
          <textarea
            value={answer.replace(/_$/, "")}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Speak, or type your answer here…"
            className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        <button
          onClick={submitAnswer}
          disabled={
            status === "submitting" ||
            (q.format === "open_ended" && !answer.trim()) ||
            (q.format === "mcq" && mcq == null)
          }
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary disabled:bg-muted disabled:text-muted-foreground"
        >
          {status === "submitting" ? "Sending…" : q.is_final_question ? "Finish interview" : "Submit answer →"}
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          {visits > 0 ? `Note: ${visits} tab switch(es) recorded. ` : ""}Stay on this tab for the best experience.
        </p>
      </div>
    </CandidateShell>
  );
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}