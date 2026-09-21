import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { sessionContextSchema, type SessionContext } from "../../lib/schemas";
import { CandidateShell, ErrorCard, useCandidateToken } from "./shared";

export function InterviewCheckPage() {
  const { session_id } = useParams();
  const token = useCandidateToken();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [checking, setChecking] = useState(false);

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
        setCtx(parsed.data);
      });
    return () => { cancelled = true; };
  }, [session_id, token]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const startCamera = async () => {
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOk(true);
    } catch {
      setCameraOk(false);
      setError("We couldn't access your camera/microphone. Please allow access and refresh.");
    } finally {
      setChecking(false);
    }
  };

  const countdownToWindow = (scheduled: string | null) => {
    if (!scheduled) return null;
    const start = new Date(scheduled).getTime();
    if (start - Date.now() > 0) {
      const mins = Math.ceil((start - Date.now()) / 60000);
      return `Interview opens ${mins > 60 ? `in ${Math.ceil(mins / 60)} h` : `in ${mins} min`}`;
    }
    return null;
  };

  if (error) return <CandidateShell><ErrorCard message={error} /></CandidateShell>;

  if (!ctx) {
    return (
      <CandidateShell>
        <div className="py-20 text-center text-sm text-muted-foreground">Loading interview details…</div>
      </CandidateShell>
    );
  }

  const cd = countdownToWindow(ctx.round_instance.scheduled_at);

  return (
    <CandidateShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Almost ready, {ctx.candidate.name ?? "there"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.campaign.name} · Round {ctx.round.round_number} of {ctx.campaign.number_of_rounds}
          </p>
        </div>

        {(ctx.session.status === "expired" || ctx.round_instance.deadline_at && new Date(ctx.round_instance.deadline_at).getTime() < Date.now()) && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
            This interview link has expired. Contact the recruiter for a new link.
          </div>
        )}

        {(ctx.round_instance.retake_of_round_instance_id || ctx.round_instance.fault_reason) && (
          <div className="rounded-xl border border-accent/40 bg-accent/15 p-4 text-sm text-accent-foreground">
            A platform hiccup interrupted your earlier attempt, so this is a retake. We'll go again
            from the top — your previous answers haven't been lost track of.
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Setup check</p>
          {cxCheckBox(cameraOk, "Camera & microphone")}
          {cxCheckBox(!!streamRef.current, "Recording enabled")}
          {cxCheckBox(consented, "Consent to be recorded")}
          <div className="mt-3">
            {!cameraOk ? (
              <button
                onClick={startCamera}
                disabled={checking}
                className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary disabled:opacity-60"
              >
                {checking ? "Checking…" : "Allow camera & mic"}
              </button>
            ) : (
              <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-lg bg-foreground object-cover" />
            )}
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-border p-4 shadow-sm">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            This interview will be recorded and may be reviewed by the recruiter and our AI evaluator. By continuing you agree to this.
          </span>
        </label>

        {cd && <p className="text-center text-xs text-muted-foreground">{cd}</p>}

        <button
          disabled={!cameraOk || !consented}
          onClick={() => navigate(`/interview/${session_id}/conduct`)}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary disabled:bg-muted disabled:text-muted-foreground"
        >
          Start interview →
        </button>
      </div>
    </CandidateShell>
  );
}

function cxCheckBox(ok: boolean, label: string) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-foreground">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-success/100" : "bg-muted"}`} />
      {label}
    </div>
  );
}