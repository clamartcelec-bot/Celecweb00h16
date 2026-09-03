/*
# Add author, image_url columns to photos + create storage bucket

## Modified tables
- `photos`: add `author` (text, person who took the photo), add `image_url` (text, URL of uploaded image)

## New storage
- Create `photos` bucket (public) for image uploads.
- Storage policies: anyone can view (public), only authenticated admins can upload/update/delete.

## Notes
1. Columns added conditionally (IF NOT EXISTS) for idempotency.
2. Public bucket so images can be served directly without auth tokens.
*/

-- Add author column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'author') THEN
    ALTER TABLE photos ADD COLUMN author text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add image_url column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'image_url') THEN
    ALTER TABLE photos ADD COLUMN image_url text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Ensure photos has RLS + admin policies using is_admin()
DROP POLICY IF EXISTS "admin_insert_photos" ON photos;
CREATE POLICY "admin_insert_photos" ON photos
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_photos" ON photos;
CREATE POLICY "admin_update_photos" ON photos
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_photos" ON photos;
CREATE POLICY "admin_delete_photos" ON photos
  FOR DELETE TO authenticated USING (public.is_admin());

-- Create storage bucket for photos (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read
DROP POLICY IF EXISTS "Public read photos" ON storage.objects;
CREATE POLICY "Public read photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'photos');

-- Storage policies: admin upload
DROP POLICY IF EXISTS "Admin upload photos" ON storage.objects;
CREATE POLICY "Admin upload photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND public.is_admin());

-- Storage policies: admin update
DROP POLICY IF EXISTS "Admin update photos" ON storage.objects;
CREATE POLICY "Admin update photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'photos' AND public.is_admin());

-- Storage policies: admin delete
DROP POLICY IF EXISTS "Admin delete photos" ON storage.objects;
CREATE POLICY "Admin delete photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND public.is_admin());
