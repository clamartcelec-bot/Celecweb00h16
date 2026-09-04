/* Restrict customer requests to their owner and CELEC administrators. */

DROP POLICY IF EXISTS "anon_select_requests" ON public.requests;
DROP POLICY IF EXISTS "anon_insert_requests" ON public.requests;
DROP POLICY IF EXISTS "anon_update_requests" ON public.requests;
DROP POLICY IF EXISTS "anon_delete_requests" ON public.requests;
DROP POLICY IF EXISTS "auth_insert_requests" ON public.requests;
DROP POLICY IF EXISTS "requests_select_own_or_admin" ON public.requests;
DROP POLICY IF EXISTS "requests_insert_own" ON public.requests;
DROP POLICY IF EXISTS "requests_update_admin" ON public.requests;
DROP POLICY IF EXISTS "requests_delete_admin" ON public.requests;

CREATE POLICY "requests_select_own_or_admin"
  ON public.requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "requests_insert_own"
  ON public.requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "requests_update_admin"
  ON public.requests
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "requests_delete_admin"
  ON public.requests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
