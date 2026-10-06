import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const actor = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
const batch = '33333333-3333-4333-8333-333333333333';
const item = '44444444-4444-4444-8444-444444444444';
const attempt = '55555555-5555-4555-8555-555555555555';
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),email text,full_name text,phone text,role text DEFAULT 'client',created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON profiles FOR SELECT TO authenticated USING(id=auth.uid());
    CREATE POLICY update_own_profile ON profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
    CREATE TABLE public.photos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,description text,author text,city text,lat float DEFAULT 0,lng float DEFAULT 0,published boolean DEFAULT true,image_url text DEFAULT '',source text,voice_transcript text,ai_summary text,detected_brands text[],raw_data jsonb);
    CREATE TABLE public.photo_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),photo_id uuid REFERENCES photos(id) ON DELETE CASCADE,image_url text NOT NULL,position integer);
    ALTER TABLE photos ENABLE ROW LEVEL SECURITY; ALTER TABLE photo_images ENABLE ROW LEVEL SECURITY;
    CREATE POLICY anon_select_photos ON photos FOR SELECT TO anon,authenticated USING(true);
    CREATE POLICY auth_insert_photos ON photos FOR INSERT TO authenticated WITH CHECK(true);
    CREATE POLICY auth_update_photos ON photos FOR UPDATE TO authenticated USING(true);
    CREATE POLICY auth_delete_photos ON photos FOR DELETE TO authenticated USING(true);
    CREATE POLICY admin_insert_photos ON photos FOR INSERT TO authenticated WITH CHECK(is_admin());
    CREATE POLICY admin_update_photos ON photos FOR UPDATE TO authenticated USING(is_admin()) WITH CHECK(is_admin());
    CREATE POLICY admin_delete_photos ON photos FOR DELETE TO authenticated USING(is_admin());
    CREATE POLICY public_select_photo_images ON photo_images FOR SELECT TO anon,authenticated USING(true);
    CREATE POLICY admin_insert_photo_images ON photo_images FOR INSERT TO authenticated WITH CHECK(is_admin());
    CREATE POLICY admin_update_photo_images ON photo_images FOR UPDATE TO authenticated USING(is_admin());
    CREATE POLICY admin_delete_photo_images ON photo_images FOR DELETE TO authenticated USING(is_admin());
    GRANT SELECT,INSERT,UPDATE,DELETE ON profiles,photos,photo_images TO authenticated;
    GRANT SELECT ON photos,photo_images TO anon;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    INSERT INTO auth.users VALUES('${actor}'),('${client}');
    INSERT INTO profiles(id,email,role) VALUES('${actor}','admin@test.invalid','admin'),('${client}','client@test.invalid','client');`);
  for (const name of ['20261006093935_20261006_harden_photos_profiles_photo_images.sql','20261006100000_mobile_carnet_ingestion.sql','20261006100100_mobile_carnet_media_admin.sql']) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  }
  return db;
}
const manifest = { api_version:1,batch_id:batch,text:'',items:[{item_id:item,type:'image',position:0,mime_type:'image/jpeg',byte_size:100,sha256:'a'.repeat(64)}] };
async function prepare(db: PGlite) { return db.query('SELECT mobile_carnet_prepare($1,$2,$3,$4)',[actor,batch,manifest,'b'.repeat(64)]); }
test('Database: role escalation and old permissive policies blocked, drafts private',async () => {
  const db=await database();
  await db.exec(`INSERT INTO photos(title,published) VALUES('draft',false),('public',true); SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${client}',false);`);
  await assert.rejects(db.exec(`UPDATE profiles SET role='admin' WHERE id='${client}'`),/permission denied/);
  await assert.rejects(db.exec(`INSERT INTO photos(title) VALUES('attack')`),/row-level security/);
  assert.equal((await db.query('SELECT title FROM photos')).rows.length,1);
  await db.exec('RESET ROLE; SET ROLE anon');
  assert.equal((await db.query('SELECT title FROM photos')).rows.length,1);
  await assert.rejects(db.query('SELECT * FROM carnet_ingest_batches'),/permission denied/);
  await db.exec('RESET ROLE'); await db.close();
});
test('Database: one entry, fenced attempts, immutable manifest, deletion tombstone',async () => {
  const db=await database(); await prepare(db); await prepare(db);
  assert.equal((await db.query('SELECT * FROM carnet_ingest_batches')).rows.length,1);
  await assert.rejects(db.query('SELECT mobile_carnet_prepare($1,$2,$3,$4)',[actor,batch,{...manifest,text:'changed'},'c'.repeat(64)]),/manifest_conflict/);
  await assert.rejects(db.query('SELECT mobile_carnet_prepare($1,$2,$3,$4)',[client,batch,manifest,'b'.repeat(64)]),/forbidden/);
  await db.query('SELECT mobile_carnet_claim($1,$2,$3,$4)',[actor,batch,attempt,{}]);
  await assert.rejects(db.query('SELECT mobile_carnet_commit($1,$2,$3)',[actor,batch,attempt]),/incomplete_batch/);
  const patch={draft_result:{title:'Tableau',description:'Pose',ai_summary:'Pose',brands:['Legrand'],category:'installation',model:'test',provider:'test'}};
  await db.query('SELECT mobile_carnet_checkpoint($1,$2,$3,$4,$5,$6)',[actor,batch,attempt,patch,item,{verified:true}]);
  await assert.rejects(db.query('SELECT mobile_carnet_commit($1,$2,$3)',[actor,batch,item]),/attempt_lost/);
  const a=await db.query<{id:string}>('SELECT mobile_carnet_commit($1,$2,$3) id',[actor,batch,attempt]);
  const b=await db.query<{id:string}>('SELECT mobile_carnet_commit($1,$2,$3) id',[actor,batch,item]);
  assert.equal(a.rows[0].id,b.rows[0].id);
  assert.equal((await db.query('SELECT * FROM photos')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM photo_images')).rows.length,1);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',false);`);
  await assert.rejects(db.exec(`UPDATE photos SET published=true WHERE id='${a.rows[0].id}'`),/private_media_requires_backend/);
  await db.exec('RESET ROLE'); await db.query('DELETE FROM photos WHERE id=$1',[a.rows[0].id]);
  const state=await db.query<{status:string}>('SELECT status FROM carnet_ingest_batches'); assert.equal(state.rows[0].status,'deleted');
  await assert.rejects(db.query('SELECT mobile_carnet_commit($1,$2,$3)',[actor,batch,attempt]),/entry_deleted/);
  await db.close();
});
test('Database: expired attempt cannot write; revoked admin cannot commit',async () => {
  const db=await database(); await prepare(db);
  await db.query('SELECT mobile_carnet_claim($1,$2,$3,$4)',[actor,batch,attempt,{}]);
  await db.exec("UPDATE carnet_ingest_batches SET lease_until=now()-interval '1 second'");
  await assert.rejects(db.query('SELECT mobile_carnet_checkpoint($1,$2,$3,$4)',[actor,batch,attempt,{}]),/attempt_lost/);
  await db.query('SELECT mobile_carnet_claim($1,$2,$3,$4)',[actor,batch,item,{}]);
  await assert.rejects(db.query('SELECT mobile_carnet_checkpoint($1,$2,$3,$4)',[actor,batch,attempt,{}]),/attempt_lost/);
  await db.exec(`UPDATE profiles SET role='client' WHERE id='${actor}'`);
  await assert.rejects(db.query('SELECT mobile_carnet_commit($1,$2,$3)',[actor,batch,item]),/forbidden/);
  await db.close();
});
async function created(db:PGlite){
 await prepare(db);await db.query('SELECT mobile_carnet_claim($1,$2,$3,$4)',[actor,batch,attempt,{}]);
 await db.query('SELECT mobile_carnet_checkpoint($1,$2,$3,$4,$5,$6)',[actor,batch,attempt,{draft_result:{title:'Test',description:'Test',ai_summary:null,brands:[]}},item,{verified:true}]);
 return (await db.query<{id:string}>('SELECT mobile_carnet_commit($1,$2,$3) id',[actor,batch,attempt])).rows[0].id;
}
test('Publication: serial lease, private unpublish, deletion cleanup remains recoverable',async()=>{
 const db=await database();const id=await created(db);
 const gallery=(await db.query<{id:string}>('SELECT id FROM photo_images')).rows[0].id;
 const paths=[{item_id:item,photo_image_id:gallery,path:'mobile-public/test/image.jpg',url:'https://test.invalid/public/image.jpg'}];
 await db.query('SELECT carnet_media_lock($1,$2,$3)',[actor,id,attempt]);
 await assert.rejects(db.query('SELECT carnet_media_lock($1,$2,$3)',[actor,id,item]),/publication_busy/);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4,$5)',[actor,id,attempt,'publish',paths]);
 assert.equal((await db.query<{published:boolean}>('SELECT published FROM photos')).rows[0].published,true);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4)',[actor,id,attempt,'unpublish']);
 const row=(await db.query<{published:boolean;image_url:string}>('SELECT published,image_url FROM photos')).rows[0];
 assert.equal(row.published,false);assert.equal(row.image_url,'');
 assert.equal((await db.query<{cleanup_paths:unknown[]}>('SELECT cleanup_paths FROM carnet_ingest_batches')).rows[0].cleanup_paths.length,1);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4)',[actor,id,attempt,'delete_entry']);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4)',[actor,id,attempt,'release']);
 await db.query('SELECT carnet_media_lock($1,$2,$3)',[actor,id,item]);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4)',[actor,id,item,'cleanup']);
 await db.query('SELECT carnet_media_finish($1,$2,$3,$4)',[actor,id,item,'release']);
 await assert.rejects(db.query('SELECT mobile_carnet_prepare($1,$2,$3,$4)',[actor,batch,manifest,'b'.repeat(64)]),/entry_deleted/);
 await db.close();
});
test('Atomic commit: a gallery insertion failure rolls back the post and every linkage',async()=>{
 const db=await database();await prepare(db);await db.query('SELECT mobile_carnet_claim($1,$2,$3,$4)',[actor,batch,attempt,{}]);
 await db.query('SELECT mobile_carnet_checkpoint($1,$2,$3,$4,$5,$6)',[actor,batch,attempt,{draft_result:{title:'Test',description:'Test',brands:[]}},item,{verified:true}]);
 await db.exec(`CREATE FUNCTION reject_gallery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated_storage_failure'; END $$; CREATE TRIGGER reject_gallery BEFORE INSERT ON photo_images FOR EACH ROW EXECUTE FUNCTION reject_gallery();`);
 await assert.rejects(db.query('SELECT mobile_carnet_commit($1,$2,$3)',[actor,batch,attempt]),/simulated_storage_failure/);
 assert.equal((await db.query('SELECT * FROM photos')).rows.length,0);
 assert.equal((await db.query('SELECT * FROM photo_images')).rows.length,0);
 assert.equal((await db.query<{carnet_entry_id:null}>('SELECT carnet_entry_id FROM carnet_ingest_batches')).rows[0].carnet_entry_id,null);
 await db.close();
});
test('Admin additions: lost browser UUID reuses pending image even at quota',async()=>{
 const db=await database();const entry=await created(db);const ids=['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888'];
 for(let i=0;i<ids.length;i++)await db.query('SELECT carnet_admin_prepare_image($1,$2,$3,$4,$5,$6)',[actor,entry,ids[i],'image/jpeg',100,String(i).repeat(64)]);
 const retry=await db.query<{media:{item_id:string}}>('SELECT carnet_admin_prepare_image($1,$2,$3,$4,$5,$6) media',[actor,entry,'99999999-9999-4999-8999-999999999999','image/jpeg',100,'0'.repeat(64)]);
 assert.equal(retry.rows[0].media.item_id,ids[0]);assert.equal((await db.query("SELECT * FROM carnet_ingest_media WHERE origin='admin'")).rows.length,3);
 await assert.rejects(db.query('SELECT carnet_admin_prepare_image($1,$2,$3,$4,$5,$6)',[actor,entry,'99999999-9999-4999-8999-999999999999','image/jpeg',100,'f'.repeat(64)]),/quota_exceeded/);
 await db.close();
});
