/**
 * Lightweight, hand-maintained Supabase schema types.
 * Mirrors supabase/migrations/0001_schema.sql through 0015_application_actions_outbox.sql.
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
          company_name: string | null;
          name: string | null;
          email?: string;
          timezone: string;
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
          company_name?: string | null;
          name?: string | null;
          email?: string;
          timezone?: string;
        };
        Update: {
          tier?: string;
          billing_anchor_date?: string;
          billing_status?: string;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          max_messages_per_candidate_per_day?: number | null;
          company_name?: string | null;
          name?: string | null;
          email?: string;
          timezone?: string;
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
          cadence_config: Json | null;
          voice_call_config: Json | null;
          account_id: string;
          name: string;
          jd_text: string | null;
          number_of_rounds: number;
          status: "open" | "closed" | "on" | "off";
          location: string | null;
          work_arrangement: string | null;
          opening_date: string;
          closing_date: string;
          number_of_openings: number;
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string | null;
          salary_period: string | null;
          closed_at: string | null;
          retention_days_snapshot: number | null;
          retention_remaining_seconds: number | null;
          retention_purge_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          cadence_config?: Json | null;
          voice_call_config?: Json | null;
          account_id: string;
          name: string;
          jd_text?: string | null;
          number_of_rounds?: number;
          status?: string;
          location?: string | null;
          work_arrangement?: string | null;
          opening_date?: string;
          closing_date?: string;
          number_of_openings?: number;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string | null;
          salary_period?: string | null;
          closed_at?: string | null;
          retention_days_snapshot?: number | null;
          retention_remaining_seconds?: number | null;
          retention_purge_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [];
      };
      campaign_rounds: {
        Row: {
          id: string;
          campaign_id: string;
          round_number: number;
          round_type: "ai_interview" | "human_interview" | "assignment" | "ai_voice_call";
          interviewer_email: string | null;
          cutoff_score: number | null;
          daily_start_time: string | null;
          daily_end_time: string | null;
          brief_text: string | null;
          duration_minutes: number | null;
          buffer_minutes: number;
          booking_window_days: number;
          assigned_team_member_id: string | null;
          questions: Json;
          evaluation_criteria: Json;
          assignment_deadline_hours: number | null;
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
          brief_text?: string | null;
          duration_minutes?: number | null;
          buffer_minutes?: number;
          booking_window_days?: number;
          assigned_team_member_id?: string | null;
          questions?: Json;
          evaluation_criteria?: Json;
          assignment_deadline_hours?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_rounds"]["Insert"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          account_id: string;
          campaign_id: string;
          candidate_id: string;
          candidate_name: string;
          candidate_email: string;
          candidate_phone: string | null;
          normalized_email: string;
          resume_path: string | null;
          whatsapp_opt_in: boolean;
          status: "active" | "on_hold" | "incomplete" | "rejected" | "offer_ready" | "offer_sent";
          current_stage: "needs_review" | "round" | "offer";
          current_round_number: number | null;
          status_before_hold: "active" | "incomplete" | "offer_ready" | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          campaign_id: string;
          candidate_id: string;
          candidate_name: string;
          candidate_email: string;
          candidate_phone?: string | null;
          resume_path?: string | null;
          whatsapp_opt_in?: boolean;
          status?: string;
          current_stage?: string;
          current_round_number?: number | null;
          status_before_hold?: string | null;
          rejection_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
        Relationships: [];
      };
      application_evaluations: {
        Row: {
          id: string;
          account_id: string;
          application_id: string;
          round_instance_id: string | null;
          score_type: "resume" | "ai_interview" | "ai_voice" | "assignment" | "human_feedback";
          score: number;
          criteria_scores: Json;
          evidence: Json;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id: string;
          round_instance_id?: string | null;
          score_type: string;
          score: number;
          criteria_scores?: Json;
          evidence?: Json;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["application_evaluations"]["Insert"]>;
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          brief_text: string;
          deadline_at: string;
          status: "issued" | "submitted" | "incomplete";
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          brief_text: string;
          deadline_at: string;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Insert"]>;
        Relationships: [];
      };
      company_signwell_templates: {
        Row: {
          id: string;
          account_id: string;
          signwell_template_id: string;
          name: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          signwell_template_id: string;
          name: string;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["company_signwell_templates"]["Insert"]>;
        Relationships: [];
      };
      offers: {
        Row: {
          id: string;
          account_id: string;
          campaign_id: string;
          application_id: string;
          template_id: string;
          field_values: Json;
          candidate_email: string;
          company_signer_email: string;
          signwell_document_id: string | null;
          status: "awaiting_company_signature" | "sent_to_candidate" | "void";
          sent_to_candidate_at: string | null;
          voided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          campaign_id: string;
          application_id: string;
          template_id: string;
          field_values?: Json;
          candidate_email: string;
          company_signer_email: string;
          signwell_document_id?: string | null;
          status?: string;
          sent_to_candidate_at?: string | null;
          voided_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["offers"]["Insert"]>;
        Relationships: [];
      };
      offer_capacity_events: {
        Row: {
          id: string;
          account_id: string;
          campaign_id: string;
          application_id: string | null;
          offer_id: string | null;
          signwell_document_id: string;
          counted_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          campaign_id: string;
          application_id?: string | null;
          offer_id?: string | null;
          signwell_document_id: string;
          counted_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["offer_capacity_events"]["Insert"]>;
        Relationships: [];
      };
      signwell_cancellation_queue: {
        Row: {
          id: string;
          account_id: string;
          campaign_id: string;
          signwell_document_id: string;
          status: "queued" | "cancelled" | "not_cancellable" | "failed";
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          campaign_id: string;
          signwell_document_id: string;
          status?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["signwell_cancellation_queue"]["Insert"]>;
        Relationships: [];
      };
      interviewer_calendar_connections: {
        Row: {
          id: string;
          account_id: string;
          team_member_id: string;
          provider: "google";
          google_email: string | null;
          google_calendar_id: string;
          credential_ref: string | null;
          status: "not_connected" | "pending" | "active" | "revoked";
          connected_at: string | null;
          disconnected_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          team_member_id: string;
          provider?: "google";
          google_email?: string | null;
          google_calendar_id?: string;
          credential_ref?: string | null;
          status?: string;
          connected_at?: string | null;
          disconnected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interviewer_calendar_connections"]["Insert"]>;
        Relationships: [];
      };
      calendar_oauth_states: {
        Row: {
          id: string;
          account_id: string;
          team_member_id: string;
          state_hash: string;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          team_member_id: string;
          state_hash: string;
          expires_at: string;
          consumed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["calendar_oauth_states"]["Insert"]>;
        Relationships: [];
      };
      interviewer_feedback_links: {
        Row: {
          id: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          team_member_id: string;
          token_hash: string;
          expires_at: string;
          used_at: string | null;
          no_show_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          team_member_id: string;
          token_hash: string;
          expires_at: string;
          used_at?: string | null;
          no_show_at?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interviewer_feedback_links"]["Insert"]>;
        Relationships: [];
      };
      interviewer_feedback: {
        Row: {
          id: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          team_member_id: string;
          criteria_scores: Json;
          overall_score: number;
          notes: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id: string;
          round_instance_id: string;
          team_member_id: string;
          criteria_scores: Json;
          overall_score: number;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interviewer_feedback"]["Insert"]>;
        Relationships: [];
      };
      workflow_outbox: {
        Row: {
          id: string;
          account_id: string;
          application_id: string | null;
          round_instance_id: string | null;
          event_type: "round_invitation" | "voice_call_ready" | "candidate_rejected";
          idempotency_key: string;
          payload: Json;
          status: "queued" | "processing" | "sent" | "failed" | "cancelled";
          attempt_count: number;
          available_at: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id?: string | null;
          round_instance_id?: string | null;
          event_type: string;
          idempotency_key: string;
          payload?: Json;
          status?: string;
          attempt_count?: number;
          available_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workflow_outbox"]["Insert"]>;
        Relationships: [];
      };
      round_instances: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          campaign_id: string;
          application_id: string | null;
          round_number: number;
          round_type: string;
          status:
            | "pending"
            | "scheduled"
            | "in_progress"
            | "completed"
            | "passed"
            | "failed"
            | "no_show"
            | "awaiting_review"
            | "incomplete";
          scheduled_at: string | null;
          event_id: string | null;
          meet_link: string | null;
          interview_link: string | null;
          deadline_at: string | null;
          fault_reason: string | null;
          retake_of_round_instance_id: string | null;
          reviewer_cutoff: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          campaign_id: string;
          application_id?: string | null;
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
          reviewer_cutoff?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["round_instances"]["Insert"]>;
        Relationships: [];
      };
      decision_ledger: {
        Row: {
          id: string;
          account_id: string;
          candidate_id: string;
          application_id?: string | null;
          round_instance_id?: string | null;
          stage: string;
          score: number | null;
          score_type?:
            | "resume"
            | "ai_interview"
            | "ai_voice"
            | "assignment"
            | "human_feedback"
            | null;
          rationale: string | null;
          weight?: number | null;
          raw_text?: string | null;
          source?: "workflow" | "manual";
          override_of?: string | null;
          decided_at?: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          application_id?: string | null;
          round_instance_id?: string | null;
          stage: string;
          score?: number | null;
          score_type?: string | null;
          rationale?: string | null;
          weight?: number | null;
          raw_text?: string | null;
          source?: string;
          override_of?: string | null;
          decided_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["decision_ledger"]["Insert"]>;
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          account_id: string;
          application_id?: string | null;
          credit_type: "ai_interview" | "ai_voice_screening" | "scheduled_round";
          action: "reserve" | "commit" | "release" | "grant" | "purchase";
          amount: number;
          round_instance_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          application_id?: string | null;
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
          application_id?: string | null;
          round_instance_id: string | null;
          stage: string;
          channel: "email" | "whatsapp" | "sms" | "voice_call" | "both";
          delivery_state: string;
          fallback_used: boolean;
          sent_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          application_id?: string | null;
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
          application_id?: string | null;
          round_instance_id: string;
          status: string;
          invite_link?: string | null;
          expires_at: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          recording_url?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          application_id?: string | null;
          round_instance_id: string;
          status?: string;
          invite_link?: string | null;
          expires_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          recording_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["interview_sessions"]["Insert"]>;
        Relationships: [];
      };
      scorecards: {
        Row: {
          id: string;
          account_id?: string;
          session_id?: string;
          round_instance_id?: string;
          technical_score?: number | null;
          communication_score?: number | null;
          problem_solving_score?: number | null;
          cultural_fit_score?: number | null;
          overall_score: number | null;
          authenticity_score?: number | null;
          recommendation?: string | null;
          rationale?: string | null;
          criteria?: Json | null;
          red_flags?: Json | null;
          strengths?: Json | null;
          weaknesses?: Json | null;
          recording_path?: string | null;
          transcript_path?: string | null;
          evaluated_at?: string;
          created_at?: string;
        };
        Insert: {
          id?: string;
          account_id?: string;
          session_id?: string;
          round_instance_id?: string;
          overall_score?: number | null;
          rationale?: string | null;
          criteria?: Json | null;
          evaluated_at?: string;
          created_at?: string;
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
          application_id: string | null;
          assignment_id: string | null;
          round_instance_id: string;
          text_response: string | null;
          file_paths: Json | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          candidate_id: string;
          application_id?: string | null;
          assignment_id?: string | null;
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
          application_id: string | null;
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
          application_id?: string | null;
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
          application_id: string;
          candidate_id: string;
          account_id: string;
          campaign_id: string;
          name: string | null;
          email: string;
          phone: string | null;
          resume_url: string | null;
          current_stage: string | null;
          latest_score: number | null;
          decision: string | null;
          round_instance_id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      decide_application: {
        Args: {
          p_application_id: string;
          p_action: "advance" | "reject" | "hold" | "resume";
          p_rejection_reason?: string | null;
        };
        Returns: Json;
      };
      update_application_contact: {
        Args: {
          p_application_id: string;
          p_candidate_name: string;
          p_candidate_email: string;
          p_candidate_phone?: string | null;
          p_whatsapp_opt_in?: boolean;
        };
        Returns: undefined;
      };
      submit_interviewer_feedback: {
        Args: {
          p_token: string;
          p_criteria_scores: Json;
          p_overall_score: number;
          p_notes?: string | null;
        };
        Returns: string;
      };
      report_interviewer_no_show: {
        Args: {
          p_token: string;
        };
        Returns: undefined;
      };
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
        Returns: undefined;
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
