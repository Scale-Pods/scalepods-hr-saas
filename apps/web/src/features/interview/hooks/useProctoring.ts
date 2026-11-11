import { useCallback, useEffect, useRef, useState } from "react";
import { insertProctoringEvent } from "@/features/candidate/api";
import type { ProctoringEvent, ProctoringEventType, ProctoringSeverity } from "../types";
import { checkSingleDisplay } from "../utils/environmentCheck";
import { exitFullscreen, getFullscreenElement, isFullscreenSupported } from "../utils/fullscreen";
import { detectBehavior, disposeLandmarker } from "../utils/mediapipeLandmarker";
import { detectProhibitedObjects, disposeObjectDetector } from "../utils/mediapipeObjectDetector";
import { acquireMediapipeQuietConsole } from "../utils/mediapipeShared";
import { getBeaconPattern, verifyScreenShareFrame } from "../utils/screenVerification";

interface ProctoringState {
  violations: ProctoringEvent[];
  isSecure: boolean;
  recentEvent: ProctoringEvent | null;
  multiScreenBlocked: boolean;
  multiTabBlocked: boolean;
  wrongScreenBlocked: boolean;
}

export function useProctoring(sessionId: string) {
  const [state, setState] = useState<ProctoringState>({
    violations: [],
    isSecure: true,
    recentEvent: null,
    multiScreenBlocked: false,
    multiTabBlocked: false,
    wrongScreenBlocked: false,
  });

  const [isActive, setIsActive] = useState(false);

  const activeSessionIdRef = useRef(sessionId);
  const isStoppingRef = useRef(false);
  const behaviorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenCheckStartedAtRef = useRef(0);
  const quietConsoleReleaseRef = useRef<(() => void) | null>(null);

  const faceAbsentStrikesRef = useRef(0);
  const faceMultipleStrikesRef = useRef(0);
  const gazeAwayStrikesRef = useRef(0);
  const headDownStrikesRef = useRef(0);
  const wrongScreenStrikesRef = useRef(0);
  const objectStrikesRef = useRef<Map<string, number>>(new Map());
  const eventCountsRef = useRef<Map<ProctoringEventType, number>>(new Map());
  const lastEmitTimesRef = useRef<Map<ProctoringEventType, number>>(new Map());
  const lastTabSwitchTimeRef = useRef(0);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  const canEmit = useCallback((eventType: ProctoringEventType, cooldownMs: number): boolean => {
    const lastTime = lastEmitTimesRef.current.get(eventType) || 0;
    const now = Date.now();
    if (now - lastTime < cooldownMs) return false;
    lastEmitTimesRef.current.set(eventType, now);
    return true;
  }, []);

  const emitEvent = useCallback(
    async (
      eventType: ProctoringEventType,
      severity: ProctoringSeverity,
      payload?: Record<string, unknown>,
    ) => {
      if (isStoppingRef.current) return;
      const sid = activeSessionIdRef.current || sessionId;
      if (!sid) return;

      const count = (eventCountsRef.current.get(eventType) || 0) + 1;
      eventCountsRef.current.set(eventType, count);

      // Escalate repeat warnings into critical violations so termination threshold works reliably
      const effectiveSeverity: ProctoringSeverity =
        severity === "warning" && count >= 2 ? "critical" : severity;

      const event: ProctoringEvent = {
        session_id: sid,
        event_type: eventType,
        severity: effectiveSeverity,
        timestamp: new Date().toISOString(),
        payload,
      };

      setState((prev) => ({
        ...prev,
        isSecure: effectiveSeverity !== "critical",
        violations: [...prev.violations, event],
        recentEvent: event,
      }));

      try {
        const detailStr = payload ? JSON.stringify(payload) : `${eventType} detected`;
        await insertProctoringEvent(sid, eventType, detailStr, effectiveSeverity);
      } catch {
        // Ignore non-fatal logging errors
      }
    },
    [sessionId],
  );

  const setScreenStream = useCallback((stream: MediaStream | null) => {
    wrongScreenStrikesRef.current = 0;
    screenCheckStartedAtRef.current = Date.now();
    setState((prev) => (prev.wrongScreenBlocked ? { ...prev, wrongScreenBlocked: false } : prev));

    if (typeof document === "undefined") return;
    if (!stream) {
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
      return;
    }

    if (!screenVideoRef.current) {
      const vid = document.createElement("video");
      vid.muted = true;
      vid.playsInline = true;
      screenVideoRef.current = vid;
    }
    if (!screenCanvasRef.current) {
      screenCanvasRef.current = document.createElement("canvas");
    }
    screenVideoRef.current.srcObject = stream;
    void screenVideoRef.current.play?.().catch(() => {});
  }, []);

  const start = useCallback(
    async (sid?: string, screenStream?: MediaStream | null) => {
      isStoppingRef.current = false;
      if (sid) activeSessionIdRef.current = sid;
      if (screenStream !== undefined) {
        setScreenStream(screenStream);
      } else {
        screenCheckStartedAtRef.current = Date.now();
      }
      setIsActive(true);
    },
    [setScreenStream],
  );

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    setIsActive(false);
    if (behaviorIntervalRef.current) {
      clearInterval(behaviorIntervalRef.current);
      behaviorIntervalRef.current = null;
    }
    if (objectIntervalRef.current) {
      clearInterval(objectIntervalRef.current);
      objectIntervalRef.current = null;
    }
    if (displayIntervalRef.current) {
      clearInterval(displayIntervalRef.current);
      displayIntervalRef.current = null;
    }
    if (screenCheckIntervalRef.current) {
      clearInterval(screenCheckIntervalRef.current);
      screenCheckIntervalRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
      screenVideoRef.current = null;
    }
    screenCanvasRef.current = null;
    wrongScreenStrikesRef.current = 0;
    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch {}
      channelRef.current = null;
    }
    disposeLandmarker();
    disposeObjectDetector();
    quietConsoleReleaseRef.current?.();
    quietConsoleReleaseRef.current = null;

    void exitFullscreen();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (!quietConsoleReleaseRef.current) {
      quietConsoleReleaseRef.current = acquireMediapipeQuietConsole();
    }
    const sid = activeSessionIdRef.current || sessionId;

    // 1. Multi-tab duplicate lock via BroadcastChannel
    if (sid && typeof BroadcastChannel !== "undefined") {
      try {
        const tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const ch = new BroadcastChannel(`interview-lock-${sid}`);
        channelRef.current = ch;
        ch.onmessage = (ev) => {
          if (ev.data?.tabId && ev.data.tabId !== tabId) {
            if (ev.data.type === "claim" || ev.data.type === "ping") {
              ch.postMessage({ type: "occupied", tabId });
            }
            if (ev.data.type === "occupied" || ev.data.type === "claim") {
              setState((prev) => ({ ...prev, multiTabBlocked: true }));
              if (canEmit("multi_tab", 5000)) {
                void emitEvent("multi_tab", "critical", { reason: "duplicate_interview_tab" });
              }
            }
          }
        };
        ch.postMessage({ type: "claim", tabId });
      } catch {
        // Ignore BroadcastChannel restriction in isolated contexts
      }
    }

    // 2. Tab switch, blur, resize & fullscreen listeners
    const handleVisibility = () => {
      if (document.hidden) {
        lastTabSwitchTimeRef.current = Date.now();
        if (canEmit("tab_switch", 2500)) {
          void emitEvent("tab_switch", "critical");
        }
      }
    };

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const handleBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      if (document.hidden) return;
      blurTimer = setTimeout(() => {
        const now = Date.now();
        if (!document.hasFocus() && !document.hidden && now - lastTabSwitchTimeRef.current > 800) {
          if (canEmit("window_blur", 3000)) {
            void emitEvent("window_blur", "critical");
          }
        }
      }, 250);
    };

    const handleFocus = () => {
      if (blurTimer) clearTimeout(blurTimer);
    };

    let lastWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const handleResize = () => {
      const change = Math.abs(window.innerWidth - lastWidth);
      if (change > 80 && canEmit("browser_resize", 4000)) {
        void emitEvent("browser_resize", "warning", { from: lastWidth, to: window.innerWidth });
      }
      lastWidth = window.innerWidth;
    };

    const handleFullscreenChange = () => {
      if (!getFullscreenElement() && isActive && !isStoppingRef.current) {
        if (canEmit("fullscreen_exit", 3000)) {
          void emitEvent("fullscreen_exit", "critical");
        }
      }
    };

    // 3. Expanded browser shortcut & clipboard blocking
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const lowerKey = (e.key || "").toLowerCase();
      const blocked =
        e.key === "F12" ||
        e.key === "F11" ||
        e.key === "PrintScreen" ||
        (e.altKey && lowerKey === "tab") ||
        (mod &&
          ["c", "v", "x", "t", "n", "w", "r", "l", "p", "s", "u", "f", "tab"].includes(lowerKey)) ||
        (mod && e.shiftKey && ["i", "j", "c", "n"].includes(lowerKey));

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        const combo = [
          e.ctrlKey ? "Ctrl" : "",
          e.metaKey ? "Cmd" : "",
          e.altKey ? "Alt" : "",
          e.shiftKey ? "Shift" : "",
          e.key,
        ]
          .filter(Boolean)
          .join("+");
        if (canEmit("keyboard_shortcut", 2500)) {
          void emitEvent("keyboard_shortcut", "critical", { key: combo });
        }
      }
    };

    const handleCopy = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 2500)) void emitEvent("copy_paste", "critical", { action: "copy" });
    };

    const handlePaste = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 2500))
        void emitEvent("copy_paste", "critical", { action: "paste" });
    };

    const handleCut = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 2500)) void emitEvent("copy_paste", "critical", { action: "cut" });
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    // 4. Live single-display monitor check
    const checkDisplayState = () => {
      const disp = checkSingleDisplay();
      setState((prev) =>
        prev.multiScreenBlocked === !disp.ok ? prev : { ...prev, multiScreenBlocked: !disp.ok },
      );
      if (!disp.ok && canEmit("multi_screen", 5000)) {
        void emitEvent("multi_screen", "critical", { reason: "extended_display_detected" });
      }
    };
    checkDisplayState();
    displayIntervalRef.current = setInterval(checkDisplayState, 2000);

    // 4b. Live screen-content verification: confirms shared monitor actually shows the interview UI
    screenCheckStartedAtRef.current = Date.now();
    screenCheckIntervalRef.current = setInterval(() => {
      if (isStoppingRef.current) return;
      if (Date.now() - screenCheckStartedAtRef.current < 2500) return;
      if (
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        (isFullscreenSupported() && !getFullscreenElement())
      ) {
        wrongScreenStrikesRef.current = 0;
        return;
      }

      const screenVid = screenVideoRef.current;
      const screenCanvas = screenCanvasRef.current;
      const beaconEl = document.querySelector<HTMLElement>('[data-proctoring-beacon="grid"]');
      if (!screenVid || !screenCanvas || !beaconEl) return;

      const stepRaw = beaconEl.dataset.beaconStep;
      const prevStepRaw = beaconEl.dataset.beaconPrevStep;
      if (stepRaw === undefined) return;

      const step = Number(stepRaw);
      const prevStep = prevStepRaw !== undefined && prevStepRaw !== "" ? Number(prevStepRaw) : null;
      const matched = verifyScreenShareFrame(
        screenVid,
        beaconEl,
        screenCanvas,
        getBeaconPattern(step),
        prevStep !== null ? getBeaconPattern(prevStep) : null,
      );

      if (matched === null) return;
      if (matched) {
        wrongScreenStrikesRef.current = 0;
        setState((prev) =>
          prev.wrongScreenBlocked ? { ...prev, wrongScreenBlocked: false } : prev,
        );
        return;
      }

      wrongScreenStrikesRef.current += 1;
      if (wrongScreenStrikesRef.current >= 3) {
        setState((prev) =>
          prev.wrongScreenBlocked ? prev : { ...prev, wrongScreenBlocked: true },
        );
        if (canEmit("wrong_screen", 5000)) {
          void emitEvent("wrong_screen", "critical", { reason: "shared_screen_mismatch" });
        }
      }
    }, 2500);

    // 5. Camera Vision AI: Gaze/Head/Face tracking (1.5s) & Object/Phone detection (2.0s)
    const findVideo = () =>
      (document.getElementById("camera-feed") ||
        document.querySelector("video")) as HTMLVideoElement | null;

    behaviorIntervalRef.current = setInterval(async () => {
      const video = findVideo();
      if (!video || video.readyState < 2 || video.paused) return;

      const behavior = await detectBehavior(video);
      if (!behavior) return;

      if (behavior.faceCount === 0) {
        faceAbsentStrikesRef.current++;
        faceMultipleStrikesRef.current = 0;
        if (faceAbsentStrikesRef.current >= 2 && canEmit("face_absent", 4500)) {
          void emitEvent("face_absent", "warning", { reason: "no_face_detected" });
        }
      } else if (behavior.faceCount > 1) {
        faceMultipleStrikesRef.current++;
        faceAbsentStrikesRef.current = 0;
        if (faceMultipleStrikesRef.current >= 2 && canEmit("face_multiple", 4500)) {
          void emitEvent("face_multiple", "critical", { count: behavior.faceCount });
        }
      } else {
        faceAbsentStrikesRef.current = 0;
        faceMultipleStrikesRef.current = 0;
      }

      if (behavior.gazeAway) {
        gazeAwayStrikesRef.current++;
        if (gazeAwayStrikesRef.current >= 2 && canEmit("gaze_away", 4500)) {
          void emitEvent("gaze_away", "warning", { yawDeg: Math.round(behavior.yawDeg) });
        }
      } else {
        gazeAwayStrikesRef.current = 0;
      }

      if (behavior.headDown) {
        headDownStrikesRef.current++;
        if (headDownStrikesRef.current >= 2 && canEmit("head_down", 4500)) {
          void emitEvent("head_down", "warning", { pitchDeg: Math.round(behavior.pitchDeg) });
        }
      } else {
        headDownStrikesRef.current = 0;
      }
    }, 1500);

    objectIntervalRef.current = setInterval(async () => {
      const video = findVideo();
      if (!video || video.readyState < 2 || video.paused) return;

      const detected = await detectProhibitedObjects(video);
      const seenLabels = new Set(detected.map((d) => d.label));

      // Decay strikes for labels not seen in current frame
      for (const label of Array.from(objectStrikesRef.current.keys())) {
        if (!seenLabels.has(label)) {
          objectStrikesRef.current.delete(label);
        }
      }

      for (const obj of detected) {
        const nextStrike = (objectStrikesRef.current.get(obj.label) || 0) + 1;
        objectStrikesRef.current.set(obj.label, nextStrike);

        const isPhone = obj.label === "cell phone";
        const triggerNow = (isPhone && obj.score >= 0.55) || nextStrike >= 2;
        if (triggerNow && canEmit("prohibited_object", 5000)) {
          void emitEvent("prohibited_object", isPhone ? "critical" : "warning", {
            label: obj.label,
            confidence: Math.round(obj.score * 100),
          });
        }
      }
    }, 2000);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("cut", handleCut);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("contextmenu", handleContextMenu);
      if (blurTimer) clearTimeout(blurTimer);
      if (behaviorIntervalRef.current) clearInterval(behaviorIntervalRef.current);
      if (objectIntervalRef.current) clearInterval(objectIntervalRef.current);
      if (displayIntervalRef.current) clearInterval(displayIntervalRef.current);
      if (screenCheckIntervalRef.current) clearInterval(screenCheckIntervalRef.current);
      if (channelRef.current) {
        try {
          channelRef.current.close();
        } catch {}
        channelRef.current = null;
      }
      quietConsoleReleaseRef.current?.();
      quietConsoleReleaseRef.current = null;
    };
  }, [isActive, sessionId, canEmit, emitEvent]);

  return {
    violations: state.violations,
    isSecure: state.isSecure,
    recentEvent: state.recentEvent,
    multiScreenBlocked: state.multiScreenBlocked,
    multiTabBlocked: state.multiTabBlocked,
    wrongScreenBlocked: state.wrongScreenBlocked,
    start,
    stop,
    setScreenStream,
    emitEvent,
  };
}
