CREATE TABLE IF NOT EXISTS search_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  location TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);
INSERT INTO search_configs (source, query, location)
SELECT * FROM (VALUES
  ('linkedin',  'genai ml',             'The Randstad, Netherlands'),
  ('indeed',    'genai ml python',       'remote'),
  ('indeed_nl', 'genai ml python',       'Randstad'),
  ('linkedin',  'Full stack developer',  'Remote'),
  ('indeed',    'full stack developer',  'remote'),
  ('indeed_nl', 'full stack developer',  'Randstad')
) WHERE NOT EXISTS (SELECT 1 FROM search_configs);
