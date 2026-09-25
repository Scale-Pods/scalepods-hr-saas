"use client";

import type { SessionContext } from "@scalepods/core";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchSessionContext } from "@/features/candidate/api";

function ErrorCard({ message, title }: { message?: string; title?: string }) {
  return (
    <Card className="w-full">
      <CardContent className="py-10 text-center">
        <h1 className="text-sm font-semibold text-foreground">
          {title ?? "This link isn't working"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? "The link may have expired. Ask the recruiter for a fresh link."}
        </p>
      </CardContent>
    </Card>
  );
}

function cxCheck(ok: boolean, label: string) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-foreground">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-muted"}`} />
      {label}
    </div>
  );
}

export default function InterviewCheckPage() {
  const { session_id } = useParams<{ session_id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!session_id) {
      setError("Missing session id.");
      return;
    }
    let cancelled = false;
    fetchSessionContext(session_id)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Link invalid or expired.");
      });
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  useEffect(() => {
    return () => {
      const tracks = streamRef.current?.getTracks();
      if (tracks) for (const t of tracks) t.stop();
    };
  }, []);

  useEffect(() => {
    if (!cameraOk || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [cameraOk]);

  const startCamera = async () => {
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      setCameraOk(true);
    } catch {
      setCameraOk(false);
      setError("We couldn't access your camera/microphone. Please allow access and refresh.");
    } finally {
      setChecking(false);
    }
  };

  if (error) return <ErrorCard message={error} />;
  if (!ctx) {
    return (
      <div className="py-20 text-center text-sm text-label-secondary">
        Loading interview details…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
          Almost ready, {ctx.candidate.name ?? "there"}
        </h1>
        <p className="mt-1.5 text-sm text-label-secondary">
          {ctx.campaign.name} · Round {ctx.round.round_number} of {ctx.campaign.number_of_rounds}
        </p>
      </div>

      {(ctx.session.status === "expired" ||
        (ctx.round_instance.deadline_at &&
          new Date(ctx.round_instance.deadline_at).getTime() < Date.now())) && (
        <div className="rounded-[20px] border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          This interview link has expired. Contact the recruiter for a new link.
        </div>
      )}

      {(ctx.round_instance.retake_of_round_instance_id || ctx.round_instance.fault_reason) && (
        <div className="rounded-[20px] border border-accent/40 bg-accent/15 p-4 text-sm text-accent-foreground">
          A platform hiccup interrupted your earlier attempt, so this is a retake.
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 text-xs font-medium uppercase text-label-secondary">Setup check</p>
          {cxCheck(cameraOk, "Camera & microphone")}
          {cxCheck(!!streamRef.current, "Recording enabled")}
          {cxCheck(consented, "Consent to be recorded")}
          <div className="mt-3">
            {!cameraOk ? (
              <Button className="w-full" onClick={startCamera} disabled={checking}>
                {checking ? "Checking…" : "Allow camera & mic"}
              </Button>
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full rounded-[14px] bg-foreground object-cover"
              />
            )}
          </div>
        </CardContent>
      </Card>

      <label className="flex items-start gap-2.5 rounded-[20px] border border-border/60 bg-glass/70 p-4 backdrop-blur">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="text-xs leading-relaxed text-label-secondary">
          This interview will be recorded and may be reviewed by the recruiter and our AI evaluator.
          By continuing you agree to this.
        </span>
      </label>

      <Button
        className="w-full"
        disabled={!cameraOk || !consented}
        onClick={() => router.push(`/interview/${session_id}/conduct`)}
      >
        Start interview →
      </Button>
    </div>
  );
}
