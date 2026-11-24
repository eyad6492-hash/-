-- v1.2 — additive only.
-- Billing cycle in days (NULL = monthly on pay_day). Example: 15 = collect every 15 days.
ALTER TABLE subscriptions ADD COLUMN cycle_days INTEGER;
-- Client billing model: 'subscription' (default) or 'commission' (نسبة / عمولة — no fixed recurring dues).
ALTER TABLE clients ADD COLUMN billing_model TEXT NOT NULL DEFAULT 'subscription';
