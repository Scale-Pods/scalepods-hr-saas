import { useCallback, useEffect, useRef, useState } from "react";
import { insertProctoringEvent } from "@/features/candidate/api";
import type { ProctoringEvent, ProctoringEventType, ProctoringSeverity } from "../types";
import { detectFaces, disposeFaceDetector } from "../utils/mediapipeFaceDetector";
import { detectBehavior, disposeLandmarker } from "../utils/mediapipeLandmarker";

interface ProctoringState {
  violations: ProctoringEvent[];
  isSecure: boolean;
  recentEvent: ProctoringEvent | null;
}

export function useProctoring(sessionId: string) {
  const [state, setState] = useState<ProctoringState>({
    violations: [],
    isSecure: true,
    recentEvent: null,
  });

  const [isActive, setIsActive] = useState(false);

  const activeSessionIdRef = useRef(sessionId);
  const isStoppingRef = useRef(false);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const faceAbsentStrikesRef = useRef(0);
  const faceMultipleStrikesRef = useRef(0);
  const gazeAwayStrikesRef = useRef(0);
  const headDownStrikesRef = useRef(0);
  const lastEmitTimesRef = useRef<Map<ProctoringEventType, number>>(new Map());
  const lastTabSwitchTimeRef = useRef(0);
  const proctoringStartTimeRef = useRef<number>(0);

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

      const event: ProctoringEvent = {
        session_id: sid,
        event_type: eventType,
        severity,
        timestamp: new Date().toISOString(),
        payload,
      };

      console.info("[Proctoring Event]:", eventType, severity, payload);
      setState((prev) => ({
        ...prev,
        isSecure: severity !== "critical",
        violations: [...prev.violations, event],
        recentEvent: event,
      }));

      try {
        const detailStr = payload ? JSON.stringify(payload) : `${eventType} detected`;
        await insertProctoringEvent(sid, eventType, detailStr);
      } catch (err) {
        console.warn("[Proctoring] Failed to log proctoring event to database:", err);
      }
    },
    [sessionId],
  );

  const start = useCallback(async (sid?: string) => {
    isStoppingRef.current = false;
    proctoringStartTimeRef.current = Date.now();
    if (sid) activeSessionIdRef.current = sid;
    setIsActive(true);

    try {
      if (typeof document !== "undefined" && !document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen().catch(() => {});
        }
      }
    } catch {}
  }, []);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    setIsActive(false);
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
    disposeFaceDetector();
    disposeLandmarker();

    try {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const handleVisibility = () => {
      if (document.hidden) {
        lastTabSwitchTimeRef.current = Date.now();
        if (canEmit("tab_switch", 3000)) {
          emitEvent("tab_switch", "warning");
        }
      }
    };

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const handleBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      if (document.hidden) return;
      blurTimer = setTimeout(() => {
        const now = Date.now();
        if (!document.hasFocus() && !document.hidden && now - lastTabSwitchTimeRef.current > 1000) {
          if (canEmit("window_blur", 5000)) {
            emitEvent("window_blur", "warning");
          }
        }
      }, 600);
    };

    const handleFocus = () => {
      if (blurTimer) clearTimeout(blurTimer);
    };

    let lastWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const handleResize = () => {
      const change = Math.abs(window.innerWidth - lastWidth);
      if (change > 80 && canEmit("browser_resize", 5000)) {
        emitEvent("browser_resize", "info", { from: lastWidth, to: window.innerWidth });
      }
      lastWidth = window.innerWidth;
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isActive && !isStoppingRef.current) {
        if (canEmit("fullscreen_exit", 5000)) {
          emitEvent("fullscreen_exit", "warning");
        }
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    const blockedKeys = [
      "F12",
      "Control+R",
      "Control+Shift+I",
      "Control+Shift+J",
      "Control+Shift+C",
    ];
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey ? "Control" : "",
        e.shiftKey ? "Shift" : "",
        e.altKey ? "Alt" : "",
        e.metaKey ? "Meta" : "",
        e.key,
      ]
        .filter(Boolean)
        .join("+");

      if (blockedKeys.includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        if (canEmit("keyboard_shortcut", 3000)) {
          emitEvent("keyboard_shortcut", "warning", { key });
        }
      }
    };

    const handleCopy = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 3000)) emitEvent("copy_paste", "warning", { action: "copy" });
    };

    const handlePaste = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 3000)) emitEvent("copy_paste", "warning", { action: "paste" });
    };

    const handleCut = (e: Event) => {
      e.preventDefault();
      if (canEmit("copy_paste", 3000)) emitEvent("copy_paste", "warning", { action: "cut" });
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    const findVideo = () =>
      (document.getElementById("camera-feed") ||
        document.querySelector("video")) as HTMLVideoElement | null;

    faceIntervalRef.current = setInterval(async () => {
      const video = findVideo();
      if (!video || video.readyState < 2 || video.paused) return;

      const [mpCount, behavior] = await Promise.all([detectFaces(video), detectBehavior(video)]);

      if (mpCount !== -1) {
        if (mpCount === 0) {
          faceAbsentStrikesRef.current++;
          faceMultipleStrikesRef.current = 0;
          if (faceAbsentStrikesRef.current >= 2 && canEmit("face_absent", 5000)) {
            emitEvent("face_absent", "warning", { reason: "no_face_detected" });
          }
        } else if (mpCount > 1) {
          faceMultipleStrikesRef.current++;
          faceAbsentStrikesRef.current = 0;
          if (faceMultipleStrikesRef.current >= 2 && canEmit("face_multiple", 5000)) {
            emitEvent("face_multiple", "critical", { count: mpCount });
          }
        } else {
          faceAbsentStrikesRef.current = 0;
          faceMultipleStrikesRef.current = 0;
        }
      }

      if (behavior) {
        if (behavior.gazeAway) {
          gazeAwayStrikesRef.current++;
          if (gazeAwayStrikesRef.current >= 2 && canEmit("gaze_away", 6000)) {
            emitEvent("gaze_away", "warning", { yawDeg: Math.round(behavior.yawDeg) });
          }
        } else {
          gazeAwayStrikesRef.current = 0;
        }

        if (behavior.headDown) {
          headDownStrikesRef.current++;
          if (headDownStrikesRef.current >= 3 && canEmit("head_down", 6000)) {
            emitEvent("head_down", "warning", { pitchDeg: Math.round(behavior.pitchDeg) });
          }
        } else {
          headDownStrikesRef.current = 0;
        }
      }
    }, 3000);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
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
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("contextmenu", handleContextMenu);
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    };
  }, [isActive, canEmit, emitEvent]);

  return {
    violations: state.violations,
    isSecure: state.isSecure,
    recentEvent: state.recentEvent,
    start,
    stop,
    emitEvent,
  };
}
