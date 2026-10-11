import { supabase } from '@/lib/supabase';

export interface CarnetEntry {
  id: string;
  title: string;
  city: string;
  description: string;
  brands: string[];
  image_url: string;
  images: string[];
  keywords: string;
}

export interface BrandKnowledge {
  name: string;
  partnerName: string;
  description: string;
  logo_url: string;
  count: number;
}

export interface ConciergeKnowledge {
  entries: CarnetEntry[];
  brands: BrandKnowledge[];
  partners: { name: string; description: string }[];
}

export const EMPTY_KNOWLEDGE: ConciergeKnowledge = { entries: [], brands: [], partners: [] };

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compact = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

interface PhotoKnowledgeRow {
  id: string;
  title: string;
  city: string;
  description: string | null;
  image_url: string;
  detected_brands: string[] | null;
  photo_images: { image_url: string }[] | null;
}

export async function loadConciergeKnowledge(): Promise<ConciergeKnowledge> {
  if (!supabase) return EMPTY_KNOWLEDGE;

  const [photosRes, partnersRes] = await Promise.all([
    supabase
      .from('photos')
      .select('id, title, city, description, image_url, detected_brands, photo_images(image_url)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('partners')
      .select('name, logo_url, description, published')
      .eq('published', true)
      .order('position', { ascending: true }),
  ]);

  const partners = (partnersRes.data ?? []).map((partner) => ({
    name: partner.name as string,
    description: compact(String(partner.description ?? ''), 220),
  }));

  const entries: CarnetEntry[] = ((photosRes.data ?? []) as PhotoKnowledgeRow[]).map((row) => {
    const brands = row.detected_brands ?? [];
    const image = row.image_url || row.photo_images?.[0]?.image_url || '';
    const description = compact(String(row.description ?? ''), 400);
    return {
      id: row.id,
      title: row.title,
      city: row.city ?? '',
      description,
      brands,
      image_url: image,
      images: Array.from(new Set([image, ...(row.photo_images ?? []).map((photo) => photo.image_url)].filter(Boolean))).slice(0, 8),
      keywords: normalizeText([row.title, row.city, brands.join(' '), description].join(' ')),
    };
  });

  const brandMap = new Map<string, BrandKnowledge>();
  for (const entry of entries) {
    for (const brand of entry.brands) {
      const key = normalizeText(brand);
      if (!key) continue;
      const existing = brandMap.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const partner = partners.find((p) => normalizeText(p.name) === key);
      brandMap.set(key, {
        name: brand,
        partnerName: partner?.name ?? '',
        description: partner?.description ?? '',
        logo_url: '',
        count: 1,
      });
    }
  }

  return {
    entries,
    brands: Array.from(brandMap.values()).sort((a, b) => b.count - a.count),
    partners,
  };
}
