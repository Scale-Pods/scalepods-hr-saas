-- Migration 0055: Fix assignment cascade deletion
--
-- The previous trigger `assignments_immutable_fields` blocked ALL DELETE operations on `public.assignments`:
--   if tg_op = 'DELETE' then raise exception 'assignment_immutable' ...
-- This broke candidate and application deletion whenever an assignment was issued,
-- because Postgres ON DELETE CASCADE was aborted by the trigger.
--
-- We now allow DELETE operations (cascades when application, round_instance, or campaign is deleted),
-- while continuing to guard against mutations to immutable assignment fields on UPDATE.

create or replace function public.guard_assignment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Allow DELETE (e.g. cascading deletes when an application, round, or campaign is removed)
  if tg_op = 'DELETE' then
    return old;
  end if;

  if row(old.application_id, old.round_instance_id, old.brief_text, old.deadline_at)
     is distinct from row(new.application_id, new.round_instance_id, new.brief_text, new.deadline_at) then
    raise exception 'assignment_immutable' using detail = 'Assignment instructions and deadlines cannot be changed or reopened.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_immutable_fields on public.assignments;
create trigger assignments_immutable_fields
before update or delete on public.assignments
for each row execute function public.guard_assignment_immutable_fields();

notify pgrst, 'reload schema';
