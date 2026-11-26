-- Mr. Vibe Salon – مستر فايب : initial schema (Cloudflare D1 / SQLite)
-- All money values are stored in SAR with 2-decimal rounding done by the server.
-- All timestamps are ISO-8601 UTC strings; "work_date" is the salon business date (Asia/Riyadh, day starts at settings.day_start_hour).

-- ============ Users & auth ============
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','barber')),
  permissions TEXT NOT NULL DEFAULT '[]',          -- JSON array (supervisors)
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

-- ============ Files (private storage: D1 chunks, or R2 when bound) ============
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invoice','payment_proof','avatar','report_pdf')),
  owner_user_id TEXT REFERENCES users(id),           -- the employee this file concerns
  visible_to_owner INTEGER NOT NULL DEFAULT 1,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage TEXT NOT NULL DEFAULT 'd1',                -- 'd1' | 'r2'
  sha256 TEXT,
  attached INTEGER NOT NULL DEFAULT 0,               -- 1 once linked to a record
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_files_owner ON files(owner_user_id);
CREATE TABLE file_chunks (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, idx)
);

-- ============ Settings & locations ============
CREATE TABLE salon_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);

CREATE TABLE location_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============ Employees ============
CREATE TABLE employee_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT,
  photo_file_id TEXT REFERENCES files(id),
  job_title TEXT,
  start_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','suspended','left')),
  works_shifts INTEGER NOT NULL DEFAULT 1,           -- takes attendance + records invoices
  location_id TEXT REFERENCES location_settings(id), -- NULL = any active salon location
  radius_override_m INTEGER,                         -- optional per-employee radius
  barber_rate REAL NOT NULL DEFAULT 50,              -- current % (mirror of latest rates history)
  shop_rate REAL NOT NULL DEFAULT 50,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE employee_rates_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  barber_rate REAL NOT NULL,
  shop_rate REAL NOT NULL,
  effective_from TEXT NOT NULL,                      -- business date
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (abs(barber_rate + shop_rate - 100) < 0.001),
  CHECK (barber_rate >= 0 AND shop_rate >= 0)
);
CREATE INDEX idx_rates_user ON employee_rates_history(user_id, effective_from);

-- ============ Schedules ============
-- A weekly template valid from effective_from (until the next template starts). Future templates allowed.
CREATE TABLE work_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT,
  effective_from TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 10,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sched_user ON work_schedules(user_id, effective_from);
CREATE TABLE schedule_days (
  schedule_id TEXT NOT NULL REFERENCES work_schedules(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT,                                   -- HH:MM
  end_time TEXT,                                     -- HH:MM (<= start means it ends after midnight)
  PRIMARY KEY (schedule_id, weekday)
);
-- One-off daily changes (a specific date): different hours or a day off.
CREATE TABLE schedule_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  work_date TEXT NOT NULL,
  is_off INTEGER NOT NULL DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, work_date)
);

-- ============ Attendance ============
CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  work_date TEXT NOT NULL,
  sched_start TEXT,                                  -- ISO instant of planned start (NULL = unscheduled day)
  sched_end TEXT,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  check_in_at TEXT NOT NULL,
  in_lat REAL, in_lng REAL, in_accuracy REAL, in_distance_m REAL, in_location_id TEXT,
  check_out_at TEXT,
  out_lat REAL, out_lng REAL, out_accuracy REAL, out_distance_m REAL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes INTEGER,
  flags TEXT NOT NULL DEFAULT '[]',                  -- JSON: suspicious-location indicators etc.
  source TEXT NOT NULL DEFAULT 'gps' CHECK (source IN ('gps','manual')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, work_date)
);
CREATE INDEX idx_att_date ON attendance(work_date);

CREATE TABLE attendance_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('check_in','check_out')),
  ok INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  lat REAL, lng REAL, accuracy REAL, distance_m REAL,
  ip TEXT, ip_country TEXT, ip_city TEXT, user_agent TEXT,
  flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attempts_user ON attendance_attempts(user_id, created_at);
CREATE INDEX idx_attempts_date ON attendance_attempts(created_at);

-- ============ Invoices ============
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  work_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  service_type TEXT,
  service_count INTEGER,
  notes TEXT,
  barber_rate REAL NOT NULL,                         -- frozen at creation
  shop_rate REAL NOT NULL,
  barber_share REAL NOT NULL,
  shop_share REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','under_review','approved','rejected','needs_edit')),
  review_note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  edit_request TEXT,                                 -- barber's edit request text (pending)
  edit_requested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_inv_user_date ON invoices(user_id, work_date);
CREATE INDEX idx_inv_date ON invoices(work_date);
CREATE INDEX idx_inv_status ON invoices(status);

CREATE TABLE invoice_images (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  file_id TEXT NOT NULL REFERENCES files(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_invimg_inv ON invoice_images(invoice_id);
CREATE UNIQUE INDEX idx_invimg_file ON invoice_images(file_id);   -- one photo cannot back two invoices (double-submit guard)

-- Revenue split per invoice (values frozen on the invoice at registration time).
CREATE VIEW revenue_splits AS
  SELECT id AS invoice_id, user_id, work_date, amount, barber_rate, shop_rate, barber_share, shop_share, status FROM invoices;

-- ============ Payments to employees ============
CREATE TABLE employee_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL CHECK (amount > 0),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  voided INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_pay_user ON employee_payments(user_id, paid_on);
CREATE TABLE payment_proofs (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES employee_payments(id),
  file_id TEXT NOT NULL REFERENCES files(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_proof_file ON payment_proofs(file_id);

-- ============ Leaves ============
CREATE TABLE leave_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decision_note TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_leave_user ON leave_requests(user_id, start_date);

-- ============ Notifications ============
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notif_user ON notifications(user_id, read_at, created_at);
-- de-duplication keys for automatic (cron) notifications
CREATE TABLE notification_keys (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- ============ Audit log ============
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  subject_user_id TEXT,                              -- the employee affected, if any
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_date ON audit_logs(created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

-- ============ Employee reports (frozen snapshots) ============
CREATE TABLE employee_reports (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  period_type TEXT NOT NULL CHECK (period_type IN ('day','week','month','custom')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  include_images INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL,                       -- frozen data used to render the PDF
  pdf_file_id TEXT REFERENCES files(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent')),
  issued_by TEXT REFERENCES users(id),
  issued_at TEXT NOT NULL,
  sent_at TEXT,
  sent_by TEXT REFERENCES users(id),
  send_count INTEGER NOT NULL DEFAULT 0,
  viewed_at TEXT
);
CREATE INDEX idx_reports_user ON employee_reports(user_id, issued_at);
-- Archive trail of every issue / send / re-send action.
CREATE TABLE report_archive (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES employee_reports(id),
  action TEXT NOT NULL CHECK (action IN ('issued','sent','resent','downloaded','viewed')),
  by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rarch_report ON report_archive(report_id);

-- ============ Financial closures ============
CREATE TABLE financial_closures (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('day','period')),
  user_id TEXT REFERENCES users(id),                 -- NULL for whole-salon day closure
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  summary_json TEXT NOT NULL,                        -- frozen totals / statement
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  note TEXT,
  closed_by TEXT REFERENCES users(id),
  closed_at TEXT NOT NULL,
  reopened_by TEXT REFERENCES users(id),
  reopened_at TEXT,
  reopen_reason TEXT
);
CREATE INDEX idx_closure_range ON financial_closures(date_from, date_to);

-- Sequences for human-readable numbers
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counters (name, value) VALUES ('invoice', 1000), ('report', 0);
