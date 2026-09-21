import type { Database } from "./supabase-db";

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type Tier = "free" | "basic" | "growth" | "enterprise";

export type RoundType = "ai_interview" | "human_interview" | "assignment";

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
