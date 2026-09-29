import type { Database } from "./supabase-db";

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type Tier = "free" | "basic" | "growth" | "enterprise";

export type RoundType = "ai_interview" | "human_interview" | "assignment";

export interface DialnexaFunctionConfig {
  id?: string;
  type:
    | "end_call"
    | "call_transfer"
    | "check_calendar_availability"
    | "book_calendar"
    | "custom"
    | "integration";
  display_name: string;
  description: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface DialnexaPostCallField {
  id?: string;
  field_name: string;
  field_type: "TEXT" | "SELECTOR" | "BOOLEAN" | "NUMBER" | "DATETIME";
  field_description?: string;
  additional_fields?: string[] | Record<string, unknown> | null;
  display_order?: number;
}

export interface DialnexaVoiceConfig {
  prompt: string;
  voice: string;
  model?: string;
  first_message?: string;
  language?: string;
  max_duration_seconds?: number;
  agent_id?: string;

  // Turn-Taking & Latency (Eagerness & Responsiveness)
  response_eagerness?: number; // 0.0 (patient) to 1.0 (eager)
  responsiveness?: number; // 0.0 to 1.0
  interruption_sensitivity?: number; // 0.0 to 1.0
  backchanneling?: boolean;
  backchannel_frequency?: number; // 0.0 to 1.0
  backchannel_keywords?: string;
  end_call_on_silence_sec?: number; // 15 to 30
  reminder_message_interval?: number; // 0 to 25

  // Acoustic & Voice Polish
  ambient_noise?: boolean;
  denoising_mode?: "remove_noise" | "remove_noise_and_speech";
  denoise_strength?: number; // 0 to 4
  voice_speed?: number; // 0.25 to 4.0
  voice_pitch?: number; // -20 to 20
  voice_temperature?: number; // 0.0 to 2.0
  voice_volume?: number; // -10 to 10
  llm_temperature?: number; // 0.0 to 2.0

  // STT Transcribers & Accelerators
  transcriber_id?: string;
  fallback_stt_enabled?: boolean;
  stt_fallback_transcriber_id?: string;
  boosted_keywords?: string;
  boost_dynamic_variables?: boolean;
  predictive_preprocessing_enabled?: boolean;
  prompt_caching_enabled?: boolean;
  fallback_llm_enabled?: boolean;
  llm_fallback_delay_ms?: number;
  llm_fallback_model?: string;

  // Voicemail Handling
  voicemail_detection?: boolean;
  hangup_on_voicemail?: boolean;
  voicemail_message?: string;

  // Agent Functions & Tools
  agent_functions?: DialnexaFunctionConfig[];

  // Post-Call Extraction Scorecard
  post_call_analysis?: DialnexaPostCallField[];
}

export type Tables = Database["public"]["Tables"];
export type AccountsRow = Tables["accounts"]["Row"];
export type CandidatesRow = Tables["candidates"]["Row"];
export type CampaignsRow = Tables["campaigns"]["Row"];
export type CampaignRoundsRow = Tables["campaign_rounds"]["Row"];
export type RoundInstancesRow = Tables["round_instances"]["Row"];
export type DecisionLedgerRow = Tables["decision_ledger"]["Row"];
export type OutreachLogRow = Tables["outreach_log"]["Row"];
export type TeamMemberRow = Tables["team_members"]["Row"];
export type CalendarConnectionRow = Tables["calendar_connections"]["Row"];
export type InterviewSessionRow = Tables["interview_sessions"]["Row"];
export type ScorecardRow = Tables["scorecards"]["Row"];
export type AssignmentSubmissionRow = Tables["assignment_submissions"]["Row"];
export type CreditLedgerRow = Tables["credit_ledger"]["Row"];
export type ProctoringEventRow = Tables["proctoring_events"]["Row"];
