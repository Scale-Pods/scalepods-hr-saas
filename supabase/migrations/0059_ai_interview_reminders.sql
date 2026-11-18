-- Migration 0059: Register AI Interview Reminder Notification Templates
-- Adds Day 1, Day 3, and Day 5 (Final Notice) reminders for AI Interviews across WhatsApp and Email.

-- 1. WhatsApp Templates
insert into public.notification_templates (
  stage,
  channel,
  approval_state,
  subject,
  body_html,
  meta_template_name,
  locale
)
values
(
  'ai_interview_reminder_day1',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, a quick reminder to complete your AI-powered interview for the {{2}} role at {{3}}. You can start whenever you''re ready using this link: {{4}}',
  'ai_interview_reminder_day1',
  'en'
),
(
  'ai_interview_reminder_day3',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, we are still waiting for you to complete your AI interview for the {{2}} role at {{3}}. Please access your interview session here: {{4}}. We recommend completing it soon so we can review your application.',
  'ai_interview_reminder_day3',
  'en'
),
(
  'ai_interview_final_notice',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, this is your final reminder to complete your AI interview for the {{2}} role at {{3}}. Your access link will expire soon: {{4}}. Please complete it now to keep your application active.',
  'ai_interview_final_notice',
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  updated_at = now();

-- 2. Email Templates
insert into public.notification_templates (
  stage,
  channel,
  approval_state,
  subject,
  body_html,
  meta_template_name,
  locale
)
values
(
  'ai_interview_reminder_day1',
  'email',
  'approved',
  'Reminder: Complete your AI Interview for {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://fvjsaourhzzyvvzrgwan.supabase.co/storage/v1/object/public/Logo''s/2125980a-scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">AI Interview Reminder</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick reminder that your <strong>AI-powered interview</strong> for the position of <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong> is waiting for you.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">You can complete it at your convenience using the link below:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{interview_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Start AI Interview</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">Please ensure you are in a quiet environment with a working camera and microphone.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
),
(
  'ai_interview_reminder_day3',
  'email',
  'approved',
  'Action Required: Complete your AI Interview for {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://fvjsaourhzzyvvzrgwan.supabase.co/storage/v1/object/public/Logo''s/2125980a-scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">AI Interview Waiting</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">We noticed you haven''t started your <strong>AI interview</strong> for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong> yet.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Our hiring team is actively reviewing applications. Please use the button below to complete your session:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{interview_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Begin Your Interview</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">The session takes approximately 10-15 minutes.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
),
(
  'ai_interview_final_notice',
  'email',
  'approved',
  'Final Notice: AI Interview link expiring soon for {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://fvjsaourhzzyvvzrgwan.supabase.co/storage/v1/object/public/Logo''s/2125980a-scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Final Notice: AI Interview</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is your <strong>final reminder</strong> to complete your AI-powered interview for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your secure access link will expire shortly. Please click below to complete it now and keep your candidacy active:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{interview_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Complete Interview Now</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #ef4444;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">Once expired, the interview cannot be restarted without recruiter approval.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  subject = excluded.subject,
  body_html = excluded.body_html,
  updated_at = now();

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
