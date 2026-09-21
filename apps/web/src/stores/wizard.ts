import type { RoundType } from "@scalepods/core";
import { create } from "zustand";

export interface WizardRoundDraft {
  round_number: number;
  round_type: RoundType;
  interviewer_email?: string;
  cutoff_score: number;
  brief_text?: string;
  assignment_deadline_hours?: number;
  daily_start_time?: string;
  daily_end_time?: string;
}

export interface CampaignDraft {
  name: string;
  jd_text: string;
  number_of_rounds: number;
  start_date?: string;
  end_date?: string;
  rounds: WizardRoundDraft[];
}

const emptyDraft: CampaignDraft = {
  name: "",
  jd_text: "",
  number_of_rounds: 1,
  rounds: [{ round_number: 1, round_type: "ai_interview", cutoff_score: 60 }],
};

interface WizardState {
  step: number;
  draft: CampaignDraft;
  setStep: (step: number) => void;
  next: () => void;
  back: () => void;
  update: (patch: Partial<CampaignDraft>) => void;
  reset: () => void;
}

/**
 * Campaign builder wizard state. Survives route changes (Zustand) but is not
 * persisted - a half-finished wizard should not reappear after a reload.
 */
export const useWizardStore = create<WizardState>()((set) => ({
  step: 0,
  draft: emptyDraft,
  setStep: (step) => set({ step }),
  next: () => set((state) => ({ step: Math.min(state.step + 1, 2) })),
  back: () => set((state) => ({ step: Math.max(state.step - 1, 0) })),
  update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  reset: () => set({ step: 0, draft: emptyDraft }),
}));
