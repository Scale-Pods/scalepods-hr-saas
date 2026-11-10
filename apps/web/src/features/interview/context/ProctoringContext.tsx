import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { useProctoring } from "../hooks/useProctoring";
import type { ProctoringEvent, ProctoringEventType, ProctoringSeverity } from "../types";

interface ProctoringContextType {
  violations: ProctoringEvent[];
  isSecure: boolean;
  recentEvent: ProctoringEvent | null;
  multiScreenBlocked: boolean;
  multiTabBlocked: boolean;
  wrongScreenBlocked: boolean;
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
  const localProctoring = useProctoring(sessionId);

  const startProctoring = useCallback(
    async (sid: string, screenStream?: MediaStream | null) => {
      setSessionId(sid);
      await localProctoring.start(sid, screenStream);
    },
    [localProctoring],
  );

  const stopProctoring = useCallback(() => {
    localProctoring.stop();
  }, [localProctoring]);

  return (
    <ProctoringContext.Provider
      value={{
        violations: localProctoring.violations,
        isSecure: localProctoring.isSecure,
        recentEvent: localProctoring.recentEvent,
        multiScreenBlocked: localProctoring.multiScreenBlocked,
        multiTabBlocked: localProctoring.multiTabBlocked,
        wrongScreenBlocked: localProctoring.wrongScreenBlocked,
        startProctoring,
        stopProctoring,
        setProctoringScreenStream: localProctoring.setScreenStream,
        emitEvent: localProctoring.emitEvent,
      }}
    >
      {children}
    </ProctoringContext.Provider>
  );
}

export function useProctoringContext() {
  const ctx = useContext(ProctoringContext);
  if (!ctx) throw new Error("useProctoringContext must be used within ProctoringProvider");
  return ctx;
}
