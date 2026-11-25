-- v1.4 — additive only. Flexible "next payment" date set when recording a payment, timed alerts.
-- Manual next due date (set from a payment: after N days or an exact date). NULL = automatic schedule.
ALTER TABLE subscriptions ADD COLUMN next_due_override TEXT;
-- Per-payment history of the schedule (nothing about older payments is rewritten).
ALTER TABLE payments ADD COLUMN prev_due_date TEXT;      -- the due date this payment settled (if any)
ALTER TABLE payments ADD COLUMN next_due_date TEXT;      -- next due date set when recording it
ALTER TABLE payments ADD COLUMN next_due_days INTEGER;   -- "after N days" if that option was used
-- Per-client alert time (HH:MM, local time). NULL = default from settings.
ALTER TABLE clients ADD COLUMN pay_alert_time TEXT;
-- Sent-notification log: guarantees each alert is sent once.
CREATE TABLE alert_log (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);
