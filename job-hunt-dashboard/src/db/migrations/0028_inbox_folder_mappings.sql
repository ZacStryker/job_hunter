CREATE TABLE IF NOT EXISTS inbox_folder_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  folder_path TEXT NOT NULL,
  job_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_folder_mappings_user_id_idx ON inbox_folder_mappings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_folder_mappings_user_folder_unique_idx ON inbox_folder_mappings(user_id, folder_path);
