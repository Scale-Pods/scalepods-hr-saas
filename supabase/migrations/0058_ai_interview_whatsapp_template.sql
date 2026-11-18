-- Migration 0058: Register AI Interview WhatsApp Notification Template
-- Ensures candidates invited to AI video/audio interviews receive their direct interview link via WhatsApp.

insert into public.notification_templates (
  stage,
  channel,
  approval_state,
  subject,
  body_html,
  meta_template_name,
  locale
)
values (
  'ai_interview_invite',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, congratulations on moving forward for the {{2}} role at {{3}}! You have been invited to complete your AI-powered interview. Please access your interview room and start using the link below: {{4}}',
  'ai_interview_invite_v1',
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  updated_at = now();

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
