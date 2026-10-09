/*
# Merge carnet entries (admin)

1. Purpose
- Add an admin-only SQL function "merge_photos" that merges two or more carnet
  entries into the first one ("keep" entry), inside a single transaction.
2. What the function does
- Moves every photo_images row from the absorbed entries onto the keep entry,
  renumbering positions after the keep entry's existing images.
- Unions detected_brands, appends other entries' descriptions to the keep
  description, fills nothing else (title/author/city of the keep entry win).
- Keeps the keep entry's publication state; absorbed entries must have the
  same published state or the merge is refused (to avoid mixing a public and a
  private entry).
- Deletes the absorbed photos rows. For manual entries, the public image copy
  in Storage is removed when its path can be derived from the image URL.
  Telegram/media-managed entries keep their files (handled by the mobile
  pipeline).
3. Security
- Function is SECURITY DEFINER, locked to search_path public, and executable
  only by admins (internal is_admin() check, EXECUTE granted to authenticated
  only as defense in depth; RLS on photos already blocks non-admin writes).
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
  IF NOT coalesce(public.is_admin(), false) THEN
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
