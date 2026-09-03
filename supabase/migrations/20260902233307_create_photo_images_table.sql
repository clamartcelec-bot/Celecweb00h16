/*
# Create photo_images table for multiple images per carnet entry

A carnet entry (photos table) can now have zero or many images.
The existing `image_url` column on photos is kept for backward compat
but new images go into this child table.

## New Tables
- `photo_images`
  - `id` (uuid, PK)
  - `photo_id` (uuid, FK to photos.id ON DELETE CASCADE)
  - `image_url` (text, public URL of the uploaded image)
  - `caption` (text, optional description for this specific image)
  - `position` (int, ordering)
  - `created_at` (timestamptz)

## Security
- RLS enabled. Public SELECT (images are visible on the site).
- Admin-only INSERT/UPDATE/DELETE via is_admin().
*/

CREATE TABLE IF NOT EXISTS photo_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text DEFAULT '',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_images_photo_id ON photo_images(photo_id);

ALTER TABLE photo_images ENABLE ROW LEVEL SECURITY;

-- Public read (images shown on site)
DROP POLICY IF EXISTS "public_select_photo_images" ON photo_images;
CREATE POLICY "public_select_photo_images" ON photo_images
  FOR SELECT TO anon, authenticated USING (true);

-- Admin write
DROP POLICY IF EXISTS "admin_insert_photo_images" ON photo_images;
CREATE POLICY "admin_insert_photo_images" ON photo_images
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_photo_images" ON photo_images;
CREATE POLICY "admin_update_photo_images" ON photo_images
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_photo_images" ON photo_images;
CREATE POLICY "admin_delete_photo_images" ON photo_images
  FOR DELETE TO authenticated USING (public.is_admin());
