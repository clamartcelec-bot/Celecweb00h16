CREATE FUNCTION public.carnet_media_lock(p_actor uuid,p_entry uuid,p_attempt uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE (carnet_entry_id=p_entry AND status='created') OR (original_entry_id=p_entry AND status='deleted') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF b.publication_attempt IS NOT NULL AND b.publication_started>now()-interval '120 seconds' THEN RAISE EXCEPTION 'publication_busy'; END IF;
  UPDATE public.carnet_ingest_batches SET publication_attempt=p_attempt,publication_started=now() WHERE batch_id=b.batch_id RETURNING * INTO b;
  RETURN to_jsonb(b);
END $$;

CREATE FUNCTION public.carnet_media_finish(p_actor uuid,p_entry uuid,p_attempt uuid,p_action text,p_images jsonb DEFAULT '[]',p_item uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches; m public.carnet_ingest_media; obj jsonb; img uuid; cover_url text; is_published boolean; remove_paths jsonb='[]';
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE carnet_entry_id=p_entry OR (original_entry_id=p_entry AND status='deleted') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF b.publication_attempt IS DISTINCT FROM p_attempt OR b.publication_started<=now()-interval '120 seconds' THEN RAISE EXCEPTION 'attempt_lost'; END IF;
  IF b.status='deleted' AND p_action NOT IN ('release','cleanup','delete_entry') THEN RAISE EXCEPTION 'entry_deleted'; END IF;
  SELECT published INTO is_published FROM public.photos WHERE id=p_entry;
  IF p_action='publish' THEN
    IF jsonb_array_length(p_images)<>(SELECT count(*) FROM public.photo_images WHERE photo_id=p_entry)
      OR (SELECT count(DISTINCT x->>'photo_image_id') FROM jsonb_array_elements(p_images) x)<>jsonb_array_length(p_images) THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
    FOR obj IN SELECT * FROM jsonb_array_elements(p_images) LOOP
      IF coalesce(obj->>'url','')='' THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
      UPDATE public.photo_images SET image_url=obj->>'url'
        WHERE id=(obj->>'photo_image_id')::uuid AND photo_id=p_entry;
      IF NOT FOUND THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
    END LOOP;
    SELECT pi.image_url INTO cover_url FROM public.carnet_ingest_media cm JOIN public.photo_images pi ON pi.id=cm.photo_image_id WHERE cm.item_id=b.cover_media_id AND pi.photo_id=p_entry;
    IF cover_url IS NULL THEN SELECT image_url INTO cover_url FROM public.photo_images WHERE photo_id=p_entry ORDER BY position LIMIT 1; END IF;
    UPDATE public.photos SET published=true,image_url=coalesce(cover_url,'') WHERE id=p_entry;
    UPDATE public.carnet_ingest_batches SET publication_paths=p_images WHERE batch_id=b.batch_id;
  ELSIF p_action='unpublish' THEN
    remove_paths=b.publication_paths;
    UPDATE public.photos SET published=false,image_url='' WHERE id=p_entry;
    UPDATE public.photo_images SET image_url='' WHERE photo_id=p_entry;
    UPDATE public.carnet_ingest_batches SET publication_paths='[]' WHERE batch_id=b.batch_id;
  ELSIF p_action='set_cover' THEN
    SELECT * INTO m FROM public.carnet_ingest_media WHERE item_id=p_item AND batch_id=b.batch_id AND photo_image_id IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    SELECT image_url INTO cover_url FROM public.photo_images WHERE id=m.photo_image_id AND photo_id=p_entry;
    UPDATE public.carnet_ingest_batches SET cover_media_id=p_item WHERE batch_id=b.batch_id;
    UPDATE public.photos SET image_url=coalesce(cover_url,'') WHERE id=p_entry;
  ELSIF p_action='remove_image' THEN
    SELECT * INTO m FROM public.carnet_ingest_media WHERE item_id=p_item AND batch_id=b.batch_id AND photo_image_id IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    SELECT coalesce(jsonb_agg(x),'[]') INTO remove_paths FROM jsonb_array_elements(b.publication_paths) x WHERE x->>'item_id'=p_item::text;
    DELETE FROM public.photo_images WHERE id=m.photo_image_id AND photo_id=p_entry;
    UPDATE public.carnet_ingest_batches SET publication_paths=(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(publication_paths) x WHERE x->>'item_id'<>p_item::text),
      cover_media_id=CASE WHEN cover_media_id=p_item THEN (SELECT item_id FROM public.carnet_ingest_media WHERE batch_id=b.batch_id AND photo_image_id IS NOT NULL ORDER BY position NULLS LAST,created_at LIMIT 1) ELSE cover_media_id END WHERE batch_id=b.batch_id;
    SELECT pi.image_url INTO cover_url FROM public.carnet_ingest_batches cb JOIN public.carnet_ingest_media cm ON cm.item_id=cb.cover_media_id JOIN public.photo_images pi ON pi.id=cm.photo_image_id WHERE cb.batch_id=b.batch_id;
    UPDATE public.photos SET image_url=coalesce(cover_url,'') WHERE id=p_entry;
  ELSIF p_action='attach_image' THEN
    SELECT * INTO m FROM public.carnet_ingest_media WHERE item_id=p_item AND batch_id=b.batch_id AND origin='admin' FOR UPDATE;
    IF NOT FOUND OR NOT m.verified THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
    IF m.photo_image_id IS NULL THEN
      IF (SELECT count(*) FROM public.photo_images WHERE photo_id=p_entry)>=20 THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
      cover_url=CASE WHEN is_published THEN p_images->0->>'url' ELSE '' END;
      IF is_published AND coalesce(cover_url,'')='' THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
      INSERT INTO public.photo_images(photo_id,image_url,position) VALUES(p_entry,coalesce(cover_url,''),coalesce((SELECT max(position)+1 FROM public.photo_images WHERE photo_id=p_entry),0)) RETURNING id INTO img;
      IF is_published THEN p_images=jsonb_build_array(jsonb_set(p_images->0,'{photo_image_id}',to_jsonb(img::text))); END IF;
      UPDATE public.carnet_ingest_media SET photo_id=p_entry,photo_image_id=img WHERE item_id=p_item;
      UPDATE public.carnet_ingest_batches SET cover_media_id=coalesce(cover_media_id,p_item),publication_paths=publication_paths||p_images WHERE batch_id=b.batch_id;
      IF b.cover_media_id IS NULL THEN UPDATE public.photos SET image_url=coalesce(cover_url,'') WHERE id=p_entry; END IF;
    END IF;
  ELSIF p_action='delete_entry' THEN
    remove_paths=b.publication_paths;
    DELETE FROM public.photos WHERE id=p_entry;
    UPDATE public.carnet_ingest_batches SET publication_paths='[]' WHERE batch_id=b.batch_id;
  ELSIF p_action NOT IN ('release','cleanup') THEN RAISE EXCEPTION 'invalid_action';
  END IF;
  UPDATE public.carnet_ingest_batches SET publication_attempt=CASE WHEN p_action='release' THEN NULL ELSE publication_attempt END,
    publication_started=CASE WHEN p_action='release' THEN NULL ELSE now() END,cleanup_paths=cleanup_paths||remove_paths,updated_at=now() WHERE batch_id=b.batch_id;
  RETURN jsonb_build_object('batch_id',b.batch_id,'cleanup_paths',remove_paths);
END $$;

CREATE FUNCTION public.carnet_admin_prepare_image(p_actor uuid,p_entry uuid,p_item uuid,p_mime text,p_size bigint,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches; m public.carnet_ingest_media;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE carnet_entry_id=p_entry AND status='created' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_mime NOT IN ('image/jpeg','image/png') OR p_size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'invalid_manifest'; END IF;
  SELECT * INTO m FROM public.carnet_ingest_media WHERE item_id=p_item;
  IF FOUND THEN
    IF m.batch_id<>b.batch_id OR m.origin<>'admin' OR m.sha256<>p_hash OR m.byte_size<>p_size OR m.mime_type<>p_mime THEN RAISE EXCEPTION 'manifest_conflict'; END IF;
    RETURN to_jsonb(m);
  END IF;
  -- A browser retry may have lost its local UUID: reuse an identical pending object.
  SELECT * INTO m FROM public.carnet_ingest_media WHERE batch_id=b.batch_id AND origin='admin' AND photo_image_id IS NULL
    AND mime_type=p_mime AND byte_size=p_size AND sha256=p_hash ORDER BY created_at LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(m); END IF;
  IF (SELECT count(*) FROM public.carnet_ingest_media WHERE batch_id=b.batch_id AND origin='admin' AND photo_image_id IS NULL)>=3 THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
  INSERT INTO public.carnet_ingest_media(item_id,batch_id,type,origin,position,mime_type,byte_size,sha256,storage_path,photo_id)
    VALUES(p_item,b.batch_id,'image','admin',NULL,p_mime,p_size,p_hash,'mobile/'||b.user_id||'/'||b.batch_id||'/admin/'||p_item||'/1.'||CASE p_mime WHEN 'image/png' THEN 'png' ELSE 'jpg' END,p_entry) RETURNING * INTO m;
  RETURN to_jsonb(m);
END $$;

REVOKE ALL ON FUNCTION public.carnet_media_lock(uuid,uuid,uuid),public.carnet_media_finish(uuid,uuid,uuid,text,jsonb,uuid),public.carnet_admin_prepare_image(uuid,uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.carnet_media_lock(uuid,uuid,uuid),public.carnet_media_finish(uuid,uuid,uuid,text,jsonb,uuid),public.carnet_admin_prepare_image(uuid,uuid,uuid,text,bigint,text) TO service_role;
