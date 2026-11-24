-- v1.3 — additive only. Daily quick check from the clients list: one row per client per day.
CREATE TABLE quick_checks (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT,
  checked_at TEXT NOT NULL,
  UNIQUE (date, client_id)
);
CREATE INDEX idx_quick_checks_client ON quick_checks(client_id, date);
