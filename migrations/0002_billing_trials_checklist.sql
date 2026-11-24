-- v1.1 — additive only: open subscriptions, monthly billing, per-client payment alerts,
-- trial clients, quick daily checklist, web push. No existing column or row is changed or removed.

-- Subscriptions: type + monthly billing schedule
ALTER TABLE subscriptions ADD COLUMN sub_type TEXT NOT NULL DEFAULT 'fixed';      -- fixed | open
ALTER TABLE subscriptions ADD COLUMN monthly_amount REAL;                          -- monthly fee (required for open)
ALTER TABLE subscriptions ADD COLUMN pay_day INTEGER;                              -- day of month the client pays
ALTER TABLE subscriptions ADD COLUMN first_due_date TEXT;                          -- first due date of the schedule
ALTER TABLE subscriptions ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'advance'; -- advance | arrears

-- Clients: per-client payment alerts + link to originating trial
ALTER TABLE clients ADD COLUMN pay_alert_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN pay_alert_days INTEGER NOT NULL DEFAULT 3;
ALTER TABLE clients ADD COLUMN trial_id TEXT;

CREATE TABLE trials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  store_name TEXT,
  phone TEXT,
  business_type TEXT,
  platforms TEXT NOT NULL DEFAULT '[]',
  start_date TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 3,
  end_date TEXT NOT NULL,
  daily_budget REAL,
  total_budget REAL,
  actual_spend REAL,
  status TEXT NOT NULL DEFAULT 'active',     -- active | converted | no_deal | stopped  (ending / ended are derived)
  alert_days INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  store_url TEXT,
  account_url TEXT,
  ads_url TEXT,
  converted_client_id TEXT,
  converted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_trials_status ON trials(status);

-- Quick checklist: one row per client per day; items is a JSON map {itemId: true}
CREATE TABLE checklist_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  items TEXT NOT NULL DEFAULT '{}',
  needs_attention INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  user_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (date, client_id)
);
CREATE INDEX idx_checklist_date ON checklist_entries(date);

-- Web push (mobile notifications)
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);
-- Server-only key/value store (VAPID keys). Never exported in backups or returned by the API.
CREATE TABLE app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
