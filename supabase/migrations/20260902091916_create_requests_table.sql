/*
# Create requests table (single-tenant, no auth)

1. New Tables
- `requests`
  - `id` (uuid, primary key)
  - `category` (text: problem | works | project | installation | question)
  - `description` (text, optional first message from the visitor)
  - `commune` (text, optional)
  - `contact_preference` (text: email | phone | callback)
  - `callback_requested` (boolean, default false)
  - `status` (text: new | to_call | in_progress | waiting_client | scheduled | done)
  - `created_at` (timestamp)
2. Security
- Enable RLS on `requests`.
- Allow anon + authenticated CRUD because the public site accepts requests without sign-in.
*/

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'question',
  description text,
  commune text,
  contact_preference text NOT NULL DEFAULT 'email',
  callback_requested boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_requests" ON requests;
CREATE POLICY "anon_select_requests" ON requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_requests" ON requests;
CREATE POLICY "anon_insert_requests" ON requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_requests" ON requests;
CREATE POLICY "anon_update_requests" ON requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_requests" ON requests;
CREATE POLICY "anon_delete_requests" ON requests FOR DELETE
  TO anon, authenticated USING (true);
