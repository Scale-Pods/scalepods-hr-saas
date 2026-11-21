-- Migration 0064: Auto-normalize company_logo_url for Google Drive / Dropbox links

create or replace function public.normalize_company_logo_url(p_url text)
returns text language plpgsql immutable as $$
declare
  v_match text[];
begin
  if p_url is null or btrim(p_url) = '' then
    return null;
  end if;

  -- Google Drive /file/d/<id>
  v_match := regexp_matches(p_url, 'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', 'i');
  if v_match is not null and array_length(v_match, 1) >= 1 then
    return 'https://lh3.googleusercontent.com/d/' || v_match[1];
  end if;

  -- Google Drive id=<id>
  v_match := regexp_matches(p_url, 'drive\.google\.com/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]+)', 'i');
  if v_match is not null and array_length(v_match, 1) >= 1 then
    return 'https://lh3.googleusercontent.com/d/' || v_match[1];
  end if;

  -- Dropbox dl=0 -> raw=1
  if position('dropbox.com' in p_url) > 0 then
    return regexp_replace(p_url, '\bdl=0\b', 'raw=1', 'g');
  end if;

  return btrim(p_url);
end;
$$;

create or replace function public.trg_normalize_accounts_logo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_logo_url := public.normalize_company_logo_url(new.company_logo_url);
  return new;
end;
$$;

drop trigger if exists trg_normalize_accounts_logo on public.accounts;
create trigger trg_normalize_accounts_logo
  before insert or update of company_logo_url on public.accounts
  for each row execute function public.trg_normalize_accounts_logo();

-- Normalize existing accounts
update public.accounts
set company_logo_url = public.normalize_company_logo_url(company_logo_url)
where company_logo_url is not null;

