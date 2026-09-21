import { supabase } from '@/lib/supabase';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function uploadConciergeFile(file: File, sessionId: string | null): Promise<string> {
  if (!supabase) throw new Error('Le dépôt de fichier n’est pas disponible.');

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error('Seules les photos et les vidéos peuvent être jointes.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Le fichier est trop lourd (25 Mo maximum).');
  }

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${sessionId || 'concierge'}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from('concierge-uploads')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error('L’envoi du fichier a échoué.');

  const { data } = supabase.storage.from('concierge-uploads').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('L’adresse du fichier est introuvable.');
  return data.publicUrl;
}
