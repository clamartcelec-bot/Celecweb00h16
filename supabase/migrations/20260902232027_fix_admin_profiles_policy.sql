/*
# Fix recursive admin SELECT policy on profiles

The existing `select_all_profiles_admin` policy does a sub-SELECT on `profiles`
itself to check if the requesting user is an admin. This causes RLS recursion
issues — Postgres cannot evaluate the policy because the sub-query is also
subject to RLS on the same table.

## Changes
- Drop the recursive `select_all_profiles_admin` policy.
- Create a SECURITY DEFINER helper function `is_admin()` that bypasses RLS to
  check the caller's role in profiles.
- Recreate the admin SELECT policy using `is_admin()`.

## Security
- `is_admin()` is SECURITY DEFINER with a fixed search_path to prevent abuse.
- Only checks the row matching `auth.uid()`, so no privilege escalation.
*/

-- Helper function that bypasses RLS to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Replace the recursive policy
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;

CREATE POLICY "select_all_profiles_admin" ON profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());
