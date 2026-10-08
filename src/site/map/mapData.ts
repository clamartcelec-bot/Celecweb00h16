import type { Photo } from '@/site/types';

export type MapKind = 'intervention' | 'chantier' | 'chantier_pro' | 'carnet';
export type MapTheme =
  | 'tableau'
  | 'eclairage'
  | 'domotique'
  | 'recharge'
  | 'interphonie'
  | 'prises'
  | 'renovation'
  | 'depannage'
  | 'ventilation';

export const MAP_KINDS: MapKind[] = ['intervention', 'chantier', 'chantier_pro', 'carnet'];

export const KIND_COLORS: Record<MapKind, string> = {
  intervention: '#e8336a',
  chantier: '#f07f1a',
  chantier_pro: '#285f80',
  carnet: '#4f93bd',
};

export function kindOf(entryType: string | null | undefined): MapKind {
  if (entryType === 'chantier') return 'chantier';
  if (entryType === 'chantier_pro') return 'chantier_pro';
  if (entryType === 'remarque' || entryType === 'carnet' || entryType === 'blog') return 'carnet';
  return 'intervention';
}

export const isWorksite = (kind: MapKind) => kind === 'chantier' || kind === 'chantier_pro';

const THEME_RULES: { theme: MapTheme; words: RegExp; brands?: string[] }[] = [
  { theme: 'tableau', words: /tableau|disjoncteur|differentiel|triphas|colonne montante|mise aux normes|remise aux normes/ },
  { theme: 'eclairage', words: /eclairage|luminaire|lumiere|led\b|spots?\b|mise en lumiere/, brands: ['philips', 'artemide'] },
  { theme: 'domotique', words: /domoti|knx|my ?home|connecte|volets?|pilotage/, brands: ['somfy', 'deltadore', 'netatmo'] },
  { theme: 'recharge', words: /borne|recharge|vehicule|wallbox/, brands: ['wallbox'] },
  { theme: 'interphonie', words: /interphon|videophon|visiophon|platine|portier/, brands: ['urmet', 'comelit'] },
  { theme: 'prises', words: /prises?\b|circuits?\b|saignee|reseau/ },
  { theme: 'renovation', words: /renovation|refection|installation complete|haussmann/ },
  { theme: 'depannage', words: /depannage|panne|diagnostic|declench/ },
  { theme: 'ventilation', words: /vmc|ventilation|chauffage|radiateur/, brands: ['atlantic'] },
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export interface MapPoint {
  entry: Photo;
  id: string;
  lat: number;
  lng: number;
  kind: MapKind;
  themes: MapTheme[];
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Spread entries around their town centre so they never stack on the town hall. Stable per entry. */
function scatter(id: string, lat: number, lng: number) {
  const angle = hash(`${id}:a`) * Math.PI * 2;
  const meters = 260 + hash(`${id}:r`) * 900;
  return {
    lat: lat + (meters * Math.cos(angle)) / 111320,
    lng: lng + (meters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}

export function toMapPoints(photos: Photo[]): MapPoint[] {
  return photos
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0))
    .map((entry) => {
      const text = fold(`${entry.title} ${entry.description ?? ''}`);
      const brands = (entry.detected_brands ?? []).map((b) => fold(b).replace(/[^a-z0-9]/g, ''));
      const themes = THEME_RULES
        .filter((rule) => rule.words.test(text) || rule.brands?.some((b) => brands.includes(b)))
        .map((rule) => rule.theme);
      return { entry, id: entry.id, kind: kindOf(entry.entry_type), themes, ...scatter(entry.id, entry.lat, entry.lng) };
    });
}

/** The themes CELEC does most, in order, so the filters follow the real activity. */
export function topThemes(points: MapPoint[], limit = 6) {
  const counts = new Map<MapTheme, number>();
  points.forEach((p) => p.themes.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([theme, count]) => ({ theme, count }));
}

export function countKinds(points: MapPoint[]) {
  const counts: Record<MapKind, number> = { intervention: 0, chantier: 0, chantier_pro: 0, carnet: 0 };
  points.forEach((p) => { counts[p.kind]++; });
  return counts;
}
