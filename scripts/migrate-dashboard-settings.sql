-- Run once on the writable trading DB (not a read replica):
CREATE TABLE IF NOT EXISTS dashboard_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dashboard_settings (key, value, updated_at)
VALUES (
  'archived_strategies',
  '{"archived":["hip3_xsec_skip_momentum","xsec_macd_hl_dryrun","nansen_single_perp"]}'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
