import { ApiError, bodyJson, errorResponse, json, requireAdmin, rpc, uuid } from "../_shared/carnetHttp.ts";
import { sha256, validateManifest, verifyContainer } from "../_shared/carnetManifest.ts";

export async function handleMedia(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json(null);
  let release: (() => Promise<unknown>) | undefined;
  try {
    const body = await bodyJson(req);
    const { db, actor } = await requireAdmin(req);
    const entry = uuid(body.entry_id);
    const { data: batch, error } = await db.from("carnet_ingest_batches").select("*").eq("original_entry_id",entry).in("status",["created","deleted"]).maybeSingle();
    if (error) throw new ApiError("database_unavailable",503,true);
    if (!batch) throw new ApiError("not_found",404);
    if (batch.status==='deleted'&&!['cleanup','delete_entry'].includes(String(body.action))) throw new ApiError('entry_deleted',410);
    const { data: media, error: mediaError } = await db.from("carnet_ingest_media").select("*").eq("batch_id",batch.batch_id).order("position");
    if (mediaError || !media) throw new ApiError("database_unavailable",503,true);
    if (body.action === "preview") {
      const images = [];
      for (const m of media.filter(m => m.type === "image" && m.photo_image_id)) {
        const { data, error } = await db.storage.from("carnet-ingest").createSignedUrl(m.storage_path,300);
        if (error || !data) throw new ApiError("storage_unavailable",503,true);
        images.push({ photo_image_id:m.photo_image_id,item_id:m.item_id,url:data.signedUrl,is_cover:batch.cover_media_id===m.item_id });
      }
      return json({ success:true,images,voice_transcript:batch.voice_transcript,diagnostics:batch.draft_result?.diagnostics,
        media:media.filter(m=>m.origin==='capture').map(m=>({item_id:m.item_id,type:m.type,position:m.position,duration_ms:m.duration_ms,analysis:m.type==='video'?'stored_only':m.type==='audio'&&!m.transcript?'not_transcribed':'processed'})) });
    }
    if (body.action === "prepare_image") {
      const validated = validateManifest({ api_version:1,batch_id:batch.batch_id,text:'',items:[{...(body.item as object),position:0,type:'image'}] });
      const m = validated.items[0];
      const saved = await rpc<Record<string,unknown>>(db,"carnet_admin_prepare_image",{p_actor:actor,p_entry:entry,p_item:m.item_id,p_mime:m.mime_type,p_size:m.byte_size,p_hash:m.sha256});
      const { data,error } = await db.storage.from("carnet-ingest").createSignedUploadUrl(String(saved.storage_path),{upsert:false});
      if (error || !data) throw new ApiError("storage_unavailable",503,true);
      return json({success:true,item_id:saved.item_id,path:saved.storage_path,token:data.token,signed_url:data.signedUrl});
    }
    if (!['publish','unpublish','set_cover','remove_image','attach_image','delete_entry','cleanup'].includes(String(body.action))) throw new ApiError("invalid_action");
    const item = body.item_id ? uuid(body.item_id) : null;
    const attempt = crypto.randomUUID();
    await rpc(db,'carnet_media_lock',{p_actor:actor,p_entry:entry,p_attempt:attempt});
    release=()=>rpc(db,'carnet_media_finish',{p_actor:actor,p_entry:entry,p_attempt:attempt,p_action:'release'});
    const copyImage = async (m: typeof media[number]) => {
      const ext=m.mime_type==='image/png'?'png':'jpg';
      const path=`mobile-public/${entry}/${m.item_id}/${m.sha256}.${ext}`;
      // Track a possible orphan before Storage, which cannot share a Postgres transaction.
      const orphan={item_id:m.item_id,path,url:db.storage.from('photos').getPublicUrl(path).data.publicUrl,photo_image_id:m.photo_image_id};
      const tracked=[...(batch.cleanup_paths||[]).filter((x:{path:string})=>x.path!==path),orphan];
      const {error:trackError}=await db.from('carnet_ingest_batches').update({cleanup_paths:tracked}).eq('batch_id',batch.batch_id).eq('publication_attempt',attempt).select('batch_id').single();
      if(trackError) throw new ApiError('attempt_lost',409,true);
      batch.cleanup_paths=tracked;
      const {error:copyError}=await db.storage.from('carnet-ingest').copy(m.storage_path,path,{destinationBucket:'photos'});
      if(copyError){
        const {data,error:readError}=await db.storage.from('photos').download(path);
        if(readError||!data||data.size!==m.byte_size||await sha256(await data.arrayBuffer())!==m.sha256) throw new ApiError('publication_copy_failed',503,true);
      }
      return orphan;
    };
    let images: Array<Record<string,unknown>>=[];
    if(body.action==='publish') {
      for(const m of media.filter(m=>m.type==='image'&&m.photo_image_id)) images.push(await copyImage(m));
    }
    if(body.action==='attach_image') {
      const m=media.find(m=>m.item_id===item&&m.origin==='admin'); if(!m)throw new ApiError('not_found',404);
      const {data,error}=await db.storage.from('carnet-ingest').download(m.storage_path);
      if(error||!data)throw new ApiError('media_missing',409,true);
      const bytes=new Uint8Array(await data.arrayBuffer());
      if(bytes.length!==m.byte_size||!verifyContainer(bytes,m.mime_type)||await sha256(bytes)!==m.sha256)throw new ApiError('media_invalid',409,true);
      const {error:verifiedError}=await db.from('carnet_ingest_media').update({verified:true}).eq('item_id',m.item_id).eq('batch_id',batch.batch_id);
      if(verifiedError)throw new ApiError('database_unavailable',503,true);
      const {data:post,error:postError}=await db.from('photos').select('published').eq('id',entry).single();
      if(postError)throw new ApiError('database_unavailable',503,true);
      if(post.published)images=[await copyImage(m)];
    }
    const result=await rpc<{batch_id:string;cleanup_paths:Array<{path:string}>}>(db,'carnet_media_finish',{p_actor:actor,p_entry:entry,p_attempt:attempt,p_action:body.action,p_images:images,p_item:item});
    const {data:latest,error:latestError}=await db.from('carnet_ingest_batches').select('publication_paths,cleanup_paths').eq('batch_id',batch.batch_id).single();
    if(latestError)throw new ApiError('cleanup_pending',503,true);
    const livePaths=new Set((latest.publication_paths as Array<{path:string}>).map(x=>x.path));
    const cleanup=(latest.cleanup_paths as Array<{path:string}>).filter(x=>!livePaths.has(x.path));
    let pending=false;
    if(cleanup.length){const {error:removeError}=await db.storage.from('photos').remove([...new Set(cleanup.map(x=>x.path))]);pending=Boolean(removeError);}
    if(!pending){const {error:clearError}=await db.from('carnet_ingest_batches').update({cleanup_paths:[]}).eq('batch_id',batch.batch_id).eq('publication_attempt',attempt).select('batch_id').single();pending=Boolean(clearError);}
    await release(); release=undefined;
    return json({success:!pending,entry_id:entry,cleanup_pending:pending,...(pending?{code:'cleanup_pending',message:'Le changement est enregistré ; la suppression des anciennes copies publiques reste à reprendre.'}:{})},pending?503:200);
  } catch(e) { if(release){try{await release();}catch{/* Durable lease permits later recovery. */}}return errorResponse(e); }
}
