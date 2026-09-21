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

export const campaignCreateSchema = z.object({
  action: z.literal("create"),
  account_id: z.string().uuid(),
  name: z.string().min(1).max(240),
  jd_text: z.string().min(1),
  number_of_rounds: z.number().int().min(1).max(6),
  rounds: z.array(campaignRoundSchema),
});

export const campaignUpdateSchema = z.object({
  action: z.enum(["update", "delete", "pause", "resume"]),
  account_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  name: z.string().optional(),
  jd_text: z.string().optional(),
  status: z.enum(["on", "off"]).optional(),
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

export const timeToHireSliceSchema = z.object({
  stage: z.string().optional(),
  median_days: z.number().nullable().optional(),
  average_days: z.number().nullable().optional(),
  hires: z.number().optional().default(0),
  outlier_entries: z.number().optional().default(0),
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
  source_effectiveness: z
    .array(
      z.object({
        source: z.string().optional(),
        conversations: z.number().optional().default(0),
        offers: z.number().optional().default(0),
        rate: z.number().nullable().optional(),
      }),
    )
    .optional(),
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
