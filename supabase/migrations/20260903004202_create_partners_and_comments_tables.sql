/*
# Create partners and comments tables

1. New Tables
  - `partners` - Brand/partner entries managed by admin
    - `id` (uuid, primary key)
    - `name` (text, not null) - Brand name (e.g. Legrand, ABB, Schneider)
    - `logo_url` (text) - URL to brand logo image
    - `description` (text) - Why we work with them, advantages/disadvantages
    - `position` (integer, default 0) - Display order
    - `published` (boolean, default true) - Visibility toggle
    - `created_at` (timestamptz)
  - `comments` - User comments on both partners and carnet entries
    - `id` (uuid, primary key)
    - `target_type` (text, not null) - Either 'partner' or 'photo'
    - `target_id` (uuid, not null) - ID of the partner or photo
    - `user_id` (uuid) - Authenticated user (nullable for guests)
    - `author_name` (text, not null) - Display name
    - `content` (text, not null) - Comment text
    - `rating` (integer) - Optional 1-5 star rating
    - `created_at` (timestamptz)
2. Security
  - RLS enabled on both tables
  - Partners: public read, authenticated write (admin manages)
  - Comments: public read, anon+authenticated insert, owner update/delete
3. Notes
  - Comments support both partner and photo targets via target_type discriminator
  - Rating is optional (null = no rating, 1-5 = star rating)
*/

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text DEFAULT '',
  description text DEFAULT '',
  position integer DEFAULT 0,
  published boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_partners" ON partners;
CREATE POLICY "public_select_partners" ON partners FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_partners" ON partners;
CREATE POLICY "auth_insert_partners" ON partners FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_partners" ON partners;
CREATE POLICY "auth_update_partners" ON partners FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_partners" ON partners;
CREATE POLICY "auth_delete_partners" ON partners FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('partner', 'photo')),
  target_id uuid NOT NULL,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_comments" ON comments;
CREATE POLICY "public_select_comments" ON comments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_comments" ON comments;
CREATE POLICY "public_insert_comments" ON comments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "owner_update_comments" ON comments;
CREATE POLICY "owner_update_comments" ON comments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner_delete_comments" ON comments;
CREATE POLICY "owner_delete_comments" ON comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_partners_position ON partners (position);
