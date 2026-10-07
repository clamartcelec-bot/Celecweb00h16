export type Lang = 'fr' | 'en' | 'es' | 'ar';
export type View = 'home' | 'carnet' | 'partners' | 'blocktech' | 'admin-login' | 'admin';
export type Theme = 'light' | 'dark';
export type ContactCategory = 'depannage' | 'chantier' | 'projet';

export interface PhotoImage {
  id: string;
  image_url: string;
  caption: string | null;
  position: number;
}

export interface Photo {
  id: string;
  title: string;
  city: string;
  lat: number;
  lng: number;
  description: string | null;
  author: string;
  image_url: string;
  created_at: string;
  detected_brands?: string[] | null;
  photo_images?: PhotoImage[];
}

export interface CityGroup {
  city: string;
  count: number;
  lat: number;
  lng: number;
}

export interface Partner {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  position: number;
  published: boolean;
  created_at: string;
}

export interface Comment {
  id: string;
  target_type: 'partner' | 'photo';
  target_id: string;
  user_id: string | null;
  author_name: string;
  content: string;
  rating: number | null;
  created_at: string;
}

export const coverOf = (entry: Photo) => entry.image_url || entry.photo_images?.[0]?.image_url || '';

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export const normalizeBrandName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
