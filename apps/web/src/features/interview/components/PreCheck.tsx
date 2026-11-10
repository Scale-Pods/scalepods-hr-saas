import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle,
  HelpCircle,
  Laptop,
  Loader,
  Lock,
  Mic,
  Monitor,
  RefreshCw,
  Shield,
  Volume2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewSession } from "../types";
import { checkDesktopDevice, checkSingleDisplay } from "../utils/environmentCheck";

// 120-second window to give candidates generous time to review and allow permissions
const DEVICE_CHECK_TIMEOUT_MS = 120000;

interface DeviceCheck {
  device: boolean | null;
  display: boolean | null;
  camera: boolean | null;
  microphone: boolean | null;
  network: boolean | null;
}

interface DeviceErrors {
  device: string | null;
  display: string | null;
  camera: string | null;
  microphone: string | null;
  network: string | null;
}

interface CheckItem {
  key: keyof DeviceCheck;
  label: string;
  desc: string;
  icon: typeof Camera;
}

const CHECK_ITEMS: CheckItem[] = [
  {
    key: "device",
    label: "Laptop / Desktop PC",
    desc: "Mobile phones and tablets are not permitted",
    icon: Laptop,
  },
  {
    key: "display",
    label: "Single Screen Only",
    desc: "Only one active display allowed (no external monitors)",
    icon: Monitor,
  },
  {
    key: "camera",
    label: "Camera",
    desc: "Required for face, gaze, and object monitoring",
    icon: Camera,
  },
  {
    key: "microphone",
    label: "Microphone",
    desc: "Required for voice input and speech-to-text",
    icon: Mic,
  },
  {
    key: "network",
    label: "Internet Connection",
    desc: "Stable connection required",
    icon: Monitor,
  },
];

interface PreCheckProps {
  onComplete: () => void;
  session: InterviewSession | null;
}

// Parse a friendly error message from standard media exceptions
function parseMediaError(err: unknown): string {
  const error = err as Error;
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Access blocked by browser. Click the 🔒 lock icon in the address bar to allow.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No physical device detected. Please plug in or connect your camera/mic.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Device is currently in use by another app (e.g., Zoom, Teams). Please close it.";
  }
  if (name === "OverconstrainedError") {
    return "Device could not satisfy requested settings. Trying standard constraints.";
  }
  return error?.message || "Permission request was not completed.";
}

export function PreCheck({ onComplete, session }: PreCheckProps) {
  const [checks, setChecks] = useState<DeviceCheck>({
    device: null,
    display: null,
    camera: null,
    microphone: null,
    network: null,
  });
  const [errors, setErrors] = useState<DeviceErrors>({
    device: null,
    display: null,
    camera: null,
    microphone: null,
    network: null,
  });
  const [checking, setChecking] = useState(true);
  const [consented, setConsented] = useState(false);
  const [retrying, setRetrying] = useState<keyof DeviceCheck | null>(null);
  const [visibleOrder, setVisibleOrder] = useState(0);
  const [faceDetectorWarning, setFaceDetectorWarning] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Set preview video element with instant binding
  const setPreviewVideoRef = useCallback((el: HTMLVideoElement | null) => {
    previewVideoRef.current = el;
    if (el && previewStreamRef.current) {
      el.srcObject = previewStreamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // Setup real-time audio volume monitoring for candidate microphone testing
  const attachAudioMeter = useCallback((stream: MediaStream) => {
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize roughly between 0 and 100
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch {
      // Audio meter is a progressive enhancement; fail gracefully
    }
  }, []);

  // Teardown live preview media tracks and audio listeners
  const stopLivePreview = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (previewStreamRef.current) {
      for (const track of previewStreamRef.current.getTracks()) {
        track.stop();
      }
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setMicVolume(0);
  }, []);

  // Update preview stream video element
  const updatePreviewStream = useCallback((newStream: MediaStream) => {
    previewStreamRef.current = newStream;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = newStream;
      previewVideoRef.current.play().catch(() => {});
    }
  }, []);

  // Check camera with fallback and timeout
  const checkCamera = useCallback(
    async (timeoutMs = DEVICE_CHECK_TIMEOUT_MS): Promise<{ ok: boolean; error: string | null }> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return { ok: false, error: "Media devices not supported in this browser environment." };
      }
      const tmr = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Permission prompt timed out")), timeoutMs),
      );
      try {
        const stream = (await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          }),
          tmr,
        ])) as MediaStream;

        // If we don't have a live preview, keep this track for video preview
        if (!previewStreamRef.current) {
          updatePreviewStream(stream);
        } else {
          // Replace or add video track to current preview stream
          const existingAudioTracks = previewStreamRef.current.getAudioTracks();
          const combined = new MediaStream([...existingAudioTracks, ...stream.getVideoTracks()]);
          updatePreviewStream(combined);
        }
        return { ok: true, error: null };
      } catch (e) {
        const msg = parseMediaError(e);
        console.log("PreCheck camera failed:", (e as Error)?.name || (e as Error)?.message);
        return { ok: false, error: msg };
      }
    },
    [updatePreviewStream],
  );

  // Check microphone with constraint fallback and timeout
  const checkMicrophone = useCallback(
    async (timeoutMs = DEVICE_CHECK_TIMEOUT_MS): Promise<{ ok: boolean; error: string | null }> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return { ok: false, error: "Media devices not supported in this browser environment." };
      }
      const tmr = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Permission prompt timed out")), timeoutMs),
      );
      try {
        let stream: MediaStream;
        try {
          stream = (await Promise.race([
            navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }),
            tmr,
          ])) as MediaStream;
        } catch {
          stream = (await Promise.race([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            tmr,
          ])) as MediaStream;
        }

        attachAudioMeter(stream);

        if (!previewStreamRef.current) {
          updatePreviewStream(stream);
        } else {
          const existingVideoTracks = previewStreamRef.current.getVideoTracks();
          const combined = new MediaStream([...existingVideoTracks, ...stream.getAudioTracks()]);
          updatePreviewStream(combined);
        }
        return { ok: true, error: null };
      } catch (e) {
        const msg = parseMediaError(e);
        console.log("PreCheck microphone failed:", (e as Error)?.name || (e as Error)?.message);
        return { ok: false, error: msg };
      }
    },
    [attachAudioMeter, updatePreviewStream],
  );

  // Master check runner with gesture-friendly single prompt and non-destructive fallbacks
  const runAllChecks = useCallback(
    async (isUserInitiated = false) => {
      setChecking(true);
      const devRes = checkDesktopDevice();
      const dispRes = checkSingleDisplay();
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;

      setChecks({
        device: devRes.ok,
        display: dispRes.ok,
        camera: null,
        microphone: null,
        network: online,
      });
      setErrors({
        device: devRes.reason,
        display: dispRes.reason,
        camera: null,
        microphone: null,
        network: null,
      });

      if (!devRes.ok) {
        setChecking(false);
        return;
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setChecks({
          device: devRes.ok,
          display: dispRes.ok,
          camera: false,
          microphone: false,
          network: false,
        });
        setErrors({
          device: devRes.reason,
          display: dispRes.reason,
          camera: "Browser does not support media devices.",
          microphone: "Browser does not support media devices.",
          network: null,
        });
        setChecking(false);
        return;
      }

      // Step 1: Query permissions API first if available
      let isCamBlocked = false;
      let isMicBlocked = false;
      try {
        if (navigator.permissions?.query) {
          const [camStatus, micStatus] = await Promise.allSettled([
            navigator.permissions.query({ name: "camera" as PermissionName }),
            navigator.permissions.query({ name: "microphone" as PermissionName }),
          ]);
          if (camStatus.status === "fulfilled" && camStatus.value.state === "denied") {
            isCamBlocked = true;
          }
          if (micStatus.status === "fulfilled" && micStatus.value.state === "denied") {
            isMicBlocked = true;
          }
        }
      } catch {
        // Ignore permissions API failures on unsupported browsers
      }

      // If permissions are already explicitly blocked in site settings, immediately guide candidate
      if (isCamBlocked || isMicBlocked) {
        setShowPermissionGuide(true);
        setChecks({
          device: devRes.ok,
          display: dispRes.ok,
          camera: !isCamBlocked,
          microphone: !isMicBlocked,
          network: typeof navigator !== "undefined" ? navigator.onLine : true,
        });
        setErrors({
          device: devRes.reason,
          display: dispRes.reason,
          camera: isCamBlocked
            ? "Blocked in site settings. Click the 🔒 lock icon above to allow."
            : null,
          microphone: isMicBlocked
            ? "Blocked in site settings. Click the 🔒 lock icon above to allow."
            : null,
          network: null,
        });
        setChecking(false);
        return;
      }

      // Step 2: Attempt combined stream request
      try {
        const combinedStream = (await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Permission prompt timed out")),
              DEVICE_CHECK_TIMEOUT_MS,
            ),
          ),
        ])) as MediaStream;

        updatePreviewStream(combinedStream);
        attachAudioMeter(combinedStream);

        setChecks({
          device: devRes.ok,
          display: dispRes.ok,
          camera: true,
          microphone: true,
          network: typeof navigator !== "undefined" ? navigator.onLine : true,
        });
        setErrors({
          device: devRes.reason,
          display: dispRes.reason,
          camera: null,
          microphone: null,
          network: null,
        });
        setChecking(false);
        return;
      } catch (combinedErr) {
        const errName = (combinedErr as Error)?.name;
        console.log(
          "PreCheck combined request deferred:",
          errName || (combinedErr as Error)?.message,
        );

        // In non-user-initiated requests on page load, modern browsers may suppress the prompt without user gesture.
        // Do NOT turn cards red unless this was explicitly user-initiated OR explicitly denied by user!
        if (
          !isUserInitiated &&
          (errName === "NotAllowedError" || errName === "PermissionDeniedError")
        ) {
          // Keep in neutral state with prompt guidance rather than immediate red failure
          setChecks({
            device: devRes.ok,
            display: dispRes.ok,
            camera: null,
            microphone: null,
            network: typeof navigator !== "undefined" ? navigator.onLine : true,
          });
          setChecking(false);
          return;
        }

        // If user-initiated or explicit error, run individual checks
        const [camRes, micRes] = await Promise.all([
          checkCamera(DEVICE_CHECK_TIMEOUT_MS),
          checkMicrophone(DEVICE_CHECK_TIMEOUT_MS),
        ]);

        if (!camRes.ok || !micRes.ok) {
          if (
            camRes.error?.includes("lock icon") ||
            micRes.error?.includes("lock icon") ||
            errName === "NotAllowedError"
          ) {
            setShowPermissionGuide(true);
          }
        }

        setChecks({
          device: devRes.ok,
          display: dispRes.ok,
          camera: camRes.ok,
          microphone: micRes.ok,
          network: typeof navigator !== "undefined" ? navigator.onLine : true,
        });
        setErrors({
          device: devRes.reason,
          display: dispRes.reason,
          camera: camRes.error,
          microphone: micRes.error,
          network: null,
        });
        setChecking(false);
      }

      if (typeof window !== "undefined" && !("FaceDetector" in window)) {
        setFaceDetectorWarning(true);
      }
    },
    [attachAudioMeter, checkCamera, checkMicrophone, updatePreviewStream],
  );

  const retryCamera = async () => {
    setRetrying("camera");
    setChecks((prev) => ({ ...prev, camera: null }));
    setErrors((prev) => ({ ...prev, camera: null }));
    const res = await checkCamera(DEVICE_CHECK_TIMEOUT_MS);
    setChecks((prev) => ({ ...prev, camera: res.ok }));
    setErrors((prev) => ({ ...prev, camera: res.error }));
    if (!res.ok && res.error?.includes("lock icon")) {
      setShowPermissionGuide(true);
    }
    setRetrying(null);
  };

  const retryMicrophone = async () => {
    setRetrying("microphone");
    setChecks((prev) => ({ ...prev, microphone: null }));
    setErrors((prev) => ({ ...prev, microphone: null }));
    const res = await checkMicrophone(DEVICE_CHECK_TIMEOUT_MS);
    setChecks((prev) => ({ ...prev, microphone: res.ok }));
    setErrors((prev) => ({ ...prev, microphone: res.error }));
    if (!res.ok && res.error?.includes("lock icon")) {
      setShowPermissionGuide(true);
    }
    setRetrying(null);
  };

  const retryDisplay = () => {
    const dispRes = checkSingleDisplay();
    setChecks((prev) => ({ ...prev, display: dispRes.ok }));
    setErrors((prev) => ({ ...prev, display: dispRes.reason }));
  };

  // Live poll single-display status on PreCheck so unplugging an extra monitor unlocks immediately
  useEffect(() => {
    const t = setInterval(() => {
      const dispRes = checkSingleDisplay();
      setChecks((prev) => (prev.display === dispRes.ok ? prev : { ...prev, display: dispRes.ok }));
      setErrors((prev) =>
        prev.display === dispRes.reason ? prev : { ...prev, display: dispRes.reason },
      );
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Initial check on mount
  useEffect(() => {
    runAllChecks(false);
    return () => {
      stopLivePreview();
    };
  }, [runAllChecks, stopLivePreview]);

  // Ensure video element receives stream and plays as soon as camera is verified
  useEffect(() => {
    if (checks.camera === true && previewVideoRef.current && previewStreamRef.current) {
      previewVideoRef.current.srcObject = previewStreamRef.current;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [checks.camera]);

  // Resume suspended AudioContext on candidate interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      if (previewVideoRef.current?.paused && previewStreamRef.current) {
        previewVideoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener("click", handleUserInteraction);
    window.addEventListener("pointerdown", handleUserInteraction);
    return () => {
      window.removeEventListener("click", handleUserInteraction);
      window.removeEventListener("pointerdown", handleUserInteraction);
    };
  }, []);

  // Staggered appearance of check list items
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHECK_ITEMS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleOrder(i + 1), (i + 1) * 120));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const allRequired =
    checks.device === true &&
    checks.display === true &&
    checks.camera === true &&
    checks.network === true;
  const canStart = allRequired && consented;

  const candEmail = session?.candidate?.email || "";
  const rawCandidateName =
    session?.candidate?.name ||
    (session as unknown as { candidates_ai_interview?: { name?: string } })?.candidates_ai_interview
      ?.name ||
    (session as unknown as { candidate_name?: string })?.candidate_name ||
    "";

  let candidateName =
    rawCandidateName.trim().toLowerCase() === "candidate" ? "" : rawCandidateName.trim();
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

  const handleStartInterview = () => {
    stopLivePreview();
    onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full animate-slide-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--blue)" }}
          >
            <Monitor size={28} className="text-white" />
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(to right, var(--label-primary), var(--label-secondary))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Pre-Interview Device Check
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--label-secondary)" }}>
            Verify your camera, microphone, and internet connection before starting
          </p>
        </div>

        {/* Info Card */}
        <div className="card p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {candidateName && (
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--label-tertiary)" }}>Candidate:</span>
              <span className="font-semibold" style={{ color: "var(--label-primary)" }}>
                {candidateName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--label-tertiary)" }}>Questions:</span>
            <span style={{ color: "var(--label-primary)" }}>10 Questions</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--label-tertiary)" }}>Duration:</span>
            <span style={{ color: "var(--label-primary)" }}>25 Minutes</span>
          </div>
        </div>

        {/* Browser Permission Guidance Banner (if blocked or needed) */}
        {showPermissionGuide && (
          <div
            className="p-4 rounded-xl mb-6 animate-fade-in border flex items-start gap-3.5"
            style={{
              background: "color-mix(in srgb, var(--orange) 10%, transparent)",
              borderColor: "color-mix(in srgb, var(--orange) 30%, transparent)",
            }}
          >
            <Lock size={20} className="shrink-0 mt-0.5" style={{ color: "var(--orange)" }} />
            <div className="text-xs space-y-1.5 flex-1">
              <p className="font-semibold text-sm" style={{ color: "var(--orange)" }}>
                Browser Permission Needed
              </p>
              <p style={{ color: "var(--label-primary)" }}>
                Camera or Microphone access is currently blocked. To allow access:
              </p>
              <ol
                className="list-decimal pl-4 space-y-1"
                style={{ color: "var(--label-secondary)" }}
              >
                <li>
                  Click the <strong>🔒 lock or tune icon</strong> at the left of the URL address bar
                  above.
                </li>
                <li>
                  Switch <strong>Camera</strong> and <strong>Microphone</strong> to{" "}
                  <strong>Allow</strong>.
                </li>
                <li>Click the &ldquo;Enable Devices&rdquo; or &ldquo;Retry&rdquo; button below.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Live Camera & Microphone Test Preview */}
        {checks.camera === true && (
          <div className="card p-4 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Live Camera Preview
                </span>
              </div>
              <span className="text-xs" style={{ color: "var(--label-tertiary)" }}>
                Check your lighting and position
              </span>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden bg-black/80 flex items-center justify-center border border-white/10 shadow-inner">
              <video
                ref={setPreviewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />

              {/* Live Audio Meter Overlay */}
              <div
                className="absolute bottom-3 left-3 right-3 flex items-center gap-3 px-3 py-2 rounded-lg backdrop-blur-md"
                style={{
                  background: "rgba(0,0,0,0.65)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div className="flex items-center gap-1.5 text-xs text-white shrink-0">
                  <Volume2
                    size={14}
                    className={micVolume > 10 ? "text-emerald-400" : "text-white/60"}
                  />
                  <span className="text-[11px] font-medium">Mic Level:</span>
                </div>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${Math.max(4, micVolume)}%`,
                      background:
                        micVolume > 60
                          ? "var(--green)"
                          : micVolume > 15
                            ? "var(--blue)"
                            : "var(--label-tertiary)",
                    }}
                  />
                </div>
                <span className="text-[10px] text-white/70 tabular-nums shrink-0">
                  {micVolume > 10 ? "Speaking detected" : "Say something to test"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="card p-6 space-y-3 mb-6">
          {CHECK_ITEMS.map(({ key, label, desc, icon: Icon }, idx) => {
            const status = checks[key];
            const errorMsg = errors[key];
            const passed = status === true;
            const failed = status === false;
            const isWaiting = status === null;
            const isVisible = visibleOrder > idx;
            const isRetrying = retrying === key;

            return (
              <div
                key={key}
                className="flex items-center gap-4 p-4 rounded-xl transition-all duration-500"
                style={{
                  border: failed
                    ? "1px solid color-mix(in srgb, var(--red) 30%, transparent)"
                    : passed
                      ? "1px solid color-mix(in srgb, var(--green) 30%, transparent)"
                      : "1px solid var(--separator)",
                  background: failed
                    ? "color-mix(in srgb, var(--red) 5%, transparent)"
                    : passed
                      ? "color-mix(in srgb, var(--green) 5%, transparent)"
                      : "var(--fill-quaternary)",
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(16px)",
                }}
              >
                {/* Status Indicator Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500"
                  style={{
                    background: isRetrying
                      ? "color-mix(in srgb, var(--blue) 15%, transparent)"
                      : checking || isWaiting
                        ? "color-mix(in srgb, var(--blue) 10%, transparent)"
                        : passed
                          ? "color-mix(in srgb, var(--green) 12%, transparent)"
                          : "color-mix(in srgb, var(--red) 12%, transparent)",
                  }}
                >
                  {isRetrying ? (
                    <Loader size={18} style={{ color: "var(--blue)" }} className="animate-spin" />
                  ) : checking && isWaiting ? (
                    <Loader size={18} style={{ color: "var(--blue)" }} className="animate-spin" />
                  ) : passed ? (
                    <CheckCircle
                      size={18}
                      style={{ color: "var(--green)" }}
                      className="animate-fade-in"
                    />
                  ) : failed ? (
                    <XCircle
                      size={18}
                      style={{ color: "var(--red)" }}
                      className="animate-fade-in"
                    />
                  ) : (
                    <Icon size={18} style={{ color: "var(--blue)" }} />
                  )}
                </div>

                {/* Content & Descriptions */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--label-primary)" }}>
                      {label}
                    </p>
                    {passed && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                        Ready
                      </span>
                    )}
                    {isWaiting && !checking && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                        Awaiting Permission
                      </span>
                    )}
                  </div>

                  <p
                    className="text-xs mt-0.5 line-clamp-2"
                    style={{ color: "var(--label-tertiary)" }}
                  >
                    {isRetrying
                      ? "Requesting device... Please click 'Allow' in your browser"
                      : checking && isWaiting
                        ? "Checking device status... Please click 'Allow' if prompted"
                        : failed
                          ? errorMsg || `${desc}. Click 'Retry' to request access.`
                          : isWaiting
                            ? "Permission not yet granted. Click 'Enable' to allow browser access."
                            : desc}
                  </p>
                </div>

                {/* Action Buttons */}
                {!checking &&
                  failed &&
                  (key === "microphone" || key === "camera" || key === "display") && (
                    <button
                      type="button"
                      onClick={
                        key === "microphone"
                          ? retryMicrophone
                          : key === "camera"
                            ? retryCamera
                            : retryDisplay
                      }
                      disabled={isRetrying}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50 shrink-0"
                      style={{ background: "var(--fill-tertiary)", color: "var(--label-primary)" }}
                    >
                      <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
                      {key === "display" ? "Re-check" : "Retry"}
                    </button>
                  )}

                {!checking && isWaiting && (key === "microphone" || key === "camera") && (
                  <button
                    type="button"
                    onClick={() => runAllChecks(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0"
                    style={{ background: "var(--blue)", color: "white" }}
                  >
                    Enable
                  </button>
                )}

                {!checking && passed && (
                  <CheckCircle
                    size={16}
                    style={{ color: "var(--green)" }}
                    className="shrink-0 animate-fade-in"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Global Action: Enable All if any waiting */}
        {!checking && (checks.camera !== true || checks.microphone !== true) && (
          <div className="flex items-center justify-between p-3.5 rounded-xl mb-6 bg-blue-500/10 border border-blue-500/20 text-xs">
            <div className="flex items-center gap-2 text-blue-300">
              <HelpCircle size={15} />
              <span>Click to trigger browser permission dialog</span>
            </div>
            <button
              type="button"
              onClick={() => runAllChecks(true)}
              className="px-3 py-1.5 rounded-lg font-medium text-white transition hover:opacity-90"
              style={{ background: "var(--blue)" }}
            >
              Request Camera & Mic
            </button>
          </div>
        )}

        {/* Compatibility Warning */}
        {faceDetectorWarning && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6 animate-fade-in"
            style={{
              background: "color-mix(in srgb, var(--orange) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--orange) 20%, transparent)",
            }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-300">Browser Compatibility Note</p>
              <p className="text-xs mt-0.5 text-amber-200/80">
                Face detection may not be fully available in this browser. Video will still be
                recorded. For best results, use Chrome or Edge.
              </p>
            </div>
          </div>
        )}

        {/* Rules & Integrity Guidelines */}
        <div className="card p-5 mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} style={{ color: "var(--blue)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--label-primary)" }}>
              Interview Integrity Guidelines
            </h2>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
            style={{ color: "var(--label-secondary)" }}
          >
            <div>
              <p className="font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <CheckCircle size={13} /> Monitored
              </p>
              <ul className="space-y-1">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" /> Laptop / PC single-screen
                  check
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" /> Mandatory Entire Screen
                  sharing
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" /> AI camera tracking (gaze,
                  faces, mobile objects)
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" /> Single-tab focus &
                  fullscreen lock
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-rose-400 mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={13} /> Strictly Prohibited (Auto-Terminates)
              </p>
              <ul className="space-y-1">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-rose-400" /> Phones, tablets, or multiple
                  monitors
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-rose-400" /> Mobile phones / notes in
                  camera view
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-rose-400" /> Switching tabs, looking
                  away, or copy/paste
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-rose-400" /> Exiting fullscreen or
                  stopping screen share
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Proctoring Screen Sharing Notice */}
        <div
          className="flex items-start gap-3 p-3.5 rounded-xl mb-4 text-xs animate-fade-in"
          style={{
            background: "color-mix(in srgb, var(--blue) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--blue) 25%, transparent)",
            color: "var(--label-primary)",
          }}
        >
          <Monitor size={18} className="shrink-0 mt-0.5" style={{ color: "var(--blue)" }} />
          <div>
            <span className="font-semibold text-blue-400">Proctoring Notice:</span> When your
            browser prompts for screen sharing after clicking &ldquo;Start Interview&rdquo;, select{" "}
            <strong>Entire Screen</strong>. Sharing only a single tab or window is not permitted.
          </div>
        </div>

        {/* Consent Checkbox */}
        <label
          className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6 cursor-pointer group animate-fade-in"
          style={{ background: "var(--fill-quaternary)", border: "1px solid var(--separator)" }}
        >
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: "var(--blue)" }}
          />
          <span className="text-sm transition" style={{ color: "var(--label-secondary)" }}>
            I consent to video and audio recording during this interview. I understand my activity
            will be monitored for proctoring and integrity purposes.
          </span>
        </label>

        {/* Start Button */}
        {checking ? (
          <div
            className="flex items-center justify-center gap-2 text-sm py-3.5"
            style={{ color: "var(--label-secondary)" }}
          >
            <Loader size={16} className="animate-spin text-blue-400" /> Running device check...
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (canStart) handleStartInterview();
            }}
            disabled={!canStart}
            className="w-full py-4 rounded-xl font-semibold text-base transition-all duration-200"
            style={{
              background: canStart ? "var(--blue)" : "var(--fill-tertiary)",
              color: canStart ? "white" : "var(--label-tertiary)",
              cursor: canStart ? "pointer" : "not-allowed",
              boxShadow: canStart ? "0 4px 20px -2px rgba(59, 130, 246, 0.4)" : "none",
            }}
          >
            {checks.camera === null
              ? "Running checks..."
              : allRequired
                ? consented
                  ? "Start Interview"
                  : "Please Check Consent Box Above"
                : checks.device === false
                  ? "Laptop or Desktop PC Required"
                  : checks.display === false
                    ? "Disconnect External Monitors to Continue"
                    : "Camera, Microphone & Internet Required"}
          </button>
        )}
      </div>
    </div>
  );
}
