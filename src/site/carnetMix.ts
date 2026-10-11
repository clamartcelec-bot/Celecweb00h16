import { TOPICS, topicById, topicsOf } from '@/site/taxonomy';
import type { Photo } from '@/site/types';

export interface MixSegment {
  key: string;
  label: string | null;
  items: Photo[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Interleaves topic buckets so the first screen shows a varied mix rather than one subject. */
function variedMix(photos: Photo[], seed: number): Photo[] {
  const rand = rng(seed);
  const buckets = new Map<string, Photo[]>();
  photos.forEach((p) => {
    const key = topicsOf(p)[0] ?? 'autre';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  });
  const queues = shuffle([...buckets.values()].map((b) => shuffle(b, rand)), rand);
  const out: Photo[] = [];
  while (queues.some((q) => q.length > 0)) {
    queues.forEach((q) => { const next = q.shift(); if (next) out.push(next); });
  }
  return out;
}

const byDate = (a: Photo, b: Photo) => b.created_at.localeCompare(a.created_at);

export function buildMix(photos: Photo[], topic: string | null, seed: number): MixSegment[] {
  if (!topic) return [{ key: 'all', label: null, items: variedMix(photos, seed) }];

  const seen = new Set<string>();
  const take = (ids: string[]) =>
    photos
      .filter((p) => !seen.has(p.id) && topicsOf(p).some((id) => ids.includes(id)))
      .sort(byDate)
      .map((p) => { seen.add(p.id); return p; });

  const segments: MixSegment[] = [{ key: topic, label: null, items: take([topic]) }];
  const ring1 = topicById(topic)?.neighbors ?? [];
  const ring2 = [...new Set(ring1.flatMap((n) => topicById(n)?.neighbors ?? []))].filter((n) => n !== topic && !ring1.includes(n));

  [...ring1, ...ring2].forEach((n) => {
    const items = take([n]);
    if (items.length > 0) segments.push({ key: n, label: topicById(n)?.name ?? n, items });
  });
  return segments;
}

export function topicCounts(photos: Photo[]): Map<string, number> {
  const counts = new Map<string, number>();
  TOPICS.forEach((t) => counts.set(t.id, 0));
  photos.forEach((p) => topicsOf(p).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return counts;
}
