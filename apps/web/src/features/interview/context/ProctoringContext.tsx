import type React from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useProctoring } from "../hooks/useProctoring";
import type { ProctoringEvent, ProctoringEventType, ProctoringSeverity } from "../types";

interface ProctoringContextType {
  violations: ProctoringEvent[];
  isSecure: boolean;
  recentEvent: ProctoringEvent | null;
  multiScreenBlocked: boolean;
  multiTabBlocked: boolean;
  wrongScreenBlocked: boolean;
  cameraBlocked: boolean;
  startProctoring: (sessionId: string, screenStream?: MediaStream | null) => Promise<void>;
  stopProctoring: () => void;
  setProctoringScreenStream: (screenStream: MediaStream | null) => void;
  emitEvent: (
    type: ProctoringEventType,
    severity: ProctoringSeverity,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
}

const ProctoringContext = createContext<ProctoringContextType | null>(null);

export function ProctoringProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("");
  const {
    violations,
    isSecure,
    recentEvent,
    multiScreenBlocked,
    multiTabBlocked,
    wrongScreenBlocked,
    cameraBlocked,
    start,
    stop,
    setScreenStream,
    emitEvent,
  } = useProctoring(sessionId);

  const startProctoring = useCallback(
    async (sid: string, screenStream?: MediaStream | null) => {
      setSessionId(sid);
      await start(sid, screenStream);
    },
    [start],
  );

  const value = useMemo<ProctoringContextType>(
    () => ({
      violations,
      isSecure,
      recentEvent,
      multiScreenBlocked,
      multiTabBlocked,
      wrongScreenBlocked,
      cameraBlocked,
      startProctoring,
      stopProctoring: stop,
      setProctoringScreenStream: setScreenStream,
      emitEvent,
    }),
    [
      violations,
      isSecure,
      recentEvent,
      multiScreenBlocked,
      multiTabBlocked,
      wrongScreenBlocked,
      cameraBlocked,
      startProctoring,
      stop,
      setScreenStream,
      emitEvent,
    ],
  );

  return <ProctoringContext.Provider value={value}>{children}</ProctoringContext.Provider>;
}

export function useProctoringContext() {
  const ctx = useContext(ProctoringContext);
  if (!ctx) throw new Error("useProctoringContext must be used within ProctoringProvider");
  return ctx;
}
