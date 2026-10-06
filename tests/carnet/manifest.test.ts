import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,verifyContainer,manifestHash} from '../../supabase/functions/_shared/carnetManifest.ts';
const base={api_version:1,batch_id:'33333333-3333-4333-8333-333333333333',text:'',items:[{item_id:'44444444-4444-4444-8444-444444444444',type:'image',position:0,mime_type:'image/jpeg',byte_size:100,sha256:'a'.repeat(64)}]};
test('Manifest: exact order, uniqueness, allowed formats and size bounds',()=>{
 assert.equal(validateManifest(base).items.length,1);
 for(const item of [{...base.items[0],position:1},{...base.items[0],byte_size:10485761},{...base.items[0],mime_type:'image/svg+xml'},{...base.items[0],sha256:'bad'}])assert.throws(()=>validateManifest({...base,items:[item]}));
 assert.throws(()=>validateManifest({...base,items:[base.items[0],{...base.items[0],position:1}]}),/duplicate_item/);
});
test('Manifest hash is canonical and container claims are verified',async()=>{
 const reordered={items:base.items,text:'',batch_id:base.batch_id.toUpperCase(),api_version:1};
 assert.equal(await manifestHash(validateManifest(base)),await manifestHash(validateManifest(reordered)));
 assert.equal(verifyContainer(new Uint8Array([255,216,255,1,255,217]),'image/jpeg'),true);
 assert.equal(verifyContainer(new TextEncoder().encode('<script>bad</script>'),'image/jpeg'),false);
 function box(name:string,body:Uint8Array){const b=new Uint8Array(body.length+8);new DataView(b.buffer).setUint32(0,b.length);b.set(new TextEncoder().encode(name),4);b.set(body,8);return b;}
 function movie(handler:string){const h=new Uint8Array(12);h.set(new TextEncoder().encode(handler),8);const f=box('ftyp',new Uint8Array(16)),m=box('moov',box('trak',box('mdia',box('hdlr',h))));const all=new Uint8Array(f.length+m.length);all.set(f);all.set(m,f.length);return all;}
 assert.equal(verifyContainer(movie('soun'),'audio/mp4'),true);
 assert.equal(verifyContainer(movie('vide'),'audio/mp4'),false);
 assert.equal(verifyContainer(movie('vide'),'video/mp4'),true);
 const truncated=movie('soun').subarray(0,30);assert.equal(verifyContainer(truncated,'audio/mp4'),false);
});
