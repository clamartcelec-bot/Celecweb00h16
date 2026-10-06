import {handleMobile} from '../mobile-carnet/handler.ts';
import {handleMedia} from '../carnet-media/handler.ts';
const user='11111111-1111-4111-8111-111111111111';
function check(value:unknown,message:string){if(!value)throw new Error(message);}
function request(body:unknown,authenticated=true){return new Request('https://test.invalid/function',{method:'POST',headers:{'content-type':'application/json',...(authenticated?{authorization:'Bearer fake-user-token'}:{})},body:JSON.stringify(body)});}
Deno.test('HTTP auth: anonymous and clients cannot ingest or preview; admin capabilities match protocol',async()=>{
 const original=globalThis.fetch;let role='client',reads=0;
 Deno.env.set('SUPABASE_URL','https://db.test.invalid');Deno.env.set('SUPABASE_ANON_KEY','fake-public-key');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fake-server-key');
 globalThis.fetch=((input:RequestInfo|URL)=>{
  const url=new URL(input instanceof Request?input.url:String(input));reads++;
  if(url.origin!=='https://db.test.invalid')throw new Error('No external access permitted in this test');
  if(url.pathname==='/auth/v1/user')return Promise.resolve(Response.json({id:user,aud:'authenticated',email:'admin@test.invalid'}));
  if(url.pathname==='/rest/v1/profiles')return Promise.resolve(Response.json([{role,full_name:'Test admin',email:'admin@test.invalid'}]));
  throw new Error('Unexpected database mutation/read');
 }) as typeof fetch;
 try{
  check((await handleMobile(request({api_version:1,action:'capabilities'},false))).status===401,'anonymous blocked');check(reads===0,'no auth/db request for missing bearer');
  check((await handleMobile(request({api_version:1,action:'capabilities'}))).status===403,'client ingestion blocked');
  check((await handleMedia(request({action:'preview',entry_id:user}))).status===403,'client media blocked');
  role='admin';const result=await handleMobile(request({api_version:1,action:'capabilities'}));const payload=await result.json();
  check(result.status===200&&payload.user.id===user,'admin accepted');check(payload.requires_location===false&&payload.video_processing==='stored_only','MVP scope');
  check((await handleMobile(request({api_version:2,action:'capabilities'}))).status===400,'unsupported version blocked');
  check((await handleMobile(request({api_version:1,action:'prepare',items:[1]}))).status===400,'invalid manifest blocked before mutation');
 }finally{globalThis.fetch=original;Deno.env.delete('SUPABASE_URL');Deno.env.delete('SUPABASE_ANON_KEY');Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');}
});
