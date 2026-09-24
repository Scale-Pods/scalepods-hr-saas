alter table campaigns
  add column cadence_config jsonb;

comment on column campaigns.cadence_config is
  'Per-campaign outreach cadence overrides. null = use plan defaults (CADENCE_STAGES in @scalepods/core).';