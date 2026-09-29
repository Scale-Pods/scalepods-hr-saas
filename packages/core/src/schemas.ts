import { z } from "zod";

export const ROUND_TYPES = ["ai_interview", "human_interview", "assignment"] as const;

// ---------------------------------------------------------------- campaigns

export const campaignRoundSchema = z.object({
  round_number: z.number().int().min(1).max(6),
  round_type: z.enum(ROUND_TYPES),
  interviewer_email: z.string().email().optional().nullable(),
  cutoff_score: z.number().int().min(0).max(100),
  daily_start_time: z.string().optional().nullable(),
  daily_end_time: z.string().optional().nullable(),
  brief_text: z.string().optional().nullable(),
  assignment_deadline_hours: z.number().int().min(1).max(168).optional().nullable(),
});

export const cadenceChannelSchema = z.enum(["email", "whatsapp", "voice_call"]);

export const cadenceConfigSchema = z
  .object({
    stages: z.record(
      z.string(),
      z.object({
        enabled: z.boolean().optional(),
        channels: z.array(cadenceChannelSchema).optional(),
        hoursBefore: z.number().int().min(0).max(168).optional(),
        sendHour: z.number().int().min(0).max(23).optional(),
        label: z.string().optional(),
        dayLabel: z.string().optional(),
      }),
    ),
  })
  .optional();

export const dialnexaFunctionSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "end_call",
    "call_transfer",
    "check_calendar_availability",
    "book_calendar",
    "custom",
    "integration",
  ]),
  display_name: z.string().min(1),
  description: z.string().min(1),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export const dialnexaPostCallFieldSchema = z.object({
  id: z.string().optional(),
  field_name: z.string().min(1),
  field_type: z.enum(["TEXT", "SELECTOR", "BOOLEAN", "NUMBER", "DATETIME"]),
  field_description: z.string().optional(),
  additional_fields: z.union([z.array(z.string()), z.record(z.unknown())]).nullish(),
  display_order: z.number().int().optional(),
});

export const dialnexaVoiceConfigSchema = z
  .object({
    prompt: z.string().min(1, "Prompt is required"),
    voice: z.string().min(1, "Voice is required"),
    model: z.string().optional(),
    first_message: z.string().optional(),
    language: z.string().optional(),
    max_duration_seconds: z.number().int().min(30).max(5400).optional(),
    agent_id: z.string().optional(),

    // Turn-Taking & Latency (Eagerness)
    response_eagerness: z.number().min(0).max(1).optional(),
    responsiveness: z.number().min(0).max(1).optional(),
    interruption_sensitivity: z.number().min(0).max(1).optional(),
    backchanneling: z.boolean().optional(),
    backchannel_frequency: z.number().min(0).max(1).optional(),
    backchannel_keywords: z.string().optional(),
    end_call_on_silence_sec: z.number().min(10).max(60).optional(),
    reminder_message_interval: z.number().min(0).max(30).optional(),

    // Acoustic & Voice Polish
    ambient_noise: z.boolean().optional(),
    denoising_mode: z.enum(["remove_noise", "remove_noise_and_speech"]).optional(),
    denoise_strength: z.number().min(0).max(4).optional(),
    voice_speed: z.number().min(0.25).max(4.0).optional(),
    voice_pitch: z.number().min(-20).max(20).optional(),
    voice_temperature: z.number().min(0).max(2).optional(),
    voice_volume: z.number().min(-10).max(10).optional(),
    llm_temperature: z.number().min(0).max(2).optional(),

    // STT Transcribers & Accelerators
    transcriber_id: z.string().optional(),
    fallback_stt_enabled: z.boolean().optional(),
    stt_fallback_transcriber_id: z.string().optional(),
    boosted_keywords: z.string().optional(),
    boost_dynamic_variables: z.boolean().optional(),
    predictive_preprocessing_enabled: z.boolean().optional(),
    prompt_caching_enabled: z.boolean().optional(),
    fallback_llm_enabled: z.boolean().optional(),
    llm_fallback_delay_ms: z.number().min(0).optional(),
    llm_fallback_model: z.string().optional(),

    // Voicemail Handling
    voicemail_detection: z.boolean().optional(),
    hangup_on_voicemail: z.boolean().optional(),
    voicemail_message: z.string().optional(),

    // Functions & Tools
    agent_functions: z.array(dialnexaFunctionSchema).optional(),

    // Post-Call Extraction Scorecard
    post_call_analysis: z.array(dialnexaPostCallFieldSchema).optional(),
  })
  .optional();

export const campaignCreateSchema = z.object({
  action: z.literal("create"),
  account_id: z.string().uuid(),
  name: z.string().min(1).max(240),
  jd_text: z.string().min(1),
  number_of_rounds: z.number().int().min(1).max(6),
  rounds: z.array(campaignRoundSchema),
  cadence_config: cadenceConfigSchema,
  voice_call_config: dialnexaVoiceConfigSchema,
});

export const campaignUpdateSchema = z.object({
  action: z.enum(["update", "delete", "pause", "resume"]),
  account_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  name: z.string().optional(),
  jd_text: z.string().optional(),
  status: z.enum(["on", "off"]).optional(),
  voice_call_config: dialnexaVoiceConfigSchema,
});

// -------------------------------------------------------------- candidate intake

export const candidateIntakeSchema = z.object({
  account_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  jd_text: z.string(),
  candidate_email: z.string().email(),
  candidate_name: z.string().optional(),
  candidate_phone: z.string().optional(),
  resume_cutoff: z.number().int().min(0).max(100),
});

// ------------------------------------------------------------------- booking

export const bookSlotSchema = z.object({
  round_instance_id: z.string().uuid(),
  slot_start: z.string(),
  slot_end: z.string(),
});

export const rescheduleSchema = z.object({
  round_instance_id: z.string().uuid(),
  event_id: z.string(),
  interviewer_email: z.string().email().optional().nullable(),
  new_slot_start: z.string(),
  new_slot_end: z.string(),
});

// ----------------------------------------------------------------- interview

export const interviewTurnSchema = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().uuid().nullable(),
  answer_text: z.string().nullable(),
});

export const interviewTurnResponseSchema = z.object({
  next_message: z.string(),
  question_id: z.string().uuid().nullable(),
  is_final_question: z.boolean().optional().default(false),
  done: z.boolean().optional(),
});

export const scoreInterviewSchema = z.object({
  session_id: z.string().uuid(),
  round_instance_id: z.string().uuid(),
  account_id: z.string().uuid(),
  candidate_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  round_number: z.number(),
  number_of_rounds: z.number(),
  cutoff_score: z.number(),
});

// -------------------------------------------------------------- interviewers

export const assignRoundSchema = z.object({
  action: z.literal("assign_round"),
  account_id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().optional(),
});

// ------------------------------------------------------------------ reports

const usageSliceSchema = z.object({
  used: z.number().optional().default(0),
  granted: z.number().nullable().optional(),
  unit: z.string().optional(),
  period: z.string().optional(),
  rolled_over: z.number().optional().default(0),
  purchased: z.number().optional().default(0),
  balance: z.number().optional(),
});

/**
 * One row of the deployed funnel report. The workflow reports per-campaign
 * stage counts (not a pre-shaped `stage | entered | converted` funnel), so the
 * schema mirrors that shape and the dashboard aggregates it via
 * `src/lib/reports.ts`. Every field is optional so a partial contract from the
 * backend degrades to empty widgets instead of a parse throw.
 */
export const funnelConversionRowSchema = z.object({
  account_id: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  entered_stage_1: z.number().optional().default(0),
  passed_any_round: z.number().optional().default(0),
  reached_human_interview: z.number().optional().default(0),
  offers_made: z.number().optional().default(0),
  offers_signed: z.number().optional().default(0),
  intake_to_signed_pct: z.number().nullable().optional(),
});

/**
 * One row of the `time_to_hire` report. Carries both the legacy per-stage
 * slices (`median_days` / `hires`, used by the pre-migration dashboard) and the
 * newer aggregate metrics mandated by spec Section 13b PATCH 1. Everything is
 * optional so a partial backend contract degrades to an empty widget.
 */
export const timeToHireSliceSchema = z.object({
  stage: z.string().optional(),
  median_days: z.number().nullable().optional(),
  average_days: z.number().nullable().optional(),
  hires: z.number().optional().default(0),
  outlier_entries: z.number().optional().default(0),
  avg_days_intake_to_offer_signed: z.number().nullable().optional(),
  avg_hours_per_round: z.number().nullable().optional(),
  no_show_count: z.number().optional().default(0),
  platform_fault_count: z.number().optional().default(0),
});

/**
 * One row of `source_effectiveness`. Spec Section 13b PATCH 1 reports per
 * channel + stage delivery metrics; the legacy `source`/`conversations` fields
 * are retained for the pre-migration dashboard.
 */
export const sourceEffectivenessRowSchema = z.object({
  source: z.string().optional(),
  conversations: z.number().optional().default(0),
  offers: z.number().optional().default(0),
  rate: z.number().nullable().optional(),
  channel: z.string().optional(),
  stage: z.string().optional(),
  messages_sent: z.number().optional().default(0),
  delivered: z.number().optional().default(0),
  fell_back: z.number().optional().default(0),
  delivery_rate_pct: z.number().nullable().optional(),
});

export const reportsSchema = z.object({
  usage: z
    .object({
      ai_interview: usageSliceSchema,
      ai_voice_screening: usageSliceSchema,
      scheduled_round: usageSliceSchema,
    })
    .optional(),
  active_campaigns: z.number().optional(),
  funnel_conversion: z.array(funnelConversionRowSchema).optional(),
  time_to_hire: z.array(timeToHireSliceSchema).optional(),
  source_effectiveness: z.array(sourceEffectivenessRowSchema).optional(),
});

export type Reports = z.infer<typeof reportsSchema>;
export type UsageSlice = z.infer<typeof usageSliceSchema>;

// ---------------------------------------------------------- tier-error toast

export interface TierLimitPayload {
  error: string;
  detail?: string;
  reason?: string;
}

// ------------------------------------------------------- candidate contexts

export const bookingContextSchema = z.object({
  round_instance: z.object({
    id: z.string(),
    round_type: z.enum(ROUND_TYPES),
    status: z.string(),
    scheduled_at: z.string().nullable(),
    meet_link: z.string().nullable(),
    event_id: z.string().nullable(),
    deadline_at: z.string().nullable(),
    retake_of_round_instance_id: z.string().uuid().nullable().optional(),
    fault_reason: z.string().nullable().optional(),
  }),
  candidate: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
  }),
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    number_of_rounds: z.number(),
  }),
  round: z.object({
    round_number: z.number(),
    round_type: z.enum(ROUND_TYPES),
    interviewer_email: z.string().nullable(),
    cutoff_score: z.number().nullable(),
    daily_start_time: z.string().nullable(),
    daily_end_time: z.string().nullable(),
  }),
  account: z.object({
    tier: z.enum(["free", "basic", "growth", "enterprise"]),
    voice_screening_included: z.boolean(),
  }),
  booked_event: z
    .object({
      event_id: z.string().nullable(),
      slot_start: z.string().nullable(),
      slot_end: z.string().nullable(),
      meet_link: z.string().nullable(),
      interviewer_email: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export type BookingContext = z.infer<typeof bookingContextSchema>;

export const sessionContextSchema = z.object({
  session: z.object({
    id: z.string(),
    status: z.string(),
    expires_at: z.string().nullable(),
    invite_link: z.string().nullable(),
  }),
  round_instance: z.object({
    id: z.string(),
    round_type: z.enum(ROUND_TYPES),
    scheduled_at: z.string().nullable(),
    deadline_at: z.string().nullable(),
    retake_of_round_instance_id: z.string().uuid().nullable().optional(),
    fault_reason: z.string().nullable().optional(),
  }),
  candidate: z.object({ id: z.string(), name: z.string().nullable(), email: z.string() }),
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    number_of_rounds: z.number(),
  }),
  round: z.object({
    round_number: z.number(),
    round_type: z.enum(ROUND_TYPES),
    cutoff_score: z.number().nullable(),
  }),
  account: z.object({ id: z.string(), tier: z.enum(["free", "basic", "growth", "enterprise"]) }),
});

export type SessionContext = z.infer<typeof sessionContextSchema>;

export const assignmentContextSchema = z.object({
  round_instance: z.object({
    id: z.string(),
    round_type: z.enum(ROUND_TYPES),
    status: z.string(),
    deadline_at: z.string().nullable(),
  }),
  campaign: z.object({
    id: z.string(),
    name: z.string(),
    jd_text: z.string().nullable(),
    number_of_rounds: z.number(),
  }),
  round: z.object({
    round_number: z.number(),
    round_type: z.enum(ROUND_TYPES),
    cutoff_score: z.number().nullable(),
  }),
  submission: z
    .object({
      id: z.string(),
      text_response: z.string().nullable(),
      file_paths: z.array(z.string()).nullable(),
      submitted_at: z.string().nullable(),
    })
    .nullable(),
});

export type AssignmentContext = z.infer<typeof assignmentContextSchema>;

export const availableSlotsSchema = z.object({
  window: z.object({ start: z.string(), end: z.string() }),
  blocked: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
});

export type AvailableSlots = z.infer<typeof availableSlotsSchema>;
