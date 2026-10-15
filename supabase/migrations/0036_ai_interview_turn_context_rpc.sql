-- Migration 0036: High-performance turn context resolver for AI interview engine
-- Collapses 4 HTTP REST roundtrips into a single atomic RPC call, reducing turn latency by 600-800ms.

-- 1. Ensure required columns and indexes exist
alter table public.interview_sessions 
  add column if not exists started_at timestamptz;

alter table public.interview_questions 
  add column if not exists round_instance_id uuid,
  add column if not exists account_id uuid,
  add column if not exists question_number int,
  add column if not exists competency text;

alter table public.interview_answers 
  add column if not exists round_instance_id uuid,
  add column if not exists account_id uuid,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_interview_questions_session_lookup 
  on public.interview_questions(session_id, order_index);

create index if not exists idx_interview_questions_round_lookup 
  on public.interview_questions(round_instance_id, question_number);

create index if not exists idx_interview_answers_session_lookup 
  on public.interview_answers(session_id, answered_at);

create index if not exists idx_interview_answers_round_lookup 
  on public.interview_answers(round_instance_id);

-- 2. Atomic Turn Context Resolver RPC
create or replace function public.get_interview_turn_context(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.interview_sessions%rowtype;
  v_questions jsonb := '[]'::jsonb;
  v_answers jsonb := '[]'::jsonb;
begin
  -- Fetch session
  select * into v_session 
  from public.interview_sessions 
  where id = p_session_id;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  -- Validate expiry / completion
  if v_session.status in ('completed', 'expired') or 
     (v_session.expires_at is not null and v_session.expires_at <= now()) then
    return jsonb_build_object('error', 'invalid_or_expired_session');
  end if;

  -- Atomic state advancement: mark in_progress only on the initial turn if invited
  if v_session.status = 'invited' then
    update public.interview_sessions
    set status = 'in_progress',
        started_at = coalesce(started_at, now())
    where id = p_session_id
    returning * into v_session;
  end if;

  -- Fetch questions (ensures question_number and order_index are normalized for n8n)
  select coalesce(
    jsonb_agg(
      jsonb_set(
        jsonb_set(to_jsonb(q), '{question_number}', to_jsonb(coalesce(q.question_number, q.order_index, 0))),
        '{order_index}', to_jsonb(coalesce(q.order_index, q.question_number, 0))
      )
      order by coalesce(q.question_number, q.order_index, 0) asc
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.interview_questions q
  where q.session_id = v_session.id
     or (v_session.round_instance_id is not null and q.round_instance_id = v_session.round_instance_id);

  -- Fetch previous answers using answered_at
  select coalesce(
    jsonb_agg(
      to_jsonb(a) 
      order by a.answered_at asc
    ),
    '[]'::jsonb
  )
  into v_answers
  from public.interview_answers a
  where a.session_id = v_session.id
     or (v_session.round_instance_id is not null and a.round_instance_id = v_session.round_instance_id);

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'questions', v_questions,
    'answers', v_answers
  );
end;
$$;

grant execute on function public.get_interview_turn_context(uuid) to anon, authenticated, service_role;
