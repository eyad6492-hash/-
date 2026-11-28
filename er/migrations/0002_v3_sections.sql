-- E&R v3: wishes, monthly anniversaries, day plans, memories, visited places, appointments, daily tasks,
-- cravings, confessions, upsets, joys, urgent, requests, commitments, agreements, needs, reminders.

CREATE TABLE wishes (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_id TEXT,
  importance TEXT,
  category TEXT,
  status TEXT,
  notes TEXT,
  picked_by TEXT,
  picked_at TEXT,
  pick_date TEXT,
  pick_notes TEXT,
  surprise INTEGER,
  done_date TEXT,
  done_photo TEXT,
  memory_id TEXT,
  history TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE monthlies (
  id TEXT PRIMARY KEY,
  date TEXT,
  note TEXT,
  did TEXT,
  photos TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_monthlies ON monthlies (date);

CREATE TABLE outings (
  id TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  start_time TEXT,
  description TEXT,
  budget REAL,
  notes TEXT,
  maps_url TEXT,
  photos TEXT,
  status TEXT,
  memory_id TEXT,
  source_col TEXT,
  source_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE outing_items (
  id TEXT PRIMARY KEY,
  outing_id TEXT,
  time TEXT,
  title TEXT,
  kind TEXT,
  place TEXT,
  maps_url TEXT,
  cost REAL,
  notes TEXT,
  done INTEGER,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_outing_items_parent ON outing_items (outing_id);

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  title TEXT,
  date TEXT,
  description TEXT,
  places TEXT,
  restaurants TEXT,
  activities TEXT,
  location TEXT,
  photos TEXT,
  rating INTEGER,
  comment_e TEXT,
  comment_r TEXT,
  source_col TEXT,
  source_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE visited (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  location TEXT,
  maps_url TEXT,
  lat REAL,
  lng REAL,
  visit_date TEXT,
  photos TEXT,
  description TEXT,
  rating INTEGER,
  notes TEXT,
  revisit INTEGER,
  place_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  title TEXT,
  kind TEXT,
  person TEXT,
  date TEXT,
  time TEXT,
  location TEXT,
  maps_url TEXT,
  description TEXT,
  notes TEXT,
  remind TEXT,
  remind_at TEXT,
  attachment_id TEXT,
  attachment_name TEXT,
  status TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  assignee TEXT,
  date TEXT,
  time TEXT,
  priority TEXT,
  status TEXT,
  notes TEXT,
  completed_by TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cravings (
  id TEXT PRIMARY KEY,
  text TEXT,
  category TEXT,
  date TEXT,
  image_id TEXT,
  note TEXT,
  status TEXT,
  link_col TEXT,
  link_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE confessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT,
  importance TEXT,
  needs_talk INTEGER,
  note TEXT,
  read_at TEXT,
  status TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE upsets (
  id TEXT PRIMARY KEY,
  title TEXT,
  details TEXT,
  date TEXT,
  about TEXT,
  what_bothered TEXT,
  wished_instead TEXT,
  want_talk INTEGER,
  status TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE joys (
  id TEXT PRIMARY KEY,
  kind TEXT,
  title TEXT,
  description TEXT,
  category TEXT,
  importance TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE urgent (
  id TEXT PRIMARY KEY,
  title TEXT,
  details TEXT,
  assignee TEXT,
  deadline TEXT,
  priority TEXT,
  status TEXT,
  notes TEXT,
  link_col TEXT,
  link_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  title TEXT,
  kind TEXT,
  details TEXT,
  to_user TEXT,
  proposed_date TEXT,
  status TEXT,
  response_note TEXT,
  responded_at TEXT,
  notes TEXT,
  history TEXT,
  link_col TEXT,
  link_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE commitments (
  id TEXT PRIMARY KEY,
  title TEXT,
  details TEXT,
  promiser TEXT,
  start_date TEXT,
  duration_days INTEGER,
  notes TEXT,
  status TEXT,
  accepted_by TEXT,
  accepted_at TEXT,
  history TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  title TEXT,
  details TEXT,
  date TEXT,
  end_date TEXT,
  notes TEXT,
  draft INTEGER,
  e_approved_at TEXT,
  r_approved_at TEXT,
  closed TEXT,
  version INTEGER,
  history TEXT,
  link_col TEXT,
  link_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE needs (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  qty TEXT,
  priority TEXT,
  image_id TEXT,
  notes TEXT,
  bought INTEGER,
  bought_by TEXT,
  bought_at TEXT,
  price REAL,
  buy_date TEXT,
  shopping_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  title TEXT,
  details TEXT,
  target TEXT,
  date TEXT,
  time TEXT,
  priority TEXT,
  repeat TEXT,
  status TEXT,
  fired_at TEXT,
  link_col TEXT,
  link_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
