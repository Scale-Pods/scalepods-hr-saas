import {
  AlertCircle,
  AlertTriangle,
  Eye,
  Info,
  Maximize2,
  Mic,
  Monitor,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProctoringEvent, ProctoringSeverity } from "../types";
import { enterFullscreen, getFullscreenElement, isFullscreenSupported } from "../utils/fullscreen";
import { BEACON_COLOR_HEX, BEACON_PATTERNS, getBeaconPattern } from "../utils/screenVerification";

interface ProctoringOverlayProps {
  violations: ProctoringEvent[];
  sessionId: string;
  isScreenShareActive?: boolean;
  onRequestScreenShare?: () => void;
  multiScreenBlocked?: boolean;
  multiTabBlocked?: boolean;
  wrongScreenBlocked?: boolean;
  cameraBlocked?: boolean;
  onAutoTerminate?: (reason: string) => void;
}

const INTENTIONAL_VIOLATION_TYPES = new Set<string>([
  "fullscreen_exit",
  "keyboard_shortcut",
  "copy_paste",
  "tab_switch",
  "window_blur",
  "prohibited_object",
  "multi_screen",
  "screen_share_stopped",
  "wrong_screen",
  "camera_blocked",
  "face_absent",
  "multi_tab",
  "face_multiple",
]);

const CRITICAL_STRIKE_LIMIT = 5;
const SCREEN_SHARE_RESTORE_SECONDS = 20;
const BEACON_QUADRANT_IDS = ["tl", "tr", "bl", "br"] as const;

export function ProctoringOverlay({
  violations,
  sessionId: _sessionId,
  isScreenShareActive = true,
  onRequestScreenShare,
  multiScreenBlocked = false,
  multiTabBlocked = false,
  wrongScreenBlocked = false,
  cameraBlocked = false,
  onAutoTerminate,
}: ProctoringOverlayProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [warningSeverity, setWarningSeverity] = useState<ProctoringSeverity>("warning");
  const [isDisabled, setIsDisabled] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [totalViolationCount, setTotalViolationCount] = useState(0);
  const [screenShareCountdown, setScreenShareCountdown] = useState(SCREEN_SHARE_RESTORE_SECONDS);
  const [beaconState, setBeaconState] = useState<{ step: number; prevStep: number | null }>({
    step: 0,
    prevStep: null,
  });
  const [isFullscreen, setIsFullscreen] = useState(() =>
    !isFullscreenSupported() ? true : Boolean(getFullscreenElement()),
  );
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTerminatedRef = useRef(false);
  const onAutoTerminateRef = useRef(onAutoTerminate);
  onAutoTerminateRef.current = onAutoTerminate;

  useEffect(() => {
    if (!isFullscreenSupported()) {
      setIsFullscreen(true);
      return;
    }
    const syncFullscreen = () => setIsFullscreen(Boolean(getFullscreenElement()));
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (isFullscreen || isDisabled || !isFullscreenSupported()) return;
    const handleKeyGesture = () => {
      void enterFullscreen();
    };
    window.addEventListener("keydown", handleKeyGesture, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyGesture, { capture: true });
    };
  }, [isFullscreen, isDisabled]);

  const terminateSession = useCallback((reason: string) => {
    setIsDisabled(true);
    setWarningMessage(reason);
    if (!autoTerminatedRef.current) {
      autoTerminatedRef.current = true;
      onAutoTerminateRef.current?.(reason);
    }
  }, []);

  useEffect(() => {
    if (isDisabled) return;
    const interval = setInterval(() => {
      setBeaconState((prev) => ({
        step: (prev.step + 1) % BEACON_PATTERNS.length,
        prevStep: prev.step,
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [isDisabled]);

  const fullscreenGateActive = isFullscreenSupported() && !isFullscreen;
  const activeRestoreGate: "camera" | "screen_disconnected" | "wrong_screen" | null = cameraBlocked
    ? "camera"
    : !isScreenShareActive
      ? "screen_disconnected"
      : wrongScreenBlocked && !fullscreenGateActive
        ? "wrong_screen"
        : null;

  useEffect(() => {
    if (isDisabled || multiTabBlocked || multiScreenBlocked || !activeRestoreGate) {
      setScreenShareCountdown(SCREEN_SHARE_RESTORE_SECONDS);
      return;
    }

    setScreenShareCountdown(SCREEN_SHARE_RESTORE_SECONDS);
    const interval = setInterval(() => {
      setScreenShareCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          const reason =
            activeRestoreGate === "camera"
              ? "Interview terminated because your camera stayed covered or shutter stayed closed for 20 seconds."
              : activeRestoreGate === "wrong_screen"
                ? "Interview terminated because the shared screen did not match the interview window within 20 seconds."
                : "Interview terminated because entire screen sharing was not restored within 20 seconds.";
          terminateSession(reason);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRestoreGate, multiTabBlocked, multiScreenBlocked, isDisabled, terminateSession]);

  useEffect(() => {
    const last = violations[violations.length - 1];
    if (!last) return;

    setTotalViolationCount(violations.length);

    // Intentional violations toward termination
    const intentionalCritical = violations.filter(
      (v) => v.severity === "critical" && INTENTIONAL_VIOLATION_TYPES.has(v.event_type),
    ).length;

    if (intentionalCritical >= CRITICAL_STRIKE_LIMIT) {
      terminateSession("Interview terminated due to multiple critical security violations.");
      return;
    }

    setTabSwitchCount(
      violations.filter((v) => v.event_type === "tab_switch" || v.event_type === "window_blur")
        .length,
    );

    let message = "";
    const payload = (last.payload || {}) as Record<string, unknown>;
    const action = (payload.action as string) || "";
    const key = (payload.key as string) || "";

    switch (last.event_type) {
      case "tab_switch":
        message = "Tab switching detected. Please stay focused on the interview window.";
        break;
      case "window_blur":
        message = "Window focus lost. Please keep the interview window active and visible.";
        break;
      case "browser_resize":
        message = "Browser window resized. Please keep the interview window maximized.";
        break;
      case "fullscreen_exit":
        message = "Fullscreen mode exited. Please return to full screen mode to continue.";
        break;
      case "face_absent":
        message =
          "Face not detected in camera feed. Please align yourself directly in front of the camera.";
        break;
      case "face_multiple":
        message = "Multiple faces detected in camera feed. Only the candidate should be in view.";
        break;
      case "face_mismatch":
        message = "Camera feed mismatch detected. Please remain clearly visible.";
        break;
      case "gaze_away":
        message =
          "You appear to be looking away from the screen. Please keep your eyes on the interview window.";
        break;
      case "head_down":
        message =
          "Please look at the camera. Looking down for extended periods is not permitted during the interview.";
        break;
      case "audio_silence":
        message = "No audio input detected for an extended period. Please speak your answer.";
        break;
      case "audio_level":
        message = "Audio level anomaly detected. Please check your microphone setup.";
        break;
      case "copy_paste":
        if (action === "paste")
          message = "Pasting text is strictly prohibited during the interview.";
        else if (action === "copy") message = "Copying text is prohibited during the interview.";
        else message = "Copying or pasting content is prohibited during the interview.";
        break;
      case "keyboard_shortcut":
        if (key) message = `Keyboard shortcut (${key}) is disabled during the interview.`;
        else message = "Keyboard shortcuts are disabled during the interview.";
        break;
      case "prohibited_object": {
        const label = (payload.label as string) || "prohibited item";
        message = `Prohibited object detected (${label}). Remove it from camera view immediately.`;
        break;
      }
      case "multi_screen":
        message = "Multiple displays detected. Disconnect all external monitors to continue.";
        break;
      case "screen_share_stopped":
        message =
          "Entire screen sharing stopped. Re-share your entire screen immediately to continue.";
        break;
      case "wrong_screen":
        message =
          "Shared screen does not match the interview window. Share the screen displaying this interview.";
        break;
      case "camera_blocked":
        message =
          "Camera shutter is closed or lens is covered. Uncover your camera immediately to continue.";
        break;
      case "multi_tab":
        message = "Multiple interview tabs detected. Close extra tabs immediately.";
        break;
      case "device_blocked":
        message = "Unsupported device detected. Use a laptop or desktop PC.";
        break;
      default:
        message = "Security alert: Please adhere to all interview proctoring guidelines.";
    }

    setWarningMessage(message);
    setWarningSeverity(last.severity);
    setShowWarning(true);

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

    const duration =
      last.severity === "critical" ? 6000 : last.severity === "warning" ? 5000 : 4000;
    dismissTimerRef.current = setTimeout(() => {
      setShowWarning(false);
    }, duration);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [violations, terminateSession]);

  if (isDisabled) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)" }}
      >
        <div
          className="text-center max-w-md p-8 rounded-2xl"
          style={{ background: "var(--card-bg)", border: "1px solid var(--separator)" }}
        >
          <AlertTriangle
            size={64}
            className="mx-auto mb-4 animate-bounce"
            style={{ color: "var(--red)" }}
          />
          <h2 className="text-2xl font-bold text-white mb-2">Interview Terminated</h2>
          <p className="text-sm" style={{ color: "var(--label-secondary)" }}>
            {warningMessage}
          </p>
        </div>
      </div>
    );
  }

  const getBannerStyle = () => {
    switch (warningSeverity) {
      case "critical":
        return {
          bg: "rgba(255, 69, 58, 0.95)",
          border: "1px solid rgba(255, 69, 58, 0.5)",
          shadow: "0 8px 32px rgba(255, 69, 58, 0.4)",
          Icon: AlertCircle,
        };
      case "warning":
        return {
          bg: "rgba(255, 159, 10, 0.95)",
          border: "1px solid rgba(255, 159, 10, 0.5)",
          shadow: "0 8px 32px rgba(255, 159, 10, 0.3)",
          Icon: AlertTriangle,
        };
      default:
        return {
          bg: "rgba(10, 132, 255, 0.95)",
          border: "1px solid rgba(10, 132, 255, 0.5)",
          shadow: "0 8px 32px rgba(10, 132, 255, 0.3)",
          Icon: Info,
        };
    }
  };

  const banner = getBannerStyle();
  const BannerIcon = banner.Icon;

  const showFullscreenGate =
    !multiTabBlocked &&
    !multiScreenBlocked &&
    !cameraBlocked &&
    isScreenShareActive &&
    fullscreenGateActive;
  const beaconPattern = getBeaconPattern(beaconState.step);

  return (
    <>
      {/* Duplicate Tab Gate */}
      {multiTabBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="multi-tab-blocked-title"
          className="fixed inset-0 z-[98] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.88)", backdropFilter: "blur(10px)" }}
        >
          <div
            className="max-w-md w-full p-7 rounded-2xl text-center shadow-2xl animate-scale-in"
            style={{
              background: "var(--card-bg, #1c1c1e)",
              border: "1px solid rgba(255, 69, 58, 0.55)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(255, 69, 58, 0.18)", color: "#ff453a" }}
            >
              <AlertTriangle size={28} />
            </div>
            <h3 id="multi-tab-blocked-title" className="text-lg font-bold text-white mb-2">
              Multiple Interview Tabs Detected
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--label-secondary)" }}>
              This interview session is open in another browser tab or window. Close all other
              interview tabs immediately to continue here.
            </p>
          </div>
        </div>
      )}

      {/* Multiple Display / Monitor Gate */}
      {!multiTabBlocked && multiScreenBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="multi-screen-blocked-title"
          className="fixed inset-0 z-[97] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.88)", backdropFilter: "blur(10px)" }}
        >
          <div
            className="max-w-md w-full p-7 rounded-2xl text-center shadow-2xl animate-scale-in"
            style={{
              background: "var(--card-bg, #1c1c1e)",
              border: "1px solid rgba(255, 69, 58, 0.55)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(255, 69, 58, 0.18)", color: "#ff453a" }}
            >
              <Monitor size={28} />
            </div>
            <h3 id="multi-screen-blocked-title" className="text-lg font-bold text-white mb-2">
              Multiple Displays Detected
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--label-secondary)" }}>
              Only one screen is permitted during the AI interview. Unplug or disable all external
              monitors and secondary displays to resume automatically.
            </p>
          </div>
        </div>
      )}

      {/* Camera Blocked / Screen Share Restoration / Wrong Screen Gate */}
      {!multiTabBlocked && !multiScreenBlocked && activeRestoreGate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="screen-share-required-title"
          className="fixed inset-0 z-[96] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.86)", backdropFilter: "blur(10px)" }}
        >
          <div
            className="max-w-md w-full p-7 rounded-2xl text-center shadow-2xl animate-scale-in"
            style={{
              background: "var(--card-bg, #1c1c1e)",
              border: "1px solid rgba(255, 69, 58, 0.55)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(255, 69, 58, 0.18)", color: "#ff453a" }}
            >
              <AlertCircle size={28} />
            </div>
            <h3 id="screen-share-required-title" className="text-lg font-bold text-white mb-2">
              {activeRestoreGate === "camera"
                ? "Camera Shutter Closed / Lens Covered"
                : activeRestoreGate === "screen_disconnected"
                  ? "Entire Screen Share Disconnected"
                  : "Wrong Screen Shared"}
            </h3>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--label-secondary)" }}>
              {activeRestoreGate === "camera"
                ? "Your webcam feed is solid black. Open your camera shutter or uncover your lens before the countdown expires or the interview will automatically terminate."
                : activeRestoreGate === "screen_disconnected"
                  ? "Entire screen sharing is mandatory throughout the interview. Re-share your entire screen before the countdown expires or the interview will automatically terminate."
                  : "Your shared screen is not displaying the active interview window. Return to the interview screen or re-share the monitor displaying this interview before the countdown expires."}
            </p>
            <div
              className="text-2xl font-mono font-bold mb-5"
              style={{ color: "#ff453a", fontVariantNumeric: "tabular-nums" }}
            >
              {screenShareCountdown}s
            </div>
            {activeRestoreGate !== "camera" && (
              <button
                type="button"
                onClick={() => {
                  onRequestScreenShare?.();
                }}
                className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: "#ff453a",
                  boxShadow: "0 4px 20px -2px rgba(255, 69, 58, 0.5)",
                }}
              >
                <Monitor size={16} />
                <span>Re-share Entire Screen</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Required Gate when browser blocks auto-fullscreen or candidate exits fullscreen */}
      {showFullscreenGate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fullscreen-required-title"
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.78)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="max-w-md w-full p-7 rounded-2xl text-center shadow-2xl animate-scale-in"
            style={{
              background: "var(--card-bg, #1c1c1e)",
              border: "1px solid rgba(59, 130, 246, 0.45)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(59, 130, 246, 0.16)", color: "#60a5fa" }}
            >
              <Maximize2 size={28} />
            </div>
            <h3 id="fullscreen-required-title" className="text-lg font-bold text-white mb-2">
              Fullscreen Mode Required
            </h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--label-secondary)" }}>
              Your browser requires a direct click after screen sharing to enter fullscreen mode.
              Click below to enable fullscreen and continue your interview.
            </p>
            <button
              type="button"
              onClick={() => {
                void enterFullscreen();
              }}
              className="w-full py-3.5 px-5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-[0.98]"
              style={{
                background: "var(--blue, #0a84ff)",
                boxShadow: "0 4px 20px -2px rgba(10, 132, 255, 0.5)",
              }}
            >
              <Maximize2 size={16} />
              <span>Enter Fullscreen Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Warning Toast Banner */}
      {showWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] animate-slide-up max-w-lg w-full px-4">
          <div
            className="text-sm px-5 py-3.5 rounded-xl shadow-2xl flex items-center justify-between gap-3 text-white backdrop-blur-md transition-all duration-300"
            style={{
              background: banner.bg,
              border: banner.border,
              boxShadow: banner.shadow,
            }}
          >
            <div className="flex items-center gap-3">
              <BannerIcon size={20} className="shrink-0" />
              <span className="font-medium text-xs sm:text-sm leading-snug">{warningMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowWarning(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
              title="Dismiss warning"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Top-Right Status Indicators */}
      <div className="fixed top-16 right-4 z-50 flex items-center gap-2">
        {isFullscreenSupported() && !isFullscreen && (
          <button
            type="button"
            onClick={() => {
              void enterFullscreen();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-sm transition hover:brightness-110 active:scale-95"
            style={{
              background: "rgba(245, 158, 11, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.55)",
              color: "#fbbf24",
              backdropFilter: "blur(8px)",
            }}
            title="Click to enter required fullscreen mode"
          >
            <Maximize2 size={11} />
            <span>Enable Fullscreen</span>
          </button>
        )}
        {tabSwitchCount > 0 && (
          <div
            className="badge-orange flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shadow-sm"
            title="Tab switch warnings"
          >
            <Eye size={12} />
            <span>
              {tabSwitchCount} {tabSwitchCount === 1 ? "switch" : "switches"}
            </span>
          </div>
        )}

        {totalViolationCount > 0 && (
          <div
            className="badge-grey flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shadow-sm"
            title="Total proctoring events recorded"
          >
            <AlertTriangle size={12} style={{ color: "var(--orange)" }} />
            <span>{totalViolationCount}</span>
          </div>
        )}

        {violations.some(
          (v) =>
            v.event_type.startsWith("face") ||
            v.event_type === "prohibited_object" ||
            v.event_type === "camera_blocked",
        ) && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
            style={{
              background: "color-mix(in srgb, var(--orange) 20%, transparent)",
              border: "1px solid var(--orange)",
            }}
            title="Camera/Face warning recorded"
          >
            <Monitor size={13} style={{ color: "var(--orange)" }} />
          </div>
        )}

        {violations.some((v) => v.event_type.startsWith("audio")) && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
            style={{
              background: "color-mix(in srgb, var(--blue) 20%, transparent)",
              border: "1px solid var(--blue)",
            }}
            title="Audio warning recorded"
          >
            <Mic size={13} style={{ color: "var(--blue)" }} />
          </div>
        )}

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-sm"
          style={{
            background: "var(--glass-fill)",
            border: "1px solid var(--separator)",
            color: "var(--label-secondary)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Shield size={11} style={{ color: "var(--green)" }} />
          <span>Monitored</span>
        </div>
      </div>

      {/* Live rotating corner beacon verified against the shared screen stream */}
      <div
        aria-hidden="true"
        data-proctoring-beacon="grid"
        data-beacon-step={beaconState.step}
        data-beacon-prev-step={beaconState.prevStep ?? ""}
        className="fixed bottom-3 right-3 z-[99] pointer-events-none grid grid-cols-2 rounded-md overflow-hidden shadow-lg"
        style={{ width: 40, height: 40, outline: "1px solid rgba(255, 255, 255, 0.22)" }}
        title="Live proctoring screen verification beacon"
      >
        {beaconPattern.map((color, idx) => (
          <span
            key={BEACON_QUADRANT_IDS[idx]}
            style={{ backgroundColor: BEACON_COLOR_HEX[color], width: "100%", height: "100%" }}
          />
        ))}
      </div>
    </>
  );
}
