-- Migration 0054: Practical Take-Home Assignment Templates & Links
-- Ensures candidates invited to assignment rounds receive the direct link and button to their assignment portal.

-- 1. Update / Insert email template for assignment_issued with prominent View & Submit button
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values (
  'assignment_issued',
  'email',
  'approved',
  'Assignment Round: {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Practical Take-Home Assignment</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Congratulations on moving to the <strong>practical take-home assignment</strong> round for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong>!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please review the assignment brief, requirements, and submit your solution before the deadline using the button below:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{assignment_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">View &amp; Submit Assignment</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues accessing the assignment or have any questions, please reply directly to this email.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  subject = excluded.subject,
  updated_at = now();

-- 2. Update / Insert email template for assignment_checkin (Cadence Midpoint Reminder) with button
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values (
  'assignment_checkin',
  'email',
  'approved',
  'Assignment Check-in: {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Check-in</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just checking in on your take-home assignment for the <strong>{{job_title}}</strong> role!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">You are <strong>halfway</strong> to the deadline. Use the button below to review requirements or continue your submission:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{assignment_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Continue Assignment</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  subject = excluded.subject,
  updated_at = now();

-- 3. Update / Insert email template for assignment_reminder_24h (Cadence 24h Deadline Reminder) with button
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values (
  'assignment_reminder_24h',
  'email',
  'approved',
  'Assignment Due in 24 Hours: {{job_title}} - {{candidate_name}} | {{company_name}}',
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Due in 24 Hours</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just a friendly reminder that your take-home assignment for the <strong>{{job_title}}</strong> role is due in <strong>24 hours</strong>.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{assignment_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Submit Assignment</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">Please ensure your files or solution text are submitted before the deadline.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
  null,
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  subject = excluded.subject,
  updated_at = now();

-- 4. Register WhatsApp template for assignment_issued (assignment_invite_v1)
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values (
  'assignment_issued',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, congratulations on moving forward to the practical assignment round for the {{2}} role at {{3}}! Please review your assignment details and submit it here: {{4}}. Good luck!',
  'assignment_invite_v1',
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  subject = excluded.subject,
  updated_at = now();

-- 5. Register WhatsApp template for assignment_reminder_24h (assignment_reminder_24h)
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values (
  'assignment_reminder_24h',
  'whatsapp',
  'approved',
  null,
  'Hi {{1}}, a reminder that your assignment for the {{2}} role at {{3}} is due in 24 hours. Submit it here: {{4}}. Good luck!',
  'assignment_reminder_24h',
  'en'
)
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  subject = excluded.subject,
  updated_at = now();

-- 6. Reload PostgREST schema cache
notify pgrst, 'reload schema';
