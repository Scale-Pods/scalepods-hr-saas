import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { useProctoring } from "../hooks/useProctoring";
import type { ProctoringEvent, ProctoringEventType, ProctoringSeverity } from "../types";

interface ProctoringContextType {
  violations: ProctoringEvent[];
  isSecure: boolean;
  recentEvent: ProctoringEvent | null;
  startProctoring: (sessionId: string) => Promise<void>;
  stopProctoring: () => void;
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
    async (sid: string) => {
      setSessionId(sid);
      await localProctoring.start(sid);
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
        startProctoring,
        stopProctoring,
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
