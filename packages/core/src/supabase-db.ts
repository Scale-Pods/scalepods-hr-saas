/**
 * Lightweight, hand-maintained Supabase schema types.
 * Mirrors supabase/migrations/0001_schema.sql.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          tier: "free" | "basic" | "growth" | "enterprise";
          billing_anchor_date: string;
          billing_status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          max_messages_per_candidate_per_day: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          tier?: string;
          billing_anchor_date?: string;
          billing_status?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          max_messages_per_candidate_per_day?: number | null;
        };
        Update: {
          tier?: string;
          billing_anchor_date?: string;
          billing_status?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          max_messages_per_candidate_per_day?: number | null;
        };
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          account_id: string;
          name: string | null;
          email: string;
          phone: string | null;
          normalized_email: string;
          resume_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name?: string | null;
          email: string;
          phone?: string | null;
          resume_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          jd_text: string | null;
          number_of_rounds: number;
          status: "on" | "off";
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          jd_text?: string | null;
          number_of_rounds?: number;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [];
      };
      campaign_rounds: {
        Row: {
          id: string;
          campaign_id: string;
          round_number: number;
          round_type: "ai_interview" | "human_interview" | "assignment";
          interviewer_email: string | null;
          cutoff_score: number | null;
          daily_start_time: string | null;
          daily_end_time: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          round_number: number;
          round_type: string;
          interviewer_email?: string | null;
          cutoff_score?: number | null;
          daily_start_time?: string | null;
          daily_end_time?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_rounds"]["Insert"]>;
        Relationships: [];
      };
      round_instances: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          campaign_id: string;
          round_number: number;
          round_type: string;
          status:
            | "pending"
            | "scheduled"
            | "in_progress"
            | "completed"
            | "passed"
            | "failed"
            | "no_show";
          scheduled_at: string | null;
          event_id: string | null;
          meet_link: string | null;
          interview_link: string | null;
          deadline_at: string | null;
          fault_reason: string | null;
          retake_of_round_instance_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          campaign_id: string;
          round_number: number;
          round_type: string;
          status?: string;
          scheduled_at?: string | null;
          event_id?: string | null;
          meet_link?: string | null;
          interview_link?: string | null;
          deadline_at?: string | null;
          fault_reason?: string | null;
          retake_of_round_instance_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["round_instances"]["Insert"]>;
        Relationships: [];
      };
      decision_ledger: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          stage: string;
          score: number | null;
          rationale: string | null;
          source: "workflow" | "manual";
          override_of: string | null;
          decided_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          stage: string;
          score?: number | null;
          rationale?: string | null;
          source?: string;
          override_of?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["decision_ledger"]["Insert"]>;
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          account_id: string;
          credit_type: "ai_interview" | "ai_voice_screening" | "scheduled_round";
          action: "reserve" | "commit" | "release" | "grant" | "purchase";
          amount: number;
          round_instance_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          credit_type: string;
          action: string;
          amount: number;
          round_instance_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["credit_ledger"]["Insert"]>;
        Relationships: [];
      };
      outreach_log: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          round_instance_id: string | null;
          stage: string;
          channel: "email" | "whatsapp" | "sms" | "voice_call";
          delivery_state: string;
          fallback_used: boolean;
          sent_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          round_instance_id?: string | null;
          stage: string;
          channel: string;
          delivery_state?: string;
          fallback_used?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_log"]["Insert"]>;
        Relationships: [];
      };
      interview_sessions: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          round_instance_id: string;
          status: string;
          invite_link: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          round_instance_id: string;
          status?: string;
          invite_link?: string | null;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interview_sessions"]["Insert"]>;
        Relationships: [];
      };
      scorecards: {
        Row: {
          id: string;
          session_id: string;
          technical_score: number | null;
          communication_score: number | null;
          problem_solving_score: number | null;
          cultural_fit_score: number | null;
          overall_score: number | null;
          authenticity_score: number | null;
          recommendation: string | null;
          red_flags: Json | null;
          strengths: Json | null;
          weaknesses: Json | null;
          evaluated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          technical_score?: number | null;
          communication_score?: number | null;
          problem_solving_score?: number | null;
          cultural_fit_score?: number | null;
          overall_score?: number | null;
          authenticity_score?: number | null;
          recommendation?: string | null;
          red_flags?: Json | null;
          strengths?: Json | null;
          weaknesses?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["scorecards"]["Insert"]>;
        Relationships: [];
      };
      proctoring_events: {
        Row: {
          id: string;
          session_id: string;
          event_type: string;
          severity: "info" | "warning" | "critical";
          timestamp: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          event_type: string;
          severity?: string;
          timestamp?: string;
        };
        Update: Partial<Database["public"]["Tables"]["proctoring_events"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          account_id: string;
          actor_type: "account_holder" | "system" | "ai";
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          actor_type: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          email: string;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          email: string;
          role?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["team_members"]["Insert"]>;
        Relationships: [];
      };
      calendar_connections: {
        Row: {
          account_id: string;
          provider: string;
          status: "not_connected" | "pending" | "active" | "degraded" | "revoked";
          google_email: string | null;
          connected_at: string | null;
        };
        Insert: {
          account_id: string;
          provider?: string;
          status?: string;
          google_email?: string | null;
          connected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_connections"]["Insert"]>;
        Relationships: [];
      };
      candidate_access_tokens: {
        Row: {
          id: string;
          account_id: string;
          resource_type: "booking" | "session" | "assignment";
          resource_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          resource_type: string;
          resource_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["candidate_access_tokens"]["Insert"]>;
        Relationships: [];
      };
      assignment_submissions: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          round_instance_id: string;
          text_response: string | null;
          file_paths: Json | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          round_instance_id: string;
          text_response?: string | null;
          file_paths?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["assignment_submissions"]["Insert"]>;
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          account_id: string;
          round_instance_id: string;
          interviewer_email: string | null;
          event_id: string;
          slot_start: string;
          slot_end: string;
          meet_link: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          round_instance_id: string;
          interviewer_email?: string | null;
          event_id: string;
          slot_start: string;
          slot_end: string;
          meet_link?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_events"]["Insert"]>;
        Relationships: [];
      };
      tier_limits: {
        Row: {
          id: "free" | "basic" | "growth" | "enterprise";
          label: string;
          max_rounds: number;
          active_campaigns: number | null;
          resumes_screened: number | null;
          ai_interview: number | null;
          ai_voice_screening: number | null;
          scheduled_round: number | null;
          offers_per_month: number | null;
          whatsapp: boolean;
          voice_screening: boolean;
          sms: boolean;
          assignment: boolean;
          retention_days: number;
          custom_identity: boolean;
          overage_behavior: "hard_stop" | "metered";
        };
        Insert: Partial<Database["public"]["Tables"]["tier_limits"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["tier_limits"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      campaign_candidates: {
        Row: {
          candidate_id: string;
          campaign_id: string;
          account_id: string;
          name: string | null;
          email: string;
          phone: string | null;
          resume_url: string | null;
          current_stage: string | null;
          latest_score: number | null;
          decision: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_booking_context: {
        Args: { p_round_instance_id: string; p_token: string; p_tz_offset_minutes?: number };
        Returns: Json;
      };
      get_session_context: {
        Args: { p_session_id: string; p_token: string; p_tz_offset_minutes?: number };
        Returns: Json;
      };
      get_assignment_context: {
        Args: { p_round_instance_id: string; p_token: string; p_tz_offset_minutes?: number };
        Returns: Json;
      };
      get_available_slots: {
        Args: {
          p_round_instance_id: string;
          p_token: string;
          p_date: string;
          p_start_time: string;
          p_end_time: string;
          p_timezone: string;
        };
        Returns: Json;
      };
      insert_proctoring_event: {
        Args: {
          p_session_id: string;
          p_token: string;
          p_event_type: string;
          p_detail: string;
        };
        Returns: void;
      };
      insert_assignment_submission: {
        Args: {
          p_round_instance_id: string;
          p_token: string;
          p_text_response: string;
          p_file_paths: string[];
        };
        Returns: string;
      };
    };
  };
};