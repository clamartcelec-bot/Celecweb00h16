import { createHash, randomUUID } from 'node:crypto';
import { validateManifest, verifyContainer, type Manifest } from '../supabase/functions/_shared/carnetManifest.ts';

interface Json {
  [key:string]:unknown;
  success?:boolean; api_version?:number; code?:string; message?:string; error?:string;
  batch_id?:string; carnet_entry_id?:string; original_entry_id?:string; status?:string;
  retryable?:boolean; retry_after_seconds?:number; stale_attempt?:boolean;
  user?:{id:string}; video_processing?:string; requires_location?:boolean;
  uploads?:Array<{item_id:string;path:string;signed_url:string}>;
  images?:Array<{item_id:string;photo_image_id:string;url:string}>;
  media?:Array<{item_id:string;type:string;position:number;analysis:string}>;
  voice_transcript?:string|null; ai_summary?:string|null; source?:string; published?:boolean;
  raw_data?:{ai_provider?:string}; image_url?:string; position?:number;
}
export interface Fixture { bytes: Uint8Array; type: 'image'|'audio'|'video'; mime_type: string; duration_ms?: number }
export interface Journal {
  version: 1; project_origin: string; batch_id: string; manifest: Manifest;
  owner_id?: string; entry_id?: string; paths?: Record<string,string>; deleted?: boolean;
}
export interface RecipeConfig {
  origin: string; publicKey: string; adminToken: string; clientToken?: string;
  mode: 'live'|'local_simulation'; publication: boolean;
}
export interface Report {
  mode: RecipeConfig['mode']; started_at: string; finished_at?: string; batch_id: string; entry_id?: string;
  success: boolean; checks: Array<{name:string;status:'passed'|'failed'|'skipped';code?:string}>;
  cleanup: {entry_deleted:boolean;private_originals:'retained';public_cleanup_confirmed:boolean};
  pending: string[];
}
export class CheckError extends Error { constructor(public code:string){super(code);} }
function ensure(value:unknown,code:string):asserts value { if(!value)throw new CheckError(code); }
function hash(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
function userToken(value:string) {
  try {const p=JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString('utf8'));return p.role==='authenticated'&&p.sub&&p.exp>Date.now()/1000;}
  catch{return false;}
}
export function validateConfig(config:RecipeConfig) {
  const u=new URL(config.origin);
  ensure(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/', 'project_url_invalid');
  ensure(u.protocol==='https:'||(config.mode==='local_simulation'&&u.protocol==='http:'&&u.hostname==='127.0.0.1'),'https_required');
  let legacyPublic=false;try{legacyPublic=JSON.parse(Buffer.from(config.publicKey.split('.')[1],'base64url').toString('utf8')).role==='anon';}catch{/* modern key */}
  ensure(config.publicKey.startsWith('sb_publishable_')||legacyPublic,'public_key_required');
  ensure(!config.publicKey.startsWith('sb_secret_'),'server_key_forbidden');
  ensure(userToken(config.adminToken),'admin_user_session_required');
  if(config.clientToken)ensure(userToken(config.clientToken),'client_user_session_required');
}
export function createJournal(origin:string,fixtures:Fixture[],text='RECETTE CELEC — contenu fictif de validation, à supprimer.'):Journal {
  const batch_id=randomUUID();
  const manifest=validateManifest({api_version:1,batch_id,text,items:fixtures.map((f,position)=>({
    item_id:randomUUID(),type:f.type,position,mime_type:f.mime_type,byte_size:f.bytes.byteLength,sha256:hash(f.bytes),
    ...(f.duration_ms===undefined?{}:{duration_ms:f.duration_ms}),
  }))});
  return {version:1,project_origin:new URL(origin).origin,batch_id,manifest};
}

/** Operator-run HTTP recipe. No SQL, service key or schema writes. Only its new UUID is changed. */
export async function runNetworkRecipe(config:RecipeConfig,fixtures:Fixture[],journal:Journal,options:{
  fetcher?:typeof fetch; save:(j:Journal)=>Promise<void>; wait?:(ms:number)=>Promise<void>;
}):Promise<Report> {
  validateConfig(config);
  const report:Report={mode:config.mode,started_at:new Date().toISOString(),batch_id:journal.batch_id,success:false,checks:[],
    cleanup:{entry_deleted:false,private_originals:'retained',public_cleanup_confirmed:false},pending:[]};
  let step='local_inputs'; let authenticated=false; let safeReceipt=Boolean(journal.entry_id); let cleanupAllowed=false;
  const fetcher=options.fetcher||fetch;
  const wait=options.wait||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const passed=(name:string)=>report.checks.push({name,status:'passed'});
  const skipped=(name:string,code:string)=>report.checks.push({name,status:'skipped',code});
  const request=async(path:string,init:RequestInit={},token?:string,publicKey=true,timeout=20000)=>{
    ensure(path.startsWith('/')&&!path.startsWith('//'),'request_path_invalid');
    const headers=new Headers(init.headers);
    if(publicKey)headers.set('apikey',config.publicKey);
    if(token)headers.set('authorization',`Bearer ${token}`);
    try{return await fetcher(`${config.origin}${path}`,{...init,headers,redirect:'error',signal:AbortSignal.timeout(timeout)});}
    catch{throw new CheckError('network_interrupted');}
  };
  const json=async(response:Response)=>{try{return await response.json() as Json;}catch{throw new CheckError('non_json_response');}};
  const api=async(endpoint:string,body:Json,token=config.adminToken)=>{
    const response=await request(`/functions/v1/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},token,true,endpoint==='mobile-carnet'&&body.action==='finalize'?110000:20000);
    return {response,data:await json(response)};
  };
  const mobile=async(body:Json,token=config.adminToken)=>{
    const result=await api('mobile-carnet',{api_version:1,...body},token);
    if(!result.response.ok)throw new CheckError(result.response.status===401&&result.data.api_version!==1?'gateway_401_before_handler':safeCode(result.data.code));
    ensure(result.data.api_version===1,'api_version_mismatch');return result.data;
  };
  const media=async(action:string,item_id?:string)=>{
    const result=await api('carnet-media',{action,entry_id:journal.entry_id,...(item_id?{item_id}:{})});
    ensure(result.response.ok&&result.data.success===true,result.data.code==='cleanup_pending'?'cleanup_pending':safeCode(result.data.code));
    return result.data;
  };
  const rows=async(table:'photos'|'photo_images',token?:string)=>{
    const field=table==='photos'?'id':'photo_id';
    const columns=table==='photos'?'id,published,source,image_url,voice_transcript,ai_summary,raw_data':'id,image_url,position';
    const response=await request(`/rest/v1/${table}?select=${columns}&${field}=eq.${journal.entry_id}${table==='photo_images'?'&order=position.asc':''}`,{},token);
    ensure(response.ok,'post_read_failed');const value=await json(response);ensure(Array.isArray(value),'post_read_invalid');return value as Json[];
  };
  const signed=async(value:unknown,prefix:string)=>{
    ensure(typeof value==='string','storage_url_missing');const u=new URL(value);
    ensure(u.origin===config.origin&&u.pathname.startsWith(prefix)&&!u.username&&!u.password,'storage_url_invalid');
    return request(`${u.pathname}${u.search}`,{},undefined,false);
  };
  const inspectReceipt=(state:Json)=>{
    ensure(state.success===true&&state.api_version===1&&state.batch_id===journal.batch_id&&state.status==='created'&&typeof state.carnet_entry_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.carnet_entry_id),'receipt_invalid');
    ensure(!journal.entry_id||journal.entry_id===state.carnet_entry_id,'receipt_changed');return state.carnet_entry_id as string;
  };
  const gone=async(url:string)=>{
    const u=new URL(url);ensure(u.origin===config.origin&&u.pathname.startsWith('/storage/v1/object/public/photos/'),'public_url_invalid');
    for(let i=0;i<4;i++){
      const response=await request(`${u.pathname}?carnet_check=${randomUUID()}`,{},undefined,false);
      if([400,403,404,410].includes(response.status))return;
      ensure(response.ok,'public_cleanup_probe_failed');await wait(2000);
    }
    throw new CheckError('public_cleanup_or_cache_pending');
  };
  try {
    ensure(journal.version===1&&journal.project_origin===config.origin,'journal_project_or_state_invalid');
    const manifest=validateManifest({...journal.manifest});ensure(manifest.batch_id===journal.batch_id,'journal_batch_invalid');
    ensure(fixtures.length===manifest.items.length,'fixtures_changed');
    for(let i=0;i<fixtures.length;i++){
      const f=fixtures[i],m=manifest.items[i];
      ensure(f.type===m.type&&f.mime_type===m.mime_type&&f.bytes.byteLength===m.byte_size&&hash(f.bytes)===m.sha256,'fixtures_changed');
      ensure(verifyContainer(f.bytes,f.mime_type),'fixture_container_invalid');
    }
    ensure(fixtures.filter(f=>f.type==='image').length===2&&fixtures.filter(f=>f.type==='audio').length===2&&fixtures.filter(f=>f.type==='video').length===1,'mixed_fixture_required');
    passed(step);
    step='cors_preflight';
    const cors=await request('/functions/v1/mobile-carnet',{method:'OPTIONS',headers:{origin:'https://carnet-test.invalid','access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type'}});
    ensure(cors.ok&&/POST/i.test(cors.headers.get('access-control-allow-methods')||'')&&/authorization/i.test(cors.headers.get('access-control-allow-headers')||''),'cors_unavailable');passed(step);
    step='anonymous_refused';
    for(const endpoint of ['mobile-carnet','carnet-media']) {
      const result=await api(endpoint,endpoint==='mobile-carnet'?{api_version:1,action:'capabilities'}:{action:'preview',entry_id:randomUUID()},'');
      ensure(result.response.status===401,'anonymous_not_refused');
      ensure(result.data.api_version===1&&result.data.code==='unauthorized','gateway_401_before_handler');
    }passed(step);
    step='expired_session_refused';
    const rejected=await api('mobile-carnet',{api_version:1,action:'capabilities'},'invalid-user-session');
    ensure(rejected.response.status===401&&rejected.data.api_version===1&&rejected.data.code==='unauthorized','expired_session_not_structured');passed(step);
    if(config.clientToken){
      step='client_refused';
      for(const endpoint of ['mobile-carnet','carnet-media']){
        const result=await api(endpoint,endpoint==='mobile-carnet'?{api_version:1,action:'capabilities'}:{action:'preview',entry_id:randomUUID()},config.clientToken);
        ensure(result.response.status===403&&result.data.code==='forbidden','client_not_refused');
      }passed(step);
    }else{skipped('client_refused','client_session_missing');report.pending.push('client_session_missing');}
    step='admin_capabilities';
    const capabilities=await mobile({action:'capabilities'});
    ensure(capabilities.success===true&&typeof capabilities.user?.id==='string'&&capabilities.video_processing==='stored_only'&&capabilities.requires_location===false,'capabilities_incompatible');
    ensure(!journal.owner_id||journal.owner_id===capabilities.user.id,'journal_account_changed');
    journal.owner_id=capabilities.user.id;authenticated=true;await options.save(journal);passed(step);
    if(journal.entry_id){
      step='resume_saved_receipt';
      const saved=await api('mobile-carnet',{api_version:1,...journal.manifest,action:'prepare'});
      if(saved.response.status===410){
        ensure(saved.data.batch_id===journal.batch_id&&saved.data.original_entry_id===journal.entry_id,'saved_tombstone_invalid');
        journal.deleted=true;cleanupAllowed=true;report.entry_id=journal.entry_id;await options.save(journal);
        passed(step);return report; // Finally retries deletion/cleanup of this confirmed tombstone only.
      }
      ensure(!journal.deleted,'saved_tombstone_missing');
    }
    step='signed_uploads';
    let state=await mobile({...journal.manifest,action:'prepare'});
    journal.paths||={};
    for(let cycle=0;cycle<50&&state.status!=='created';cycle++){
      if(state.uploads){
        ensure(Array.isArray(state.uploads),'upload_list_invalid');
        for(const target of state.uploads){
          const index=manifest.items.findIndex(m=>m.item_id===target.item_id);ensure(index>=0,'upload_item_unknown');
          const u=new URL(target.signed_url);ensure(u.origin===config.origin&&u.pathname.startsWith('/storage/v1/object/upload/sign/carnet-ingest/'),'upload_url_invalid');
          ensure(typeof target.path==='string'&&u.pathname===`/storage/v1/object/upload/sign/carnet-ingest/${target.path}`,'upload_path_invalid');
          journal.paths[target.item_id]=target.path;await options.save(journal);
          const uploaded=await request(`${u.pathname}${u.search}`,{method:'PUT',headers:{'content-type':fixtures[index].mime_type,'x-upsert':'false'},body:Buffer.from(fixtures[index].bytes)},undefined,false,120000);
          if(!uploaded.ok){
            const duplicate=await json(uploaded);ensure([400,409].includes(uploaded.status)&&/duplicate|already exists/i.test(String(duplicate.message||duplicate.error||'')),'upload_failed');
          }
        }
      }
      step='processing_and_receipt';
      if(state.uploads||state.status==='uploading'||state.status==='uploaded'||state.stale_attempt||state.status==='failed'&&state.retryable){
        const finished=await mobile({action:'finalize',batch_id:journal.batch_id});
        // Deliberately discard the first completed response: resolve it again with the same UUID.
        if(finished.status==='created')state=await mobile({action:'status',batch_id:journal.batch_id});else state=finished;
      }else{
        await wait(Math.min(30,Math.max(3,Number(state.retry_after_seconds)||3))*1000);
        state=await mobile({action:'status',batch_id:journal.batch_id});
      }
      if(state.status==='failed'&&!state.retryable)throw new CheckError('processing_not_retryable');
      if(state.status==='uploading'||state.status==='failed')state=await mobile({...manifest,action:'prepare'});
    }
    journal.entry_id=inspectReceipt(state);safeReceipt=true;report.entry_id=journal.entry_id;await options.save(journal);
    passed('signed_uploads');passed('processing_and_receipt');
    step='same_uuid_receipt_replay';
    ensure(inspectReceipt(await mobile({...manifest,action:'prepare'}))===journal.entry_id,'duplicate_receipt');passed(step);
    step='private_draft_and_real_ai';
    const posts=await rows('photos',config.adminToken);
    ensure(posts.length===1&&posts[0].source==='mobile_app','receipt_post_invalid');cleanupAllowed=true;
    ensure(posts[0].published===false&&posts[0].image_url===''&&posts[0].voice_transcript===null,'draft_not_private');
    const preview=await media('preview');
    ensure(typeof preview.voice_transcript==='string'&&preview.voice_transcript.trim().length>0,'transcription_absent');
    ensure(typeof posts[0].ai_summary==='string'&&posts[0].ai_summary.trim().length>0&&typeof posts[0].raw_data?.ai_provider==='string'&&['openai','minimax'].includes(posts[0].raw_data.ai_provider),'analysis_absent');
    ensure(preview.media?.length===manifest.items.length&&preview.media.every((m,i)=>m.item_id===manifest.items[i].item_id&&m.type===manifest.items[i].type&&m.position===i),'media_order_invalid');
    ensure(preview.media.filter((m)=>m.type==='video').every((m)=>m.analysis==='stored_only'),'video_analyzed');
    ensure(preview.media.filter((m)=>m.type==='audio').every((m)=>m.analysis==='processed'),'voice_not_transcribed');
    const images=manifest.items.filter(m=>m.type==='image');
    ensure(preview.images?.length===2&&preview.images.every((m,i)=>m.item_id===images[i].item_id),'image_order_invalid');
    passed(step);
    step='signed_downloads_and_private_bucket';
    for(const image of preview.images){
      const index=manifest.items.findIndex(m=>m.item_id===image.item_id);
      const response=await signed(image.url,'/storage/v1/object/sign/carnet-ingest/');
      ensure(response.ok&&hash(new Uint8Array(await response.arrayBuffer()))===manifest.items[index].sha256,'signed_download_mismatch');
    }
    for(const path of Object.values(journal.paths)){
      const response=await request(`/storage/v1/object/public/carnet-ingest/${path}`,{},undefined,false);
      ensure([400,403,404].includes(response.status),'private_original_public');
    }
    const drafts=await rows('photos');const gallery=await rows('photo_images');
    ensure(drafts.length===0&&gallery.length===0,'draft_visible_anonymously');
    if(config.clientToken)ensure((await rows('photos',config.clientToken)).length===0&&(await rows('photo_images',config.clientToken)).length===0,'draft_visible_to_client');
    passed(step);
    if(config.publication){
      step='publication_real_storage_copy';await media('publish');
      const published=await rows('photos');const publicImages=await rows('photo_images');
      ensure(published.length===1&&published[0].published===true&&publicImages.length===2,'publication_invalid');
      for(let i=0;i<publicImages.length;i++){
        ensure(publicImages[i].position===i,'public_image_order_invalid');
        const response=await signed(publicImages[i].image_url,'/storage/v1/object/public/photos/');
        ensure(response.ok&&hash(new Uint8Array(await response.arrayBuffer()))===images[i].sha256,'public_copy_mismatch');
      }passed(step);
      step='cover_and_image_removal';await media('set_cover',images[1].item_id);
      ensure((await rows('photos'))[0]?.image_url===publicImages[1].image_url,'cover_invalid');
      await media('remove_image',images[0].item_id);ensure((await rows('photo_images')).length===1,'image_not_removed');await gone(String(publicImages[0].image_url));passed(step);
      step='unpublish_and_public_cleanup';await media('unpublish');
      ensure((await rows('photos')).length===0&&(await rows('photo_images')).length===0,'unpublish_invalid');await gone(String(publicImages[1].image_url));passed(step);
    }else{skipped('publication_real_storage_copy','publication_not_requested');report.pending.push('publication_not_requested');}
  } catch(error) {
    report.checks.push({name:step,status:'failed',code:error instanceof CheckError?error.code:'local_recipe_error'});
  } finally {
    if(authenticated&&safeReceipt&&cleanupAllowed){
      try {
        await media('delete_entry');journal.deleted=true;await options.save(journal);report.cleanup.entry_deleted=true;
        await media('cleanup');report.cleanup.public_cleanup_confirmed=true;
        const tombstone=await api('mobile-carnet',{api_version:1,...journal.manifest,action:'prepare'});
        ensure(tombstone.response.status===410&&tombstone.data.batch_id===journal.batch_id&&tombstone.data.original_entry_id===journal.entry_id,'deleted_uuid_recreated');
        passed('delete_and_tombstone');
      }catch(error){report.checks.push({name:'delete_and_tombstone',status:'failed',code:error instanceof CheckError?error.code:'cleanup_failed'});report.pending.push('cleanup_test_entry');}
    } else if(safeReceipt&&authenticated){report.pending.push('inspect_receipt_before_cleanup');}
    else if(authenticated){report.pending.push('resume_same_journal');}
    report.pending.push('private_originals_retained_for_bolt_cleanup','android_device_tests');
    report.finished_at=new Date().toISOString();report.success=!report.checks.some(c=>c.status==='failed');
  }
  return report;
}
function safeCode(value:unknown) {
  const allowed=['unauthorized','forbidden','configuration_missing','service_unavailable','database_unavailable','storage_unavailable',
    'not_found','manifest_conflict','entry_deleted','quota_exceeded','rate_limited','processing_busy','publication_busy','attempt_lost',
    'incomplete_batch','media_missing','media_hash_mismatch','media_type_mismatch','media_size_mismatch','media_invalid','transcription_unavailable',
    'analysis_unavailable','settings_unavailable','publication_copy_failed','cleanup_pending'];
  return typeof value==='string'&&allowed.includes(value)?value:'remote_operation_failed';
}
