-- v1.5 — additive only. Central payments register: receipts, double-submit guard, edit tracking.
ALTER TABLE payments ADD COLUMN client_key TEXT;                -- idempotency key from the form (prevents double save)
ALTER TABLE payments ADD COLUMN has_receipt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN updated_at TEXT;
ALTER TABLE payments ADD COLUMN created_by TEXT;
CREATE UNIQUE INDEX idx_payments_client_key ON payments(client_key) WHERE client_key IS NOT NULL;
-- Transfer receipt images. Never public: served only through the authenticated API.
CREATE TABLE payment_receipts (
  payment_id TEXT PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,          -- base64
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL
);
