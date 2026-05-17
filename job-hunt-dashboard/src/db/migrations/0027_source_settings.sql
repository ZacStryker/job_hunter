CREATE TABLE IF NOT EXISTS source_settings (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO source_settings (source, enabled) VALUES
  ('linkedin', 1),
  ('indeed', 1),
  ('indeed_nl', 1),
  ('arc', 1);
