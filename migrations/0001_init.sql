-- Media Buyer Control Center — initial schema (Cloudflare D1 / SQLite)
-- Dates are ISO strings: YYYY-MM-DD for calendar dates, full ISO for timestamps.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',          -- owner | admin | media_buyer | followup | finance | custom
  permissions TEXT NOT NULL DEFAULT '[]',       -- JSON array of permission keys
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  vault_until TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,           -- username (lowercase)
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,            -- base64url credential id
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,       -- JWK JSON
  sign_count INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  store_name TEXT,
  phone TEXT,
  email TEXT,
  business_type TEXT,
  category_ids TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  store_url TEXT,
  tiktok_url TEXT,
  tiktok_ads_url TEXT,
  other_links TEXT NOT NULL DEFAULT '[]',     -- [{label,url}]
  start_date TEXT,                             -- بداية التعامل
  platforms TEXT NOT NULL DEFAULT '[]',
  daily_budget REAL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | stopped | frozen | former
  followup_every INTEGER NOT NULL DEFAULT 1,  -- review every N days
  next_contact_date TEXT,
  notes TEXT,
  logo TEXT,                                   -- small data URL
  custom_fields TEXT NOT NULL DEFAULT '[]',   -- [{label,value}]
  archived_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_clients_status ON clients(status);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  duration_months REAL,
  amount REAL NOT NULL DEFAULT 0,
  ad_budget REAL,
  services TEXT,
  platforms TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',      -- active | frozen | stopped | pending_renewal | ended
  is_current INTEGER NOT NULL DEFAULT 1,
  renewed_from TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_subs_client ON subscriptions(client_id);

CREATE TABLE freezes (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  reason TEXT,
  expected_days INTEGER,
  notes TEXT,
  pause_work INTEGER NOT NULL DEFAULT 1,
  end_before TEXT,
  end_after TEXT,
  actual_days INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_freezes_client ON freezes(client_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscription_id TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'transfer',    -- transfer | cash | card | other
  period TEXT,
  type TEXT NOT NULL DEFAULT 'subscription',  -- subscription | ads_budget | setup | other
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_date ON payments(date);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  type TEXT,
  objective TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active | stopped | review | optimize | rejected | ended | paused
  daily_budget REAL,
  total_budget REAL,
  spend REAL,
  impressions INTEGER,
  clicks INTEGER,
  orders INTEGER,
  sales REAL,
  conversions INTEGER,
  links TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_campaigns_client ON campaigns(client_id);

CREATE TABLE campaign_snapshots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  date TEXT NOT NULL,
  spend REAL, impressions INTEGER, clicks INTEGER, orders INTEGER, sales REAL, conversions INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_snap_campaign ON campaign_snapshots(campaign_id);
CREATE INDEX idx_snap_date ON campaign_snapshots(date);

CREATE TABLE followups (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  campaign_ids TEXT NOT NULL DEFAULT '[]',
  checklist TEXT NOT NULL DEFAULT '[]',   -- [{label, value: yes|no|na}]
  status TEXT NOT NULL DEFAULT 'done',    -- done | pending | skipped
  rating TEXT,                            -- excellent | good | improve | problem | urgent
  notes TEXT,
  actions TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_followups_client ON followups(client_id);
CREATE INDEX idx_followups_date ON followups(date);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | urgent
  status TEXT NOT NULL DEFAULT 'new',       -- new | in_progress | done | postponed | cancelled
  recurrence TEXT NOT NULL DEFAULT 'none',  -- none | daily | weekly | monthly | custom
  recurrence_days INTEGER,
  notes TEXT,
  assignee_id TEXT,
  followup_id TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_client ON tasks(client_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  spend REAL, impressions INTEGER, clicks INTEGER, orders INTEGER, sales REAL,
  daily_budget REAL,
  summary TEXT,
  notes TEXT,
  recommendations TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_reports_client ON reports(client_id);

CREATE TABLE service_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  date TEXT NOT NULL,
  valid_until TEXT,
  items TEXT NOT NULL DEFAULT '[]',     -- [{name, details, qty, price}]
  discount REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'amount',  -- amount | percent
  tax_enabled INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 15,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_value REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  terms TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | review | accepted | rejected | expired
  converted_client_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE vault_entries (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_name TEXT,
  login_url TEXT,
  ad_account_id TEXT,
  secret TEXT NOT NULL,      -- AES-GCM encrypted JSON {username,email,password,notes}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_vault_client ON vault_entries(client_id);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  client_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_log_created ON activity_log(created_at);
CREATE INDEX idx_log_client ON activity_log(client_id);
