/*
# Fiche société du concierge (company_facts)

1. New Tables
- `company_facts`: structured, editable facts about CELEC used by the voice concierge
  and shown as pinned "balises" during a call.
  - `id` (uuid, pk)
  - `key` (text, unique) stable identifier, e.g. `hours`
  - `label` (text) short title shown in the frame, e.g. "Horaires"
  - `value` (text) the fact itself, e.g. "Lun–ven 8h–19h"
  - `detail` (text) optional extra line
  - `icon` (text) icon name hint (clock, map, phone, zap, shield)
  - `position` (int) display order
  - `published` (bool) only published facts reach the concierge
  - `updated_at` (timestamptz)

2. Security
- RLS enabled. Published facts are readable by everyone (public company info).
- Only admins (profiles.role = 'admin') can read unpublished rows, insert, update, delete.

3. Seed
- Four starter facts (hours closing at 19h, intervention zone, emergency, quote/callback).
  Inserted only if their key does not already exist. Admins must check and adjust them.
*/

CREATE TABLE IF NOT EXISTS company_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT '',
  value text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'info',
  position int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_facts" ON company_facts;
CREATE POLICY "select_company_facts" ON company_facts FOR SELECT
TO anon, authenticated
USING (published OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_company_facts" ON company_facts;
CREATE POLICY "admin_insert_company_facts" ON company_facts FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_company_facts" ON company_facts;
CREATE POLICY "admin_update_company_facts" ON company_facts FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_company_facts" ON company_facts;
CREATE POLICY "admin_delete_company_facts" ON company_facts FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE INDEX IF NOT EXISTS company_facts_position_idx ON company_facts (position);

INSERT INTO company_facts (key, label, value, detail, icon, position) VALUES
  ('hours', 'Horaires', 'Lundi au vendredi, 8h – 19h', 'Fermé à 19h. Samedi sur rendez-vous.', 'clock', 1),
  ('zone', 'Zone d''intervention', 'Clamart et alentours', 'Hauts-de-Seine et sud de Paris.', 'map', 2),
  ('callback', 'Devis & rappel', 'Rappel sous 24h ouvrées', 'Un numéro de téléphone suffit pour être rappelé.', 'phone', 3),
  ('expertise', 'Métier', 'Électricité générale', 'Rénovation, dépannage, mise en conformité, domotique.', 'zap', 4)
ON CONFLICT (key) DO NOTHING;