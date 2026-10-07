-- Migration 0010: Post-round review threshold, assignment brief text, and awaiting_review status
-- 1. Add brief_text to campaign_rounds so custom assignment briefs are stored
alter table campaign_rounds
  add column if not exists brief_text text;

-- 2. Add reviewer_cutoff to round_instances for post-round recruiter threshold evaluation
alter table round_instances
  add column if not exists reviewer_cutoff numeric;

-- 3. Update status constraint on round_instances to include 'awaiting_review' (and ensure 'no_show' is included)
alter table round_instances
  drop constraint if exists round_instances_status_check;

alter table round_instances
  add constraint round_instances_status_check check
    (status in ('pending','scheduled','in_progress','completed','passed','failed','no_show','awaiting_review'));

-- 4. Update outreach_log channel constraint to allow 'both' for multi-channel notification dispatch
alter table outreach_log
  drop constraint if exists outreach_log_channel_check;

alter table outreach_log
  add constraint outreach_log_channel_check check
    (channel in ('email','whatsapp','sms','voice_call','both'));

-- 5. Update outreach_log delivery_state constraint to allow all pipeline delivery states
alter table outreach_log
  drop constraint if exists outreach_log_delivery_state_check;

alter table outreach_log
  add constraint outreach_log_delivery_state_check check
    (delivery_state in (
      'queued',
      'sent',
      'delivered',
      'read',
      'failed',
      'bounced',
      'suppressed',
      'held_for_window',
      'held_for_cap',
      'attempted',
      'connected'
    ));

-- 6. Update campaign_rounds round_type constraint to allow 'ai_voice_call'
alter table campaign_rounds
  drop constraint if exists campaign_rounds_round_type_check;

alter table campaign_rounds
  add constraint campaign_rounds_round_type_check check
    (round_type in ('ai_interview','human_interview','assignment','ai_voice_call'));

