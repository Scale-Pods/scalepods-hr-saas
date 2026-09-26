export type InterviewerTurnType = "question" | "follow_up" | "transition" | "closing";

export interface InterviewerTurn {
  interviewer_text?: string | null;
  turn_type: InterviewerTurnType;
  question_type?: "technical" | "behavioral" | "situational" | "cultural";
  should_continue: boolean;
  question_text?: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  created_at?: string;
}

export type SessionStatus =
  | "pending"
  | "invited"
  | "in_progress"
  | "completed"
  | "expired"
  | "cancelled"
  | "flagged";

export interface InterviewSession {
  id: string;
  account_id?: string;
  candidate_id: string;
  round_instance_id?: string;
  status: SessionStatus;
  invite_link?: string | null;
  expires_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  candidate?: Candidate | null;
  campaign_name?: string;
  jd_text?: string;
  resume_text?: string;
}

export type AnswerInsufficiencyReason = "lacks_depth" | "lacks_evidence" | "vague" | "irrelevant";

export interface InterviewQuestion {
  id: string;
  session_id: string;
  question_text: string;
  question_type: "technical" | "behavioral" | "situational" | "cultural";
  source?: string;
  order_index: number;
  parent_question_id?: string | null;
  plan_item_id?: string | null;
  competency_ids?: string[];
  decision_rationale?: string;
  insufficiency_reason?: AnswerInsufficiencyReason | null;
  created_at?: string;
}

export interface LiveAssessmentNote {
  question_id: string;
  authenticity_signal: "genuine" | "vague" | "suspicious" | "inconsistent";
  depth_signal: "deep" | "surface" | "empty";
  red_flags?: string[];
  note?: string;
  follow_up_prompted?: boolean;
  follow_up_question?: string;
  rephrased_question?: string;
  insufficiency_reason?: AnswerInsufficiencyReason | null;
  recommended_action: "advance" | "follow_up" | "rephrase_primary";
  confidence?: number;
  requested_clarification?: boolean;
  answer_was_irrelevant?: boolean;
  competency_evidence?: Array<{
    competency: string;
    evidence: string;
    rating?: string;
    competency_id?: string;
  }>;
}

export interface AuthenticitySignal {
  question_id: string;
  signal: "genuine" | "vague" | "suspicious" | "inconsistent";
  depth: "deep" | "surface" | "empty";
  follow_up_count: number;
}

export interface InterviewAnswer {
  id?: string;
  question_id: string;
  session_id: string;
  answer_text?: string;
  audio_url?: string;
  duration_secs?: number;
  ai_live_note?: LiveAssessmentNote;
  created_at?: string;
}

export type ProctoringEventType =
  | "tab_switch"
  | "window_blur"
  | "browser_resize"
  | "face_absent"
  | "face_multiple"
  | "face_mismatch"
  | "audio_silence"
  | "audio_level"
  | "copy_paste"
  | "keyboard_shortcut"
  | "fullscreen_exit"
  | "gaze_away"
  | "head_down";

export type ProctoringSeverity = "info" | "warning" | "critical";

export interface ProctoringEvent {
  id?: string;
  session_id: string;
  event_type: ProctoringEventType;
  severity: ProctoringSeverity;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface ProctoringSummary {
  totalEvents: number;
  criticalEvents: number;
  warningEvents: number;
  tabSwitches: number;
  windowBlurs: number;
  faceAbsences: number;
  faceMultiple: number;
  silentPeriods: number;
  fullscreenExits: number;
  copyPastes: number;
  keyboardShortcuts: number;
  gazeAway: number;
  headDown: number;
}

export interface JdTool {
  name: string;
  category?: string;
  importance: "must_have" | "nice_to_have";
  mentioned_in_resume: boolean;
  resume_context?: string | null;
}

export interface FlaggedGap {
  description: string;
  probe_direction?: string;
}

export interface ResumeJdAlignment {
  domain_alignment: string;
  domain_reasoning: string;
  experience_gap: {
    jd_required_years: number | null;
    candidate_years: number | null;
    status: string;
    reasoning: string;
  };
  flagged_gaps: FlaggedGap[];
}

export interface InterviewPlanItem {
  id: string;
  category: string;
  competency_ids: string[];
  objective: string;
  question_type?: "technical" | "behavioral" | "situational" | "cultural";
  difficulty?: string;
  target_tool?: string;
  verification_mode?: "verify_claim" | "baseline_check";
  gap_ref?: {
    description: string;
    probe_direction?: string;
  };
}

export interface InterviewBlueprint {
  session_id: string;
  version: string;
  competencies: Array<{
    id: string;
    name: string;
    weight: number;
    description: string;
    expected_evidence: string[];
  }>;
  question_plan: InterviewPlanItem[];
  candidate_summary: {
    strengths: string[];
    gaps: string[];
    claims_to_validate: string[];
  };
  constraints: {
    max_primary_questions: number;
    max_follow_ups_per_question: number;
  };
}

export interface Scorecard {
  id?: string;
  session_id: string;
  technical_score?: number;
  communication_score?: number;
  problem_solving_score?: number;
  cultural_fit_score?: number;
  overall_score?: number;
  authenticity_score?: number;
  recommendation?: "strong_hire" | "hire" | "consider" | "no_go";
  red_flags?: string[];
  strengths?: string[];
  weaknesses?: string[];
  ai_rationale?: string;
  detailed_rationale?: string;
  evaluated_at?: string;
}
