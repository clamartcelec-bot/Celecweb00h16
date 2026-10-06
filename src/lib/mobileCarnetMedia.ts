import { supabase } from './supabase';

export interface MobilePreview {
  images: Array<{ photo_image_id:string;item_id:string;url:string;is_cover:boolean }>;
  voice_transcript: string|null;
  diagnostics: unknown;
  media: Array<{item_id:string;type:string;position:number;duration_ms:number|null;analysis:string}>;
}
export async function mobileMedia<T = Record<string,unknown>>(body: Record<string,unknown>): Promise<T> {
  if(!supabase)throw new Error('Supabase indisponible');
  const {data,error}=await supabase.functions.invoke('carnet-media',{body});
  if(error){
    let message='Opération médias impossible. Réessayez.';
    try{const payload=await error.context?.json();if(payload?.message)message=payload.message;}catch{/* use safe message */}
    throw new Error(message);
  }
  if(!data?.success)throw new Error(data?.message||'Opération médias incomplète');
  return data as T;
}
export async function uploadMobileAdminImage(entryId:string,file:File) {
  if(!supabase)throw new Error('Supabase indisponible');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const itemId=crypto.randomUUID();
  const prepared=await mobileMedia<{path:string;token:string;item_id:string}>({action:'prepare_image',entry_id:entryId,item:{item_id:itemId,mime_type:file.type,byte_size:file.size,sha256:hash}});
  const {error}=await supabase.storage.from('carnet-ingest').uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:file.type});
  // An interrupted response may mean this immutable object is already present.
  // Only the server's size, signature and hash verification can accept it.
  if(error&&!/already exists|duplicate|409/i.test(error.message))throw new Error('Image non envoyée. Les autres images sont conservées.');
  await mobileMedia({action:'attach_image',entry_id:entryId,item_id:prepared.item_id});
}
