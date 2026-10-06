CREATE TABLE public.carnet_ingest_batches (
  batch_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'mobile_app' CHECK (source = 'mobile_app'),
  api_version integer NOT NULL DEFAULT 1 CHECK (api_version = 1),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  expected_bytes bigint NOT NULL CHECK (expected_bytes > 0 AND expected_bytes <= 104857600),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','uploaded','processing','failed','created','deleted')),
  stage text NOT NULL DEFAULT 'verify',
  attempt_id uuid,
  lease_until timestamptz,
  attempt_times timestamptz[] NOT NULL DEFAULT '{}',
  settings_snapshot jsonb,
  draft_result jsonb,
  voice_transcript text,
  error_code text,
  retryable boolean NOT NULL DEFAULT true,
  carnet_entry_id uuid UNIQUE REFERENCES public.photos(id) ON DELETE SET NULL,
  original_entry_id uuid UNIQUE,
  cover_media_id uuid,
  publication_attempt uuid,
  publication_started timestamptz,
  publication_paths jsonb NOT NULL DEFAULT '[]',
  cleanup_paths jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carnet_ingest_owner_state ON public.carnet_ingest_batches(user_id,status);
CREATE TABLE public.carnet_ingest_media (
  item_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.carnet_ingest_batches(batch_id),
  type text NOT NULL CHECK (type IN ('image','audio','video')),
  origin text NOT NULL DEFAULT 'capture' CHECK (origin IN ('capture','admin')),
  position integer,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','audio/mp4','video/mp4')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  duration_ms integer,
  generation integer NOT NULL DEFAULT 1,
  storage_path text NOT NULL UNIQUE,
  verified boolean NOT NULL DEFAULT false,
  needs_reupload boolean NOT NULL DEFAULT false,
  transcript text,
  transcription_done boolean NOT NULL DEFAULT false,
  photo_id uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  photo_image_id uuid UNIQUE REFERENCES public.photo_images(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id,position),
  CHECK ((origin = 'capture' AND position >= 0) OR (origin = 'admin' AND position IS NULL))
);
ALTER TABLE public.carnet_ingest_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnet_ingest_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carnet_ingest_batches, public.carnet_ingest_media FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.carnet_ingest_batches, public.carnet_ingest_media TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('carnet-ingest','carnet-ingest',false,26214400,ARRAY['image/jpeg','image/png','audio/mp4','video/mp4'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE FUNCTION public.carnet_require_admin(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END $$;

CREATE FUNCTION public.mobile_carnet_prepare(p_actor uuid,p_batch uuid,p_manifest jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches; item jsonb; total bigint; count_active integer; reserved bigint; ext text;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE batch_id=p_batch FOR UPDATE;
  IF FOUND THEN
    IF b.user_id<>p_actor THEN RAISE EXCEPTION 'not_found'; END IF;
    IF b.manifest_hash<>p_hash OR b.manifest<>p_manifest THEN RAISE EXCEPTION 'manifest_conflict'; END IF;
    IF b.status='deleted' THEN RAISE EXCEPTION 'entry_deleted'; END IF;
    IF b.status='created' OR (b.status='processing' AND b.lease_until>now()) THEN RETURN to_jsonb(b); END IF;
    -- Invalid paths get a new generation. Old signed tokens cannot overwrite validated content.
    UPDATE public.carnet_ingest_media SET generation=generation+1,
      storage_path=split_part(storage_path,'/',1)||'/'||p_actor||'/'||p_batch||'/'||item_id||'/'||(generation+1)||'.'||CASE type WHEN 'image' THEN CASE mime_type WHEN 'image/png' THEN 'png' ELSE 'jpg' END WHEN 'audio' THEN 'm4a' ELSE 'mp4' END,
      needs_reupload=false,verified=false WHERE batch_id=p_batch AND needs_reupload;
    IF b.stage='verify' THEN
      UPDATE public.carnet_ingest_batches SET status='uploading',attempt_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE batch_id=p_batch RETURNING * INTO b;
    END IF;
    RETURN to_jsonb(b);
  END IF;
  SELECT count(*),coalesce(sum(expected_bytes),0) INTO count_active,reserved
    FROM public.carnet_ingest_batches WHERE user_id=p_actor AND status NOT IN ('created','deleted');
  SELECT sum((x->>'byte_size')::bigint) INTO total FROM jsonb_array_elements(p_manifest->'items') x;
  IF count_active>=3 OR reserved+total>314572800 THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
  IF jsonb_array_length(p_manifest->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_manifest'; END IF;
  INSERT INTO public.carnet_ingest_batches(batch_id,user_id,manifest,manifest_hash,expected_bytes)
    VALUES(p_batch,p_actor,p_manifest,p_hash,total) RETURNING * INTO b;
  FOR item IN SELECT * FROM jsonb_array_elements(p_manifest->'items') LOOP
    ext=CASE item->>'mime_type' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'audio/mp4' THEN 'm4a' ELSE 'mp4' END;
    INSERT INTO public.carnet_ingest_media(item_id,batch_id,type,position,mime_type,byte_size,sha256,duration_ms,storage_path)
      VALUES((item->>'item_id')::uuid,p_batch,item->>'type',(item->>'position')::integer,item->>'mime_type',
        (item->>'byte_size')::bigint,item->>'sha256',(item->>'duration_ms')::integer,
        'mobile/'||p_actor||'/'||p_batch||'/'||(item->>'item_id')||'/1.'||ext);
  END LOOP;
  RETURN to_jsonb(b);
END $$;

CREATE FUNCTION public.mobile_carnet_claim(p_actor uuid,p_batch uuid,p_attempt uuid,p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE batch_id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.user_id<>p_actor THEN RAISE EXCEPTION 'not_found'; END IF;
  IF b.status='deleted' THEN RAISE EXCEPTION 'entry_deleted'; END IF;
  IF b.status='created' OR (b.status='processing' AND b.lease_until>now()) THEN RETURN to_jsonb(b); END IF;
  IF (SELECT count(*) FROM public.carnet_ingest_batches cb CROSS JOIN LATERAL unnest(cb.attempt_times) t WHERE cb.user_id=p_actor AND t>now()-interval '1 minute')>=6 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  IF EXISTS(SELECT 1 FROM public.carnet_ingest_batches WHERE user_id=p_actor AND status='processing' AND lease_until>now() AND batch_id<>p_batch) THEN RAISE EXCEPTION 'processing_busy'; END IF;
  UPDATE public.carnet_ingest_batches SET status='processing',attempt_id=p_attempt,lease_until=now()+interval '120 seconds',
    attempt_times=ARRAY(SELECT t FROM unnest(attempt_times) t WHERE t>now()-interval '1 minute')||now(),
    settings_snapshot=coalesce(settings_snapshot,p_settings),error_code=NULL,updated_at=now()
    WHERE batch_id=p_batch RETURNING * INTO b;
  RETURN to_jsonb(b);
END $$;

CREATE FUNCTION public.mobile_carnet_checkpoint(p_actor uuid,p_batch uuid,p_attempt uuid,p_patch jsonb,p_item uuid DEFAULT NULL,p_media jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE batch_id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.user_id<>p_actor THEN RAISE EXCEPTION 'not_found'; END IF;
  IF b.status<>'processing' OR b.attempt_id IS DISTINCT FROM p_attempt OR b.lease_until<=now() THEN RAISE EXCEPTION 'attempt_lost'; END IF;
  IF p_item IS NOT NULL THEN
    UPDATE public.carnet_ingest_media SET
      verified=CASE WHEN p_media ? 'verified' THEN (p_media->>'verified')::boolean ELSE verified END,
      needs_reupload=CASE WHEN p_media ? 'needs_reupload' THEN (p_media->>'needs_reupload')::boolean ELSE needs_reupload END,
      transcript=CASE WHEN p_media ? 'transcript' THEN p_media->>'transcript' ELSE transcript END,
      transcription_done=CASE WHEN p_media ? 'transcription_done' THEN (p_media->>'transcription_done')::boolean ELSE transcription_done END
      WHERE item_id=p_item AND batch_id=p_batch;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;
  UPDATE public.carnet_ingest_batches SET
    stage=coalesce(p_patch->>'stage',stage),status=coalesce(p_patch->>'status',status),
    draft_result=CASE WHEN p_patch ? 'draft_result' THEN p_patch->'draft_result' ELSE draft_result END,
    voice_transcript=CASE WHEN p_patch ? 'voice_transcript' THEN p_patch->>'voice_transcript' ELSE voice_transcript END,
    error_code=CASE WHEN p_patch ? 'error_code' THEN p_patch->>'error_code' ELSE error_code END,
    retryable=coalesce((p_patch->>'retryable')::boolean,retryable),
    attempt_id=CASE WHEN p_patch->>'status' IN ('uploaded','uploading','failed') THEN NULL ELSE attempt_id END,
    lease_until=CASE WHEN p_patch->>'status' IN ('uploaded','uploading','failed') THEN NULL ELSE lease_until END,
    updated_at=now() WHERE batch_id=p_batch;
END $$;

CREATE FUNCTION public.mobile_carnet_commit(p_actor uuid,p_batch uuid,p_attempt uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.carnet_ingest_batches; m public.carnet_ingest_media; entry uuid; image uuid; idx integer=0; author_name text;
BEGIN
  PERFORM public.carnet_require_admin(p_actor);
  SELECT * INTO b FROM public.carnet_ingest_batches WHERE batch_id=p_batch FOR UPDATE;
  IF NOT FOUND OR b.user_id<>p_actor THEN RAISE EXCEPTION 'not_found'; END IF;
  IF b.status='created' THEN RETURN b.carnet_entry_id; END IF;
  IF b.status='deleted' THEN RAISE EXCEPTION 'entry_deleted'; END IF;
  IF b.status<>'processing' OR b.attempt_id IS DISTINCT FROM p_attempt OR b.lease_until<=now() THEN RAISE EXCEPTION 'attempt_lost'; END IF;
  IF b.draft_result IS NULL OR EXISTS(SELECT 1 FROM public.carnet_ingest_media WHERE batch_id=p_batch AND origin='capture' AND NOT verified)
    OR (SELECT count(*) FROM public.carnet_ingest_media WHERE batch_id=p_batch AND origin='capture')<>jsonb_array_length(b.manifest->'items') THEN RAISE EXCEPTION 'incomplete_batch'; END IF;
  SELECT coalesce(nullif(full_name,''),email) INTO author_name FROM public.profiles WHERE id=p_actor;
  INSERT INTO public.photos(title,description,author,city,lat,lng,published,image_url,source,voice_transcript,ai_summary,detected_brands,raw_data)
    VALUES(left(b.draft_result->>'title',120),b.draft_result->>'description',author_name,'',0,0,false,'','mobile_app',NULL,
      b.draft_result->>'ai_summary',ARRAY(SELECT jsonb_array_elements_text(coalesce(b.draft_result->'brands','[]'))),
      jsonb_build_object('ai_category',b.draft_result->>'category','ai_model',b.draft_result->>'model','ai_provider',b.draft_result->>'provider')) RETURNING id INTO entry;
  FOR m IN SELECT * FROM public.carnet_ingest_media WHERE batch_id=p_batch AND origin='capture' ORDER BY position LOOP
    image=NULL;
    IF m.type='image' THEN
      INSERT INTO public.photo_images(photo_id,image_url,position) VALUES(entry,'',idx) RETURNING id INTO image;
      idx=idx+1;
    END IF;
    UPDATE public.carnet_ingest_media SET photo_id=entry,photo_image_id=image WHERE item_id=m.item_id;
  END LOOP;
  UPDATE public.carnet_ingest_batches SET carnet_entry_id=entry,original_entry_id=entry,status='created',stage='commit',
    cover_media_id=(SELECT item_id FROM public.carnet_ingest_media WHERE batch_id=p_batch AND type='image' ORDER BY position LIMIT 1),
    attempt_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE batch_id=p_batch;
  RETURN entry;
END $$;

CREATE FUNCTION public.carnet_ingest_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(current_setting('role',true),'') NOT IN ('service_role','none','') AND EXISTS(SELECT 1 FROM public.carnet_ingest_batches WHERE carnet_entry_id=OLD.id) THEN RAISE EXCEPTION 'private_media_requires_backend'; END IF;
  UPDATE public.carnet_ingest_batches SET status='deleted',carnet_entry_id=NULL,updated_at=now() WHERE carnet_entry_id=OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER carnet_ingest_deleted BEFORE DELETE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.carnet_ingest_deleted();

CREATE FUNCTION public.carnet_private_media_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent uuid;
BEGIN
  IF coalesce(current_setting('role',true),'') IN ('service_role','none','') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='photos' THEN
    IF EXISTS(SELECT 1 FROM public.carnet_ingest_batches WHERE carnet_entry_id=OLD.id)
      AND (NEW.published IS DISTINCT FROM OLD.published OR NEW.image_url IS DISTINCT FROM OLD.image_url OR NEW.source IS DISTINCT FROM OLD.source) THEN
      RAISE EXCEPTION 'private_media_requires_backend';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN parent=OLD.photo_id; ELSE parent=NEW.photo_id; END IF;
  IF EXISTS(SELECT 1 FROM public.carnet_ingest_batches WHERE carnet_entry_id=parent)
    OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.carnet_ingest_batches WHERE carnet_entry_id=OLD.photo_id)) THEN
    RAISE EXCEPTION 'private_media_requires_backend';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER carnet_private_photo_guard BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.carnet_private_media_guard();
CREATE TRIGGER carnet_private_image_guard BEFORE INSERT OR UPDATE OR DELETE ON public.photo_images FOR EACH ROW EXECUTE FUNCTION public.carnet_private_media_guard();

REVOKE ALL ON FUNCTION public.carnet_require_admin(uuid), public.mobile_carnet_prepare(uuid,uuid,jsonb,text), public.mobile_carnet_claim(uuid,uuid,uuid,jsonb), public.mobile_carnet_checkpoint(uuid,uuid,uuid,jsonb,uuid,jsonb), public.mobile_carnet_commit(uuid,uuid,uuid), public.carnet_ingest_deleted(), public.carnet_private_media_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.carnet_require_admin(uuid), public.mobile_carnet_prepare(uuid,uuid,jsonb,text), public.mobile_carnet_claim(uuid,uuid,uuid,jsonb), public.mobile_carnet_checkpoint(uuid,uuid,uuid,jsonb,uuid,jsonb), public.mobile_carnet_commit(uuid,uuid,uuid) TO service_role;
