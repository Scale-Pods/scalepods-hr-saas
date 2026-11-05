import {
  AlertTriangle,
  CheckCircle,
  Loader,
  Monitor,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { InterviewSession } from "../types";

// 90-second window to give candidates ample time to notice, read, and click 'Allow' on browser permission prompts
const DEVICE_CHECK_TIMEOUT_MS = 90000;

interface DeviceCheck {
  camera: boolean | null;
  microphone: boolean | null;
  network: boolean | null;
}

interface CheckItem {
  key: keyof DeviceCheck;
  label: string;
  desc: string;
}

const CHECK_ITEMS: CheckItem[] = [
  { key: "camera", label: "Camera", desc: "Required for video recording and face detection" },
  { key: "microphone", label: "Microphone", desc: "Required for voice input" },
  { key: "network", label: "Internet Connection", desc: "Stable connection required" },
];

interface PreCheckProps {
  onComplete: () => void;
  session: InterviewSession | null;
}

export function PreCheck({ onComplete, session }: PreCheckProps) {
  const [checks, setChecks] = useState<DeviceCheck>({
    camera: null,
    microphone: null,
    network: null,
  });
  const [checking, setChecking] = useState(true);
  const [consented, setConsented] = useState(false);
  const [retrying, setRetrying] = useState<keyof DeviceCheck | null>(null);
  const [visibleOrder, setVisibleOrder] = useState(0);
  const [faceDetectorWarning, setFaceDetectorWarning] = useState(false);

  const checkCamera = useCallback(async (timeoutMs = DEVICE_CHECK_TIMEOUT_MS): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    const tmr = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Permission prompt timed out")), timeoutMs),
    );
    try {
      const stream = (await Promise.race([
        navigator.mediaDevices.getUserMedia({ video: true }),
        tmr,
      ])) as MediaStream;
      for (const t of stream.getTracks()) {
        t.stop();
      }
      return true;
    } catch (e) {
      console.log("PreCheck camera failed:", (e as Error)?.name || (e as Error)?.message);
      return false;
    }
  }, []);

  const checkMicrophone = useCallback(
    async (timeoutMs = DEVICE_CHECK_TIMEOUT_MS): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return false;
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
          // Fallback to simple audio: true if complex audio constraints fail
          stream = (await Promise.race([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            tmr,
          ])) as MediaStream;
        }
        for (const t of stream.getTracks()) {
          t.stop();
        }
        return true;
      } catch (e) {
        console.log("PreCheck microphone failed:", (e as Error)?.name || (e as Error)?.message);
        return false;
      }
    },
    [],
  );

  const runAllChecks = useCallback(async () => {
    setChecking(true);
    setChecks({
      camera: null,
      microphone: null,
      network: typeof navigator !== "undefined" ? navigator.onLine : true,
    });

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setChecks({ camera: false, microphone: false, network: false });
      setChecking(false);
      return;
    }

    // Attempt to request both video and audio in a single prompt so candidate only needs to click 'Allow' once
    let cameraResult: boolean | null = null;
    let micResult: boolean | null = null;

    try {
      const combinedStream = (await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: true,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Permission prompt timed out")),
            DEVICE_CHECK_TIMEOUT_MS,
          ),
        ),
      ])) as MediaStream;

      for (const track of combinedStream.getTracks()) {
        track.stop();
      }
      cameraResult = true;
      micResult = true;
    } catch (combinedErr) {
      const errName = (combinedErr as Error)?.name;
      console.log(
        "PreCheck combined media request deferred or failed, attempting individual checks:",
        errName || (combinedErr as Error)?.message,
      );

      // If user explicitly denied permission, both failed
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        cameraResult = false;
        micResult = false;
      } else {
        // Fall back to checking devices individually with generous 90-second window
        const [camOk, micOk] = await Promise.all([
          checkCamera(DEVICE_CHECK_TIMEOUT_MS),
          checkMicrophone(DEVICE_CHECK_TIMEOUT_MS),
        ]);
        cameraResult = camOk;
        micResult = micOk;
      }
    }

    setChecks({
      camera: cameraResult ?? false,
      microphone: micResult ?? false,
      network: typeof navigator !== "undefined" ? navigator.onLine : true,
    });
    setChecking(false);

    if (typeof window !== "undefined" && !("FaceDetector" in window)) {
      setFaceDetectorWarning(true);
    }
  }, [checkCamera, checkMicrophone]);

  const retryCamera = async () => {
    setRetrying("camera");
    setChecks((prev) => ({ ...prev, camera: null }));
    const ok = await checkCamera(DEVICE_CHECK_TIMEOUT_MS);
    setChecks((prev) => ({ ...prev, camera: ok }));
    setRetrying(null);
  };

  const retryMicrophone = async () => {
    setRetrying("microphone");
    setChecks((prev) => ({ ...prev, microphone: null }));
    const ok = await checkMicrophone(DEVICE_CHECK_TIMEOUT_MS);
    setChecks((prev) => ({ ...prev, microphone: ok }));
    setRetrying(null);
  };

  useEffect(() => {
    runAllChecks();
    const fallback = setTimeout(() => {
      setChecks((prev) => {
        const next = { ...prev };
        if (next.camera === null) next.camera = false;
        if (next.microphone === null) next.microphone = false;
        if (next.network === null) next.network = false;
        return next;
      });
      setChecking(false);
    }, DEVICE_CHECK_TIMEOUT_MS + 5000);
    return () => {
      clearTimeout(fallback);
    };
  }, [runAllChecks]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHECK_ITEMS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleOrder(i + 1), (i + 1) * 150));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const allRequired = checks.camera === true && checks.network === true;
  const canStart = allRequired && consented;

  const candidateName =
    session?.candidate?.name || (session as any)?.candidates_ai_interview?.name || "";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full animate-slide-up">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--blue)" }}
          >
            <Monitor size={28} className="text-white" />
          </div>
          <h1
            className="text-3xl font-bold"
            style={{
              background: "linear-gradient(to right, var(--label-primary), var(--label-secondary))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Pre-Interview Check
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--label-secondary)" }}>
            We need to verify your devices and connection before starting
          </p>
        </div>

        {candidateName && (
          <div className="card p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--label-tertiary)" }}>Candidate:</span>
              <span className="font-medium" style={{ color: "var(--label-primary)" }}>
                {candidateName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--label-tertiary)" }}>Questions:</span>
              <span style={{ color: "var(--label-primary)" }}>10-12 Questions</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--label-tertiary)" }}>Duration:</span>
              <span style={{ color: "var(--label-primary)" }}>25 Minutes</span>
            </div>
          </div>
        )}

        <div className="card p-6 space-y-3 mb-6">
          {CHECK_ITEMS.map(({ key, label, desc }, idx) => {
            const status = checks[key];
            const passed = status === true;
            const failed = status === false;
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
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500"
                  style={{
                    background: isRetrying
                      ? "color-mix(in srgb, var(--blue) 10%, transparent)"
                      : checking
                        ? "var(--fill-tertiary)"
                        : passed
                          ? "color-mix(in srgb, var(--green) 10%, transparent)"
                          : "color-mix(in srgb, var(--red) 10%, transparent)",
                  }}
                >
                  {isRetrying ? (
                    <Loader size={18} style={{ color: "var(--blue)" }} className="animate-spin" />
                  ) : checking ? (
                    <Loader
                      size={18}
                      style={{ color: "var(--label-secondary)" }}
                      className="animate-spin"
                    />
                  ) : passed ? (
                    <CheckCircle
                      size={18}
                      style={{ color: "var(--green)" }}
                      className="animate-fade-in"
                    />
                  ) : (
                    <XCircle
                      size={18}
                      style={{ color: "var(--red)" }}
                      className="animate-fade-in"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--label-primary)" }}>
                    {label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--label-tertiary)" }}>
                    {isRetrying
                      ? "Requesting permission... Please click 'Allow' in your browser"
                      : checking && status === null && (key === "camera" || key === "microphone")
                        ? "Requesting permission... Please click 'Allow' in your browser"
                        : failed && (key === "camera" || key === "microphone")
                          ? `${desc}. Please click 'Retry' and allow browser access.`
                          : desc}
                  </p>
                </div>
                {!checking && failed && (key === "microphone" || key === "camera") && (
                  <button
                    type="button"
                    onClick={key === "microphone" ? retryMicrophone : retryCamera}
                    disabled={isRetrying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition disabled:opacity-50 shrink-0"
                    style={{ background: "var(--fill-tertiary)", color: "var(--label-secondary)" }}
                  >
                    <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
                    Retry
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

        {faceDetectorWarning && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6 animate-fade-in"
            style={{
              background: "color-mix(in srgb, var(--orange) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--orange) 20%, transparent)",
            }}
          >
            <AlertTriangle
              size={16}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--orange)" }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--orange)" }}>
                Browser Compatibility Note
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "color-mix(in srgb, var(--orange) 70%, transparent)" }}
              >
                Face detection may not be available in this browser. Video will still be recorded.
                For best results, use Chrome or Edge.
              </p>
            </div>
          </div>
        )}

        <div className="card p-5 mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} style={{ color: "var(--blue)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--label-primary)" }}>
              Rules & Guidelines
            </h2>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
            style={{ color: "var(--label-secondary)" }}
          >
            <div>
              <p className="font-medium" style={{ color: "var(--label-primary)" }}>
                Monitored
              </p>
              <ul className="space-y-1 mt-1.5">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--blue)" }} />{" "}
                  Video & audio recording
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--blue)" }} />{" "}
                  Screen activity
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--blue)" }} />{" "}
                  Browser tab focus
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--blue)" }} />{" "}
                  Keyboard & mouse activity
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium" style={{ color: "var(--label-primary)" }}>
                Prohibited
              </p>
              <ul className="space-y-1 mt-1.5">
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--red)" }} />{" "}
                  Switching browser tabs
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--red)" }} />{" "}
                  Using other devices
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--red)" }} />{" "}
                  Copy-pasting answers
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--red)" }} />{" "}
                  Leaving fullscreen mode
                </li>
              </ul>
            </div>
          </div>
        </div>

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
            browser prompts for screen sharing, select <strong>Entire Screen</strong>. Sharing a
            single tab or single window is prohibited and will be rejected.
          </div>
        </div>

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
            will be monitored for integrity purposes.
          </span>
        </label>

        {checking ? (
          <div
            className="flex items-center justify-center gap-2 text-sm py-3"
            style={{ color: "var(--label-secondary)" }}
          >
            <Loader size={16} className="animate-spin" /> Running checks...
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (canStart) onComplete();
            }}
            disabled={!canStart}
            className="w-full py-3.5 rounded-xl font-medium transition-all duration-200"
            style={{
              background: canStart ? "var(--blue)" : "var(--fill-tertiary)",
              color: canStart ? "white" : "var(--label-tertiary)",
              cursor: canStart ? "pointer" : "not-allowed",
              boxShadow: canStart ? "var(--glass-shadow)" : "none",
            }}
          >
            {checks.camera === null
              ? "Running checks..."
              : allRequired
                ? "Start Interview"
                : "Camera or network required"}
          </button>
        )}
      </div>
    </div>
  );
}
