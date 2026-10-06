import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createJournal, runNetworkRecipe, type Fixture, type RecipeConfig, type Journal } from '../../scripts/carnet-network-core.ts';

import type { Manifest } from '../../supabase/functions/_shared/carnetManifest.ts';

const actor='11111111-1111-4111-8111-111111111111';
const client='22222222-2222-4222-8222-222222222222';
const token=(sub:string)=>`fake.${Buffer.from(JSON.stringify({sub,role:'authenticated',exp:Date.now()/1000+3600})).toString('base64url')}.signature`;
function box(type:string,payload:Buffer){const header=Buffer.alloc(8);header.writeUInt32BE(payload.length+8);header.write(type,4);return Buffer.concat([header,payload]);}
function mp4(handler:string){const h=Buffer.alloc(12);h.write(handler,8);return Buffer.concat([box('ftyp',Buffer.from('isom0000isom')),box('moov',box('trak',box('mdia',box('hdlr',h))))]);}
const fixtures:Fixture[]=[
  {type:'image',mime_type:'image/jpeg',bytes:Buffer.from([255,216,255,1,255,217])},
  {type:'audio',mime_type:'audio/mp4',bytes:mp4('soun')},
  {type:'image',mime_type:'image/jpeg',bytes:Buffer.from([255,216,255,2,255,217])},
  {type:'video',mime_type:'video/mp4',bytes:mp4('vide')},
  {type:'audio',mime_type:'audio/mp4',bytes:mp4('soun')},
];
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');

async function simulation(options:{interruptUpload?:boolean;foreignPreview?:boolean;badReceipt?:boolean;missingTranscript?:boolean;failDeletion?:boolean;failCleanupOnce?:boolean}={}) {
  let origin='';const entry=randomUUID();const objects=new Map<string,Buffer>();const publicObjects=new Map<string,Buffer>();
  let manifest:Manifest|undefined;let phase='uploading';let published=false;let cover='';let uploads=0;let finalizes=0;let cleanupCalls=0;
  const calls:Array<{path:string;body:Record<string,unknown>|null}>=[];const prepareIds:string[]=[];
  const imageIds=()=>manifest!.items.filter((m)=>m.type==='image').map((m)=>m.item_id);
  const removed=new Set<string>();
  const gallery=()=>imageIds().filter((id:string)=>!removed.has(id)).map((id:string,position:number)=>({id,position,image_url:published?`${origin}/storage/v1/object/public/photos/${id}.jpg`:''}));
  const receipt=()=>({success:true,api_version:1,batch_id:options.badReceipt?randomUUID():manifest!.batch_id,status:'created',carnet_entry_id:entry});
  const server=createServer(async(req,res)=>{
    try{
      const u=new URL(req.url!,origin);const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
      const reply=(value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,apikey,content-type'});res.end(JSON.stringify(value));};
      const data:(Manifest & {action:string;item_id:string})|null=req.headers['content-type']==='application/json'&&bytes.length?JSON.parse(bytes.toString()):null;
      calls.push({path:u.pathname,body:data?{...data}:null});
      if(req.method==='OPTIONS'){reply(null);return;}
      if(u.pathname.startsWith('/storage/v1/object/upload/sign/carnet-ingest/')){
        const path=u.pathname.split('/carnet-ingest/')[1];uploads++;
        if(objects.has(path)){reply({message:'The resource already exists'},409);return;}
        objects.set(path,bytes);
        if(options.interruptUpload&&uploads===1){req.socket.destroy();return;}
        reply({Key:path});return;
      }
      if(u.pathname.startsWith('/storage/v1/object/sign/carnet-ingest/')){
        const value=objects.get(u.pathname.split('/carnet-ingest/')[1]);if(!value){reply({},404);return;}res.end(value);return;
      }
      if(u.pathname.startsWith('/storage/v1/object/public/carnet-ingest/')){reply({},404);return;}
      if(u.pathname.startsWith('/storage/v1/object/public/photos/')){const value=publicObjects.get(u.pathname.split('/photos/')[1]);if(!value){reply({},404);return;}res.end(value);return;}
      const bearer=req.headers.authorization?.slice(7);
      // Stable tokens are assigned below; don't recreate an exp timestamp on each request.
      const role=bearer===config.adminToken?'admin':bearer===config.clientToken?'client':null;
      if(u.pathname.startsWith('/rest/v1/')){
        const visible=manifest&&phase!=='deleted'&&(role==='admin'||published);
        if(u.pathname.endsWith('/photos'))reply(visible?[{id:entry,published,source:'mobile_app',image_url:cover,voice_transcript:null,ai_summary:'Test summary',raw_data:{ai_provider:'openai',ai_model:'simulation'}}]:[]);
        else reply(visible?gallery():[]);return;
      }
      if(!role){reply({success:false,api_version:1,code:'unauthorized'},401);return;}
      if(role==='client'){reply({success:false,api_version:1,code:'forbidden'},403);return;}
      if(!data){reply({},400);return;}
      if(u.pathname.endsWith('/mobile-carnet')){
        if(data.action==='capabilities'){reply({success:true,api_version:1,user:{id:actor,name:'Simulation'},requires_location:false,video_processing:'stored_only'});return;}
        if(data.action==='prepare'){
          prepareIds.push(data.batch_id);
          if(phase==='deleted'){reply({success:false,api_version:1,batch_id:manifest!.batch_id,status:'deleted',original_entry_id:entry,code:'entry_deleted'},410);return;}
          if(phase==='created'){reply(receipt());return;}
          if(manifest)assert.deepEqual(data.items,manifest!.items);else manifest=data;
          reply({success:false,api_version:1,batch_id:manifest!.batch_id,status:'uploading',uploads:manifest!.items.map((m)=>({item_id:m.item_id,path:m.item_id,signed_url:`${origin}/storage/v1/object/upload/sign/carnet-ingest/${m.item_id}?token=private-signed-token`}))});return;
        }
        if(data.action==='finalize'){
          for(const m of manifest!.items){assert.equal(hash(objects.get(m.item_id)!),m.sha256);}
          finalizes++;
          if(finalizes===1){phase='uploaded';reply({api_version:1,success:false,status:'uploaded',retry_after_seconds:3},202);return;}
          phase='created';reply(receipt());return;
        }
        if(data.action==='status'){reply(phase==='created'?receipt():{api_version:1,success:false,status:phase});return;}
      }
      if(u.pathname.endsWith('/carnet-media')){
        if(data.action==='preview'){
          reply({success:true,voice_transcript:options.missingTranscript?null:'Vocal un.\nVocal deux.',diagnostics:{raw:'private-provider-payload'},
            images:gallery().map((m,i)=>({photo_image_id:m.id,item_id:m.id,is_cover:i===0,url:options.foreignPreview?'https://foreign.invalid/private':`${origin}/storage/v1/object/sign/carnet-ingest/${m.id}?token=private-signed-token`})),
            media:manifest!.items.map((m)=>({item_id:m.item_id,type:m.type,position:m.position,analysis:m.type==='video'?'stored_only':'processed'}))});return;
        }
        if(data.action==='publish'){published=true;for(const id of imageIds())publicObjects.set(`${id}.jpg`,objects.get(id)!);cover=gallery()[0].image_url;}
        if(data.action==='set_cover')cover=gallery().find((m)=>m.id===data.item_id)!.image_url;
        if(data.action==='remove_image'){removed.add(data.item_id);publicObjects.delete(`${data.item_id}.jpg`);}
        if(data.action==='unpublish'){published=false;cover='';publicObjects.clear();}
        if(data.action==='delete_entry'){
          if(options.failDeletion){reply({success:false,code:'cleanup_pending'},503);return;}
          phase='deleted';published=false;publicObjects.clear();
        }
        if(data.action==='cleanup'&&options.failCleanupOnce&&cleanupCalls++===0){reply({success:false,code:'cleanup_pending'},503);return;}
        reply({success:true,entry_id:entry});return;
      }
      reply({},404);
    }catch{res.writeHead(500);res.end('{}');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const config:RecipeConfig={origin,publicKey:'sb_publishable_simulation',adminToken:token(actor),clientToken:token(client),mode:'local_simulation',publication:true};
  return {config,calls,prepareIds,objects,entry,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

test('Network recipe: real loopback HTTP uploads, 202, receipt replay, privacy, publication and cleanup',async()=>{
  const s=await simulation();try{
    const journal=createJournal(s.config.origin,fixtures);const snapshots:Journal[]=[];
    const report=await runNetworkRecipe(s.config,fixtures,journal,{save:async j=>{snapshots.push(structuredClone(j));},wait:async()=>{}});
    assert.equal(report.success,true,JSON.stringify(report));assert.equal(report.cleanup.entry_deleted,true);assert.equal(report.cleanup.public_cleanup_confirmed,true);
    assert.ok(report.checks.some(c=>c.name==='publication_real_storage_copy'&&c.status==='passed'));
    assert.ok(snapshots.some(j=>j.entry_id===s.entry));assert.equal(new Set(s.prepareIds).size,1);assert.equal(s.objects.size,5);
    const serialized=JSON.stringify({report,journal});for(const secret of [s.config.adminToken,s.config.clientToken!,'private-signed-token','private-provider-payload','Vocal un.'])assert.ok(!serialized.includes(secret));
  }finally{await s.close();}
});
test('Network recipe: dropped upload response resumes the same UUID and accepts immutable duplicate only provisionally',async()=>{
  const s=await simulation({interruptUpload:true});try{
    const journal=createJournal(s.config.origin,fixtures);const original=journal.batch_id;
    const first=await runNetworkRecipe(s.config,fixtures,journal,{save:async()=>{},wait:async()=>{}});
    assert.equal(first.success,false);assert.ok(first.pending.includes('resume_same_journal'));assert.equal(s.objects.size,1);assert.equal(journal.entry_id,undefined);
    const second=await runNetworkRecipe(s.config,fixtures,journal,{save:async()=>{},wait:async()=>{}});
    assert.equal(second.success,true,JSON.stringify(second));assert.equal(journal.batch_id,original);assert.ok(s.prepareIds.every(id=>id===original));
  }finally{await s.close();}
});
test('Network recipe: altered local files are refused before any HTTP request',async()=>{
  const s=await simulation();try{
    const journal=createJournal(s.config.origin,fixtures);const changed=fixtures.map(f=>({...f,bytes:Buffer.from(f.bytes)}));changed[0].bytes[3]=99;
    const report=await runNetworkRecipe(s.config,changed,journal,{save:async()=>{}});
    assert.equal(report.success,false);assert.equal(report.checks[0].code,'fixtures_changed');assert.equal(s.calls.length,0);
  }finally{await s.close();}
});
test('Network recipe: foreign signed URLs are never fetched and only the new test entry is cleaned',async()=>{
  const s=await simulation({foreignPreview:true});try{
    const report=await runNetworkRecipe(s.config,fixtures,createJournal(s.config.origin,fixtures),{save:async()=>{},wait:async()=>{},fetcher:async(input,init)=>{
      assert.equal(new URL(String(input)).origin,s.config.origin);return fetch(input,init);
    }});
    assert.equal(report.success,false);assert.ok(report.checks.some(c=>c.code==='storage_url_invalid'));assert.equal(report.cleanup.entry_deleted,true);
  }finally{await s.close();}
});
test('Network recipe: receipt for another batch authorizes neither assignment nor deletion',async()=>{
  const s=await simulation({badReceipt:true});try{
    const journal=createJournal(s.config.origin,fixtures);const report=await runNetworkRecipe(s.config,fixtures,journal,{save:async()=>{},wait:async()=>{}});
    assert.equal(report.success,false);assert.ok(report.checks.some(c=>c.code==='receipt_invalid'));assert.equal(journal.entry_id,undefined);assert.ok(!s.calls.some(c=>c.body?.action==='delete_entry'));
  }finally{await s.close();}
});
test('Network recipe: real transcription is required, and cleanup failure stays explicit',async()=>{
  for(const failure of [{missingTranscript:true},{failDeletion:true}]){
    const s=await simulation(failure);try{
      const report=await runNetworkRecipe(s.config,fixtures,createJournal(s.config.origin,fixtures),{save:async()=>{},wait:async()=>{}});
      assert.equal(report.success,false);assert.ok(report.checks.some(c=>c.code===('missingTranscript' in failure?'transcription_absent':'cleanup_pending')));
      if('failDeletion' in failure)assert.ok(report.pending.includes('cleanup_test_entry'));
    }finally{await s.close();}
  }
});
test('Network recipe CLI: no live flag performs no connection or file mutation',()=>{
  const result=spawnSync(process.execPath,['--import','tsx','scripts/carnet-network-check.ts'],{cwd:new URL('../..',import.meta.url),encoding:'utf8',env:{...process.env,CARNET_PROJECT_URL:'https://never-contact.invalid'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Sans --live, aucune requête/);
});
test('Network recipe: a cleanup failure after deletion resumes via the saved tombstone without recreating the entry',async()=>{
  const s=await simulation({failCleanupOnce:true});try{
    const journal=createJournal(s.config.origin,fixtures);const first=await runNetworkRecipe(s.config,fixtures,journal,{save:async()=>{},wait:async()=>{}});
    assert.equal(first.success,false);assert.equal(journal.deleted,true);assert.ok(first.pending.includes('cleanup_test_entry'));
    const second=await runNetworkRecipe(s.config,fixtures,journal,{save:async()=>{},wait:async()=>{}});
    assert.equal(second.success,true,JSON.stringify(second));assert.equal(second.cleanup.public_cleanup_confirmed,true);assert.equal(new Set(s.prepareIds).size,1);
    assert.equal(s.calls.filter(c=>c.body?.action==='publish').length,1);
  }finally{await s.close();}
});
test('Deployment: one config section per function and only one copy of each Carnet table migration',()=>{
  const root=new URL('../../',import.meta.url);const config=readFileSync(new URL('supabase/config.toml',root),'utf8');
  for(const name of ['mobile-carnet','carnet-media']){
    assert.equal(config.split(`[functions.${name}]`).length-1,1);assert.match(config,new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = false`));
  }
  const dir=new URL('supabase/migrations/',root);const migrations=readdirSync(dir).filter(name=>name.endsWith('.sql')).map(name=>readFileSync(new URL(name,dir),'utf8'));
  assert.equal(migrations.filter(text=>/^CREATE TABLE public.carnet_ingest_batches\s*\(/m.test(text)).length,1);
  assert.equal(migrations.filter(text=>/^CREATE TABLE public.carnet_ingest_media\s*\(/m.test(text)).length,1);
});
