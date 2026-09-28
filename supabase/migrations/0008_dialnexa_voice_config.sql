-- 0008_dialnexa_voice_config.sql
-- Store DialNexa voice screening call configuration (prompt, model, voice, first_message) per campaign

alter table campaigns
  add column if not exists voice_call_config jsonb;

comment on column campaigns.voice_call_config is
  'DialNexa voice call configuration (prompt, model, voice, first_message) for automated screening calls.';
