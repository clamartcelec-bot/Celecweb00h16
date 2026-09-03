/*
# Create invoices and exchanges tables for CRM client space

1. New Tables
- `invoices`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, owner of the invoice)
  - `number` (text, invoice reference like "F-2026-001")
  - `label` (text, short description of what was invoiced)
  - `amount` (numeric, total amount in euros)
  - `status` (text: 'draft' | 'sent' | 'paid' | 'overdue', default 'draft')
  - `issued_at` (timestamp, when the invoice was created/sent)
  - `paid_at` (timestamp, nullable, when it was paid)
  - `created_at` (timestamp)
- `exchanges`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, the client this exchange belongs to)
  - `type` (text: 'call' | 'email' | 'visit' | 'sms' | 'note', the kind of interaction)
  - `summary` (text, brief description of the exchange)
  - `details` (text, longer notes, nullable)
  - `author` (text, who on the CELEC team handled it)
  - `happened_at` (timestamp, when the interaction took place)
  - `created_at` (timestamp)

2. Security
- Enable RLS on both tables.
- Clients can SELECT their own invoices and exchanges (auth.uid() = user_id).
- Admins (role = 'admin' in profiles) can SELECT/INSERT/UPDATE all rows.
- Admins can INSERT and UPDATE invoices and exchanges for any client.
- Clients cannot INSERT/UPDATE/DELETE (only admins manage CRM data).

3. Important Notes
- These tables are admin-managed: only team members create invoices and log exchanges.
- Clients only have read access to their own data.
- The admin check uses a subquery on the profiles table.
*/

-- ── invoices table ──
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Clients can read their own invoices
DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Admins can read all invoices
DROP POLICY IF EXISTS "admin_select_invoices" ON invoices;
CREATE POLICY "admin_select_invoices" ON invoices FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins can insert invoices
DROP POLICY IF EXISTS "admin_insert_invoices" ON invoices;
CREATE POLICY "admin_insert_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins can update invoices
DROP POLICY IF EXISTS "admin_update_invoices" ON invoices;
CREATE POLICY "admin_update_invoices" ON invoices FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Admins can delete invoices
DROP POLICY IF EXISTS "admin_delete_invoices" ON invoices;
CREATE POLICY "admin_delete_invoices" ON invoices FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── exchanges table ──
CREATE TABLE IF NOT EXISTS exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note',
  summary text NOT NULL DEFAULT '',
  details text,
  author text NOT NULL DEFAULT '',
  happened_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;

-- Clients can read their own exchanges
DROP POLICY IF EXISTS "select_own_exchanges" ON exchanges;
CREATE POLICY "select_own_exchanges" ON exchanges FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Admins can read all exchanges
DROP POLICY IF EXISTS "admin_select_exchanges" ON exchanges;
CREATE POLICY "admin_select_exchanges" ON exchanges FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins can insert exchanges
DROP POLICY IF EXISTS "admin_insert_exchanges" ON exchanges;
CREATE POLICY "admin_insert_exchanges" ON exchanges FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Admins can update exchanges
DROP POLICY IF EXISTS "admin_update_exchanges" ON exchanges;
CREATE POLICY "admin_update_exchanges" ON exchanges FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Admins can delete exchanges
DROP POLICY IF EXISTS "admin_delete_exchanges" ON exchanges;
CREATE POLICY "admin_delete_exchanges" ON exchanges FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_user_id ON exchanges(user_id);
