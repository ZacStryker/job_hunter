ALTER TABLE webhook_runs ADD COLUMN duration_ms INTEGER;
ALTER TABLE webhook_runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE webhook_runs ADD COLUMN output_tokens INTEGER;
ALTER TABLE webhook_runs ADD COLUMN cost_usd REAL;
