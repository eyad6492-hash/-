-- E&R — initial schema. Core tables (auth, sync, files, notifications) + one table per collection.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  letter TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT,
  avatar_id TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  cycle_until TEXT,
  ua TEXT
);
CREATE INDEX ix_sessions_user ON sessions (user_id);

-- one-time tokens: partner invitations and password-reset links
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE login_attempts (k TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX ix_login_attempts ON login_attempts (k, at);

CREATE TABLE app_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE space_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- change log that drives live sync between the two accounts
CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  col TEXT NOT NULL,
  row_id TEXT NOT NULL,
  op TEXT NOT NULL,
  actor TEXT NOT NULL,
  owner_only TEXT,
  title TEXT,
  at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  actor TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE reminder_log (key TEXT PRIMARY KEY, at TEXT NOT NULL);

CREATE TABLE dates (
  id TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  cal TEXT,
  h_year INTEGER,
  h_month INTEGER,
  h_day INTEGER,
  recurring INTEGER,
  kind TEXT,
  description TEXT,
  note TEXT,
  image_id TEXT,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT,
  date TEXT,
  end_date TEXT,
  time TEXT,
  end_time TEXT,
  assignee TEXT,
  location TEXT,
  notes TEXT,
  source_col TEXT,
  source_id TEXT,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  assignee TEXT,
  due_date TEXT,
  priority TEXT,
  status TEXT,
  notes TEXT,
  attachment_id TEXT,
  attachment_name TEXT,
  completed_at TEXT,
  completed_by TEXT,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  body TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_task_comments_parent ON task_comments (task_id);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  month TEXT,
  title TEXT,
  date TEXT,
  assignee TEXT,
  priority TEXT,
  status TEXT,
  description TEXT,
  notes TEXT,
  link TEXT,
  image_id TEXT,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE moods (
  id TEXT PRIMARY KEY,
  date TEXT,
  mood TEXT,
  message TEXT,
  needs TEXT,
  energy INTEGER,
  private_note TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_moods ON moods (created_by, date);

CREATE TABLE cycles (
  id TEXT PRIMARY KEY,
  start_date TEXT,
  end_date TEXT,
  flow TEXT,
  symptoms TEXT,
  mood TEXT,
  pain INTEGER,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  image_id TEXT,
  maps_url TEXT,
  location TEXT,
  cuisine TEXT,
  price INTEGER,
  rating INTEGER,
  notes TEXT,
  to_try TEXT,
  visited INTEGER,
  visit_date TEXT,
  favorite INTEGER,
  photos TEXT,
  lat REAL,
  lng REAL,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bucket (
  id TEXT PRIMARY KEY,
  title TEXT,
  image_id TEXT,
  url TEXT,
  description TEXT,
  cost REAL,
  suggested_date TEXT,
  status TEXT,
  event_id TEXT,
  done_date TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT,
  destination TEXT,
  start_date TEXT,
  end_date TEXT,
  budget REAL,
  hotel_url TEXT,
  flight_url TEXT,
  flight_details TEXT,
  hotel_details TEXT,
  notes TEXT,
  image_id TEXT,
  photos TEXT,
  status TEXT,
  honeymoon INTEGER,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trip_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  section TEXT,
  title TEXT,
  date TEXT,
  time TEXT,
  amount REAL,
  url TEXT,
  notes TEXT,
  done INTEGER,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_trip_items_parent ON trip_items (trip_id);

CREATE TABLE honeymoon (
  id TEXT PRIMARY KEY,
  name TEXT,
  country TEXT,
  image_id TEXT,
  budget REAL,
  flight_cost REAL,
  hotel_cost REAL,
  best_time TEXT,
  duration INTEGER,
  pros TEXT,
  cons TEXT,
  rating INTEGER,
  notes TEXT,
  chosen INTEGER,
  trip_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE honey_items (
  id TEXT PRIMARY KEY,
  section TEXT,
  title TEXT,
  destination_id TEXT,
  date TEXT,
  amount REAL,
  url TEXT,
  notes TEXT,
  done INTEGER,
  image_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shopping (
  id TEXT PRIMARY KEY,
  name TEXT,
  qty TEXT,
  category TEXT,
  notes TEXT,
  buyer TEXT,
  done INTEGER,
  done_by TEXT,
  done_at TEXT,
  remind TEXT,
  remind_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  title TEXT,
  amount REAL,
  date TEXT,
  category TEXT,
  paid_by TEXT,
  notes TEXT,
  receipt_id TEXT,
  trip_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  month TEXT,
  amount REAL,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_budgets ON budgets (month);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT,
  image_id TEXT,
  date TEXT,
  pinned INTEGER,
  kind TEXT,
  color TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
