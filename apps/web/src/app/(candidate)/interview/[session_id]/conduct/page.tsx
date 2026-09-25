"use client";

import type { SessionContext } from "@scalepods/core";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchSessionContext,
  insertProctoringEvent,
  scoreInterview,
  signUploads,
  submitInterviewTurn,
} from "@/features/candidate/api";

interface InterviewQuestion {
  type: "question";
  question_id: string;
  prompt: string;
  format: "open_ended" | "mcq" | "rating";
  options?: string[];
  is_final_question: boolean;
  interviewer_text?: string;
}
interface TranscriptTurn {
  q: string;
  a: string;
}

function ErrorCard({ message, title }: { message?: string; title?: string }) {
  return (
    <Card className="w-full">
      <CardContent className="py-10 text-center">
        <h1 className="text-sm font-semibold text-foreground">
          {title ?? "This link isn't working"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{message ?? "Something went wrong."}</p>
      </CardContent>
    </Card>
  );
}

export default function InterviewConductPage() {
  const { session_id } = useParams<{ session_id: string }>();
  const router = useRouter();

  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "answering" | "submitting" | "finishing" | "done" | "failed"
  >("loading");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [answer, setAnswer] = useState("");
  const [mcq, setMcq] = useState<number | null>(null);
  const [visits, setVisits] = useState(0);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      const tracks = streamRef.current?.getTracks();
      if (tracks) for (const t of tracks) t.stop();
    };
  }, []);

  useEffect(() => {
    if (!session_id) {
      setError("Missing session id.");
      return;
    }
    let cancelled = false;
    fetchSessionContext(session_id)
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        setStatus("ready");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Link invalid or expired.");
          setStatus("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  // Proctoring: log tab switches
  useEffect(() => {
    if (!session_id) return;
    const onHide = () => {
      if (!document.hidden) return;
      setVisits((v) => v + 1);
      void insertProctoringEvent(
        session_id,
        "tab_switch",
        `tab switched away ${visits + 1} time(s)`,
      );
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [session_id, visits]);

  const flushChunk = useCallback(
    async (blob: Blob) => {
      try {
        const name = `rec-${Date.now()}.webm`;
        const { uploads } = await signUploads("recording", session_id, [name]);
        const target = uploads.find((u) => u.name === name);
        if (target)
          await fetch(target.url, {
            method: "PUT",
            body: blob,
            headers: { "Content-Type": "audio/webm" },
          });
      } catch {
        /* best-effort - recording upload unavailable */
      }
    },
    [session_id],
  );

  const speakText = useCallback(
    (text: string) => {
      if (muted || !text.trim()) return;
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        synth.speak(new SpeechSynthesisUtterance(text));
      } catch {
        /* ignore */
      }
    },
    [muted],
  );

  useEffect(() => {
    if (!recording || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [recording]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      setRecording(true);
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0 && session_id) void flushChunk(e.data);
      };
      rec.start(10000);
      mediaRecRef.current = rec;
    } catch {
      /* best-effort */
    }
  }, [session_id, flushChunk]);

  const stopRecording = useCallback(() => {
    mediaRecRef.current?.stop();
    const tracks = streamRef.current?.getTracks();
    if (tracks) for (const t of tracks) t.stop();
    mediaRecRef.current = null;
    streamRef.current = null;
    setRecording(false);
  }, []);

  const submitTurn = async (responseTo: string | null, answerText: string) => {
    setStatus("submitting");
    try {
      const data = await submitInterviewTurn({
        account_id: ctx?.account.id ?? "",
        session_id,
        candidate_id: ctx?.candidate.id ?? "",
        question_id: responseTo,
        response_transcript: answerText,
        history: transcriptRef.current,
      });
      if (data.type === "finished") {
        finishInterview();
        return;
      }
      const q = data as unknown as Partial<InterviewQuestion>;
      if (!q || typeof q.prompt !== "string" || q.prompt.trim().length === 0) {
        throw new Error("The interview engine returned an unexpected response.");
      }
      setQuestion(q as InterviewQuestion);
      setAnswer("");
      setMcq(null);
      setStatus("answering");
      void startRecording();
      speakText([(q as InterviewQuestion).interviewer_text, q.prompt].filter(Boolean).join(" "));
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Could not reach the interview engine.");
    }
  };

  const submitAnswer = () => {
    if (!question) return;
    const text =
      question.format === "mcq" && mcq != null
        ? (question.options?.[mcq] ?? String(mcq))
        : question.format === "rating"
          ? mcq != null
            ? `${mcq}/10`
            : answer
          : answer.trim();
    if (question.format === "open_ended" && !text) return;
    stopRecording();
    setTranscript((t) => [...t, { q: question.prompt, a: text }]);
    const qid = question.question_id;
    if (question.format === "mcq" && mcq == null) return;
    setStatus("submitting");
    if (question.is_final_question) {
      void finishInterview();
    } else {
      void submitTurn(qid, text);
    }
  };

  const finishInterview = async () => {
    stopRecording();
    setStatus("finishing");
    try {
      await scoreInterview({
        account_id: ctx?.account.id ?? "",
        session_id,
        candidate_id: ctx?.candidate.id ?? "",
      });
      router.push(`/interview/${session_id}/thanks`);
    } catch {
      setStatus("failed");
      setError("Interview complete, but the evaluation step failed.");
    }
  };

  if (error && status === "failed")
    return <ErrorCard message={error} title="Interview interrupted" />;
  if (!ctx || status === "loading") {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Preparing your interview…
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl">
          🎙️
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          You&apos;re up, {ctx.candidate.name ?? "candidate"}
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          A friendly AI interviewer will ask a few questions ({ctx.campaign.name}, round{" "}
          {ctx.round.round_number}). Answer out loud or in the text box.
        </p>
        <Button className="mt-6" onClick={() => void submitTurn(null, "")}>
          Begin
        </Button>
      </div>
    );
  }

  if (status === "done") {
    return <p className="py-10 text-center text-sm text-muted-foreground">Thanks — wrapping up…</p>;
  }

  if (!question) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Preparing the first question…
      </div>
    );
  }

  const q = question;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {muted ? "Unmute speaker" : "Mute speaker"}
        </button>
      </div>

      <div className="rounded-xl bg-foreground p-4 text-background">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            AI Interviewer
          </span>
        </div>
        {q.interviewer_text && (
          <p className="text-sm leading-relaxed text-background/70">{q.interviewer_text}</p>
        )}
        <p className={`text-sm leading-relaxed ${q.interviewer_text ? "mt-2 font-medium" : ""}`}>
          {q.prompt}
        </p>
        {transcript.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {transcript.length} question{transcript.length > 1 ? "s" : ""} answered so far
          </p>
        )}
      </div>

      {(recording || streamRef.current) && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="relative h-36 w-28 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-lg">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
            />
            {recording && (
              <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                REC
              </span>
            )}
          </div>
        </div>
      )}

      {q.format === "mcq" && q.options && (
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button
              type="button"
              key={opt}
              onClick={() => setMcq(i)}
              className={`w-full rounded-[12px] border px-3 py-2.5 text-left text-sm transition-colors ${
                mcq === i
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-foreground hover:bg-fill-tertiary"
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
              type="button"
              key={n}
              onClick={() => setMcq(n)}
              className={`h-9 w-9 rounded-[10px] border text-sm font-medium transition-colors ${
                mcq === n
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-fill-tertiary"
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
          className="apple-input w-full"
        />
      )}

      <Button
        className="w-full"
        onClick={submitAnswer}
        disabled={
          status === "submitting" ||
          status === "finishing" ||
          (q.format === "open_ended" && !answer.trim()) ||
          (q.format === "mcq" && mcq == null)
        }
      >
        {status === "submitting"
          ? "Sending…"
          : q.is_final_question
            ? "Finish interview"
            : "Submit answer →"}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        {visits > 0 ? `Note: ${visits} tab switch(es) recorded. ` : ""}Stay on this tab for the best
        experience.
      </p>
    </div>
  );
}
