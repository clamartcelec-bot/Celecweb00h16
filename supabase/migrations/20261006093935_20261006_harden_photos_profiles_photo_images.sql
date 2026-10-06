/*
# Security hardening: draft visibility, role escalation and open writes

## 1. New behaviour
- `profiles`: a signed-in user can no longer change their own `role` column.
  They keep editing `full_name` and `phone` on their own profile.
- `photos`: drafts (published = false) are no longer readable by the public
  site or anonymous visitors. Admins keep full access, including drafts.
- `photos`: the open write policies that let ANY signed-in account insert,
  update or delete entries are removed. Only admins (and the trusted server
  key used by the Telegram import) can write.
- `photo_images`: gallery images attached to an unpublished entry are no
  longer publicly readable.

## 2. Modified tables
- `public.profiles`
  - Removed table-wide UPDATE privilege from `authenticated`.
  - Re-granted UPDATE on `full_name` and `phone` only.
- `public.photos`
  - Dropped policies: `auth_insert_photos`, `auth_update_photos`,
    `auth_delete_photos`.
  - Replaced `anon_select_photos` so it returns only published rows, or any
    row to an admin.
- `public.photo_images`
  - Replaced `public_select_photo_images` so an image is readable only when
    its parent entry is published, or the viewer is an admin.

## 3. Function privileges
- `handle_new_user()` is a trigger-only function; its direct EXECUTE grant is
  revoked from PUBLIC/anon/authenticated.
- `is_admin()` keeps its grants because row-level policies call it.

## 4. Important notes
- No row data is deleted or modified by this migration.
- Admin actions in the site (create, edit, publish, delete, set cover) keep
  working: they run as an authenticated admin and `is_admin()` is true.
- The Telegram import keeps working because it uses the service role key,
  which bypasses row level security.
*/

-- 1. profiles: stop role self-promotion, keep profile editing
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- 2. photos: drafts are not public
DROP POLICY IF EXISTS "anon_select_photos" ON public.photos;
CREATE POLICY "anon_select_photos"
ON public.photos FOR SELECT
TO anon, authenticated
USING (published = true OR is_admin());

-- 3. photos: remove open writes for every signed-in account
DROP POLICY IF EXISTS "auth_insert_photos" ON public.photos;
DROP POLICY IF EXISTS "auth_update_photos" ON public.photos;
DROP POLICY IF EXISTS "auth_delete_photos" ON public.photos;

-- 4. photo_images: gallery of a draft is not public
DROP POLICY IF EXISTS "public_select_photo_images" ON public.photo_images;
CREATE POLICY "public_select_photo_images"
ON public.photo_images FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.photos p
    WHERE p.id = photo_images.photo_id
      AND (p.published = true OR is_admin())
  )
);

-- 5. trigger-only function should not be directly callable
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
