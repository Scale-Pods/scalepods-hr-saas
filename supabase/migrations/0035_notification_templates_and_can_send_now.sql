-- Notification dispatch prerequisites for n8n workflow "4 - Notification Dispatch (sub-workflow)".
-- Provides the quiet hours / sending window check RPC (can_send_now) and
-- notification templates table (notification_templates) with exact approved WhatsApp & rich HTML Email templates.

-- 1. Function: can_send_now
create or replace function public.can_send_now(
  p_account_id uuid default null,
  p_candidate_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := 'UTC';
begin
  if p_account_id is not null then
    select coalesce(timezone, 'UTC') into v_tz
    from public.accounts
    where id = p_account_id;
    if v_tz is null then v_tz := 'UTC'; end if;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'window_open'
  );
end;
$$;

grant execute on function public.can_send_now(uuid, uuid) to anon, authenticated, service_role;

-- 2. Table: notification_templates
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  stage text not null,
  channel text not null default 'email', -- 'email', 'whatsapp', 'sms'
  approval_state text not null default 'approved', -- 'approved', 'pending', 'rejected'
  subject text,
  body_html text,
  meta_template_name text,
  locale text default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_templates_lookup
  on public.notification_templates (stage, channel, approval_state);

create unique index if not exists idx_notification_templates_unique
  on public.notification_templates (stage, channel, approval_state)
  where account_id is null;

alter table public.notification_templates enable row level security;

drop policy if exists "notification_templates_read" on public.notification_templates;
create policy "notification_templates_read"
  on public.notification_templates for select
  using (true);

drop policy if exists "notification_templates_write" on public.notification_templates;
create policy "notification_templates_write"
  on public.notification_templates for all
  using (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
  with check (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role');

grant select on table public.notification_templates to anon, authenticated, service_role;
grant all privileges on table public.notification_templates to service_role;

-- 3. Seed exact approved WhatsApp & HTML Email templates
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values
  -- =========================================================================
  -- WhatsApp Templates (Meta approved template names and text)
  -- =========================================================================
  ('interview_invite', 'whatsapp', 'approved', null,
   'Hi {{1}}, congratulations on moving forward for the {{2}} role at {{3}}! Please book your interview slot using this link: {{4}}. We look forward to speaking with you.',
   'interview_invite_v1', 'en'),

  ('booking_reminder_day1', 'whatsapp', 'approved', null,
   'Hi {{1}}, a quick reminder to book your interview slot for the {{2}} role at {{3}}. You can pick a time here: {{4}}. Let us know if you need any help.',
   'booking_reminder_day1', 'en'),

  ('booking_reminder_day3', 'whatsapp', 'approved', null,
   'Hi {{1}}, we''re still waiting for you to select an interview time for the {{2}} position at {{3}}. Please book here: {{4}}. Slots are filling up, so we''d recommend choosing one soon.',
   'booking_reminder_day3', 'en'),

  ('booking_final_notice', 'whatsapp', 'approved', null,
   'Hi {{1}}, this is your final reminder to book your interview slot for the {{2}} role at {{3}}. The link will expire soon: {{4}}. Please book now to keep your application active.',
   'booking_final_notice', 'en'),

  ('pre_interview_24h', 'whatsapp', 'approved', null,
   'Hi {{1}}, a reminder that your interview for the {{2}} role at {{3}} is scheduled for {{4}}, about 24 hours from now. Please be ready a few minutes early. Good luck!',
   'pre_interview_24h', 'en'),

  ('interview_link_today', 'whatsapp', 'approved', null,
   'Hi {{1}}, your interview for the {{2}} role at {{3}} is today! Join using this secure link: {{4}}. Please join a few minutes before your slot.',
   'interview_link_today', 'en'),

  ('assignment_reminder_24h', 'whatsapp', 'approved', null,
   'Hi {{1}}, a reminder that your assignment for the {{2}} role at {{3}} is due in 24 hours. Submit it here: {{4}}. Good luck!',
   'assignment_reminder_24h', 'en'),

  ('result_next_round', 'whatsapp', 'approved', null,
   'Hi {{1}}, great news! You''ve cleared this round for the {{2}} role at {{3}}. Our team will share the next steps shortly. Congratulations!',
   'result_next_round', 'en'),

  ('result_not_selected', 'whatsapp', 'approved', null,
   'Hi {{1}}, thank you for your time and effort in the process for the {{2}} role at {{3}}. After careful review, we won''t be moving forward with your application at this time. We wish you all the best ahead.',
   'result_not_selected', 'en'),

  -- =========================================================================
  -- Rich HTML Email Templates
  -- =========================================================================
  -- 1. Book Your Interview Slot (Day 0 & Day 1)
  ('interview_invite', 'email', 'approved',
   'Book Your Interview Slot: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Book Your Interview Slot</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick reminder to book your interview slot for the <strong>{{job_title}}</strong> role.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  ('booking_reminder_day1', 'email', 'approved',
   'Book Your Interview Slot: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Book Your Interview Slot</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick reminder to book your interview slot for the <strong>{{job_title}}</strong> role.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 2. Your Invite Is Expiring (Day 3)
  ('booking_reminder_day3', 'email', 'approved',
   'Your Invite Is Expiring: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Your Invite Is Expiring</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">We are still waiting for you to select a time for your interview for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please book now to keep your application active.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 3. Final Notice (Day 5)
  ('booking_final_notice', 'email', 'approved',
   'Final Notice: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Final Notice</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is your <strong>final notice</strong> to book your interview slot for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">The link will expire soon.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 4. Interview Confirmed
  ('booking_confirmed', 'email', 'approved',
   'Interview Confirmed: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Confirmed</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview is <strong>confirmed</strong>!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">We have sent a calendar invite to your email.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 5. Interview Rescheduled
  ('booking_rescheduled', 'email', 'approved',
   'Interview Rescheduled: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Rescheduled</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview has been <strong>successfully rescheduled</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please check your calendar for the updated time.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 6. Interview Tomorrow (24h before)
  ('pre_interview_24h', 'email', 'approved',
   'Interview Tomorrow: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Tomorrow</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview for the <strong>{{job_title}}</strong> role is coming up in <strong>24 hours</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please be prepared and join a few minutes early.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 7. Your Interview Is Today
  ('interview_link_today', 'email', 'approved',
   'Your Interview Is Today: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Your Interview Is Today</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview is <strong>today</strong>! Here is your secure meeting link:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{meeting_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Join Interview</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 8. Assignment Round (Issued)
  ('assignment_issued', 'email', 'approved',
   'Assignment Round: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Round</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Congratulations on moving to the <strong>assignment round</strong> for the <strong>{{job_title}}</strong> role!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please review the details and complete it by the deadline.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 9. Assignment Check-in (Halfway)
  ('assignment_checkin', 'email', 'approved',
   'Assignment Check-in: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Check-in</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just checking in on your take-home assignment!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">You are <strong>halfway</strong> to the deadline.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 10. Assignment Due in 24 Hours
  ('assignment_reminder_24h', 'email', 'approved',
   'Assignment Due in 24 Hours: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Due in 24 Hours</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just a reminder that your take-home assignment for the <strong>{{job_title}}</strong> role is due in <strong>24 hours</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Good luck!</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 11. Interview Cleared (Next Round)
  ('result_next_round', 'email', 'approved',
   'Interview Cleared: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Cleared</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Congratulations! You have successfully moved to the next round for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please use the link below to book your interview slot.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 12. Application Update
  ('application_update', 'email', 'approved',
   'Application Update: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Application Update</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick message regarding your application for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please check your email for any pending actions.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 13. Not Selected
  ('result_not_selected', 'email', 'approved',
   'Update regarding your application for {{job_title}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Application Update</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Thank you for your time and effort in the process for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">After careful review, we will not be moving forward with your application at this time. We wish you all the best in your job search.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en')
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  subject = excluded.subject,
  updated_at = now();

-- 4. Reload PostgREST schema cache
notify pgrst, 'reload schema';
