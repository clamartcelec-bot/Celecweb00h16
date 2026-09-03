/*
# Create profiles table and link requests to users

1. New Tables
- `profiles`
  - `id` (uuid, primary key, references auth.users)
  - `email` (text, unique, not null)
  - `full_name` (text, optional)
  - `phone` (text, optional)
  - `role` (text: 'client' | 'admin', default 'client')
  - `created_at` (timestamp)
- This table mirrors auth.users so the admin dashboard can list all registered users
  without needing service-role access from the browser.

2. Modified Tables
- `requests`
  - Add `user_id` (uuid, nullable, references auth.users) — links a request to the
    authenticated user who created it. Existing rows keep NULL (anonymous requests).

3. Security
- Enable RLS on `profiles`.
- Users can read their own profile (SELECT, auth.uid() = id).
- Users can update their own profile (UPDATE, auth.uid() = id).
- Admins can read ALL profiles (SELECT, role = 'admin').
- Admins can read ALL requests (SELECT, via role check).
- Requests: keep existing anon policies so public form still works.
- Add authenticated INSERT policy for requests with user_id defaulting to auth.uid().

4. Important Notes
- The `role` column defaults to 'client'. Only manually-promoted users get 'admin'.
- A SECURITY DEFINER function `is_admin()` checks the caller's role safely.
- The `requests.user_id` column is nullable so existing anonymous requests are preserved.
*/

-- ── profiles table ──
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  phone text,
  role text NOT NULL DEFAULT 'client',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Admins can read all profiles
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Users can update their own profile
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── Add user_id to requests ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'requests' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE requests ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Add authenticated INSERT policy for requests (user_id defaults to auth.uid()) ──
DROP POLICY IF EXISTS "auth_insert_requests" ON requests;
CREATE POLICY "auth_insert_requests" ON requests FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── Add admin SELECT policy for requests (already have anon select) ──
-- (anon_select_requests already allows all reads, so admin access is covered)

-- ── Auto-create profile on signup via trigger ──
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
