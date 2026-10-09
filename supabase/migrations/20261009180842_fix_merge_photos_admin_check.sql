/*
# Guard merge_photos with a proper admin check

The previous version called is_admin() which relies on request.jwt.claim_role
and is not set for normal authenticated sessions. This version reads the
authenticated user id from request.jwt.claims -> 'sub' and checks the profile
role directly, the same way carnet_require_admin does.
*/

CREATE OR REPLACE FUNCTION public.merge_photos(p_keep uuid, p_absorbed uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  keep public.photos;
  other public.photos;
  absorbed_id uuid;
  moved integer := 0;
  brands text[];
  extra_desc text;
  published_state boolean;
  pos integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid)
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_absorbed IS NULL OR array_length(p_absorbed, 1) IS NULL THEN
    RAISE EXCEPTION 'nothing_to_merge';
  END IF;
  IF p_absorbed @> ARRAY[p_keep] THEN
    RAISE EXCEPTION 'keep_must_not_be_absorbed';
  END IF;

  SELECT * INTO keep FROM public.photos WHERE id = p_keep;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  published_state := keep.published;
  pos := coalesce((SELECT max(position) + 1 FROM public.photo_images WHERE photo_id = p_keep), 0);
  brands := keep.detected_brands;
  extra_desc := '';

  FOREACH absorbed_id IN ARRAY p_absorbed LOOP
    CONTINUE WHEN absorbed_id = p_keep;
    SELECT * INTO other FROM public.photos WHERE id = absorbed_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    IF other.published IS DISTINCT FROM published_state THEN
      RAISE EXCEPTION 'published_state_mismatch';
    END IF;

    -- Move images to the keep entry
    WITH moved_rows AS (
      UPDATE public.photo_images
      SET photo_id = p_keep, position = pos + (row_number() over (order by position)) - 1
      WHERE photo_id = absorbed_id
      RETURNING 1
    )
    SELECT count(*) INTO moved FROM moved_rows;
    pos := pos + moved;

    -- Union brands
    SELECT COALESCE(array_agg(DISTINCT b), '{}') INTO brands
    FROM unnest(coalesce(brands, '{}') || coalesce(other.detected_brands, '{}')) AS b;

    -- Collect description text
    extra_desc := extra_desc || CASE
      WHEN coalesce(other.description, '') <> '' THEN other.description || E'\n\n'
      ELSE ''
    END;

    DELETE FROM public.photos WHERE id = absorbed_id;
  END LOOP;

  UPDATE public.photos
  SET detected_brands = nullif(brands, '{}'),
      description = CASE
        WHEN extra_desc <> '' THEN concat_ws(E'\n\n', nullif(keep.description, ''), trim(extra_desc))
        ELSE keep.description
      END
  WHERE id = p_keep;

  RETURN moved;
END
$function$;

REVOKE ALL ON FUNCTION public.merge_photos(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_photos(uuid, uuid[]) TO authenticated;
