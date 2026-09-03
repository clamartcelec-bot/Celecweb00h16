/*
# Fix admin policies on invoices and exchanges tables

Admin policies on invoices and exchanges do a sub-SELECT on profiles which is
subject to RLS, creating the same recursion issue. Replace them with the
`is_admin()` SECURITY DEFINER function.

## Changes
- Replace admin SELECT/UPDATE/DELETE policies on invoices to use is_admin().
- Replace admin SELECT/UPDATE/DELETE policies on exchanges to use is_admin().
- Also add admin INSERT policies (were missing).
*/

-- INVOICES
DROP POLICY IF EXISTS "admin_select_invoices" ON invoices;
CREATE POLICY "admin_select_invoices" ON invoices
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_invoices" ON invoices;
CREATE POLICY "admin_insert_invoices" ON invoices
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_invoices" ON invoices;
CREATE POLICY "admin_update_invoices" ON invoices
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_invoices" ON invoices;
CREATE POLICY "admin_delete_invoices" ON invoices
  FOR DELETE TO authenticated USING (public.is_admin());

-- EXCHANGES
DROP POLICY IF EXISTS "admin_select_exchanges" ON exchanges;
CREATE POLICY "admin_select_exchanges" ON exchanges
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_exchanges" ON exchanges;
CREATE POLICY "admin_insert_exchanges" ON exchanges
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_exchanges" ON exchanges;
CREATE POLICY "admin_update_exchanges" ON exchanges
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_exchanges" ON exchanges;
CREATE POLICY "admin_delete_exchanges" ON exchanges
  FOR DELETE TO authenticated USING (public.is_admin());
