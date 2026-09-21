import { supabase } from '@/lib/supabase';

export interface CarnetEntry {
  id: string;
  title: string;
  city: string;
  description: string;
  brands: string[];
  image_url: string;
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

export function formatConciergeKnowledge(knowledge: ConciergeKnowledge, maxEntries = 48): string {
  const lines: string[] = ['BASE DE CONNAISSANCES DU SITE (usage interne, ne pas lire à voix haute) :'];

  if (knowledge.entries.length) {
    lines.push('', 'CARNET PUBLIÉ — index des interventions (identifiant | titre | commune | marques) :');
    knowledge.entries.slice(0, maxEntries).forEach((entry) => {
      const brands = entry.brands.length ? entry.brands.join(', ') : 'aucune marque identifiée';
      lines.push(`- ${entry.id} | ${compact(entry.title, 90)} | ${compact(entry.city || 'commune non précisée', 40)} | ${compact(brands, 80)}`);
    });
  } else {
    lines.push('', 'CARNET PUBLIÉ : aucun billet publié pour le moment.');
  }

  if (knowledge.brands.length) {
    lines.push('', 'MARQUES TRAVAILLÉES (issues du carnet publié) :');
    knowledge.brands.slice(0, 40).forEach((brand) => {
      lines.push(`- ${brand.name}${brand.partnerName ? ' (partenaire)' : ''} : ${brand.count} intervention(s) au carnet`);
    });
  }

  if (knowledge.partners.length) {
    lines.push('', 'PARTENAIRES PUBLIÉS :');
    knowledge.partners.forEach((partner) => {
      lines.push(`- ${partner.name}${partner.description ? ` : ${partner.description}` : ''}`);
    });
  }

  return lines.join('\n');
}

export function findEntries(knowledge: ConciergeKnowledge, ids: string[]): CarnetEntry[] {
  return ids
    .map((id) => knowledge.entries.find((entry) => entry.id === id))
    .filter((entry): entry is CarnetEntry => Boolean(entry));
}

export function findBrand(knowledge: ConciergeKnowledge, name: string): BrandKnowledge | null {
  const key = normalizeText(name);
  if (!key) return null;
  return (
    knowledge.brands.find((brand) => normalizeText(brand.name) === key) ??
    knowledge.brands.find((brand) => key.includes(normalizeText(brand.name)) || normalizeText(brand.name).includes(key)) ??
    null
  );
}

export function searchCarnet(knowledge: ConciergeKnowledge, query: string, limit = 3): CarnetEntry[] {
  const tokens = normalizeText(query).split(' ').filter((token) => token.length > 2);
  if (!tokens.length) return [];

  const scored = knowledge.entries
    .map((entry) => {
      const title = normalizeText(entry.title);
      const city = normalizeText(entry.city);
      const brands = normalizeText(entry.brands.join(' '));
      let score = 0;
      for (const token of tokens) {
        if (brands.includes(token)) score += 4;
        if (title.includes(token)) score += 3;
        if (city.includes(token)) score += 2;
        if (entry.keywords.includes(token)) score += 1;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.entry);
}

export async function findEntryForSession(sessionId: string): Promise<CarnetEntry | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('photos')
    .select('id, title, city, description, image_url, detected_brands, photo_images(image_url)')
    .eq('concierge_session', sessionId)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as PhotoKnowledgeRow;
  return {
    id: row.id,
    title: row.title,
    city: row.city ?? '',
    description: String(row.description ?? ''),
    brands: row.detected_brands ?? [],
    image_url: row.image_url || row.photo_images?.[0]?.image_url || '',
    keywords: '',
  };
}
