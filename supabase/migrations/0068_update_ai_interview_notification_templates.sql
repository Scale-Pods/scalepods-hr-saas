-- Migration 0068: Update AI Interview WhatsApp Notification Templates
-- Updates the exact approved template text and structure for AI interview invitation and reminder stages.

-- 1. AI Interview Invitation (WhatsApp)
update public.notification_templates
set
  meta_template_name = 'ai_interview_invite_v1',
  body_html = 'Hi {{1}}, congratulations on moving forward for the {{2}} role at {{3}}!

You have been invited to complete your AI-powered interview. Please access your interview room and start using the link below:
{{4}}

This link is valid for 5 days. You will need a quiet environment, camera, and microphone. Best of luck!',
  updated_at = now()
where stage = 'ai_interview_invite'
  and channel = 'whatsapp'
  and account_id is null;

-- 2. AI Interview Reminder Day 1 (WhatsApp)
update public.notification_templates
set
  meta_template_name = 'ai_interview_reminder_day1',
  body_html = 'Hi {{1}}, a quick reminder to complete your AI-powered interview for the {{2}} role at {{3}}.

You can start whenever you''re ready using this link: {{4}}',
  updated_at = now()
where stage = 'ai_interview_reminder_day1'
  and channel = 'whatsapp'
  and account_id is null;

-- 3. AI Interview Reminder Day 3 (WhatsApp)
update public.notification_templates
set
  meta_template_name = 'ai_interview_reminder_day3',
  body_html = 'Hi {{1}}, we are still waiting for you to complete your AI interview for the {{2}} role at {{3}}.

Please access your interview session here: {{4}}.

We recommend completing it soon so we can review your application.',
  updated_at = now()
where stage = 'ai_interview_reminder_day3'
  and channel = 'whatsapp'
  and account_id is null;

-- 4. AI Interview Final Notice (WhatsApp)
update public.notification_templates
set
  meta_template_name = 'ai_interview_final_notice',
  body_html = 'Hi {{1}}, this is your final reminder to complete your AI interview for the {{2}} role at {{3}}.

Your access link will expire soon: {{4}}.

Please complete it now to keep your application active.',
  updated_at = now()
where stage = 'ai_interview_final_notice'
  and channel = 'whatsapp'
  and account_id is null;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
