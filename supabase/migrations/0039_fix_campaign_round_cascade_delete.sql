-- Fix: allow cascade deletion of campaign_rounds when the parent campaign is
-- deleted. The previous trigger blocked ALL DELETE operations, including those
-- triggered by Postgres ON DELETE CASCADE from the campaigns table.
-- We now only block direct (non-cascade) deletes and all updates.

create or replace function public.guard_campaign_round_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'round_immutable' using detail = 'A hiring round cannot be changed after it is created.';
  end if;

  -- For DELETE: only block if the parent campaign still exists.
  -- A cascade delete from campaigns removal is allowed.
  if tg_op = 'DELETE' then
    if exists (select 1 from public.campaigns where id = old.campaign_id) then
      raise exception 'round_immutable' using detail = 'A hiring round cannot be deleted after it is created.';
    end if;
    -- Parent campaign is gone (cascade) → allow the delete to proceed.
    return old;
  end if;

  -- INSERT path: block if applications already exist for this campaign.
  if exists (select 1 from public.applications a where a.campaign_id = new.campaign_id) then
    raise exception 'pipeline_locked' using detail = 'Hiring rounds cannot be added after applications exist.';
  end if;
  if new.round_number < 1 then
    raise exception 'invalid_round_number' using detail = 'Round numbers must be positive.';
  end if;
  return new;
end;
$$;
