import { supabase } from '@/lib/supabase';

export interface CompanyFact {
  id: string;
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: string;
  position: number;
  published: boolean;
}

export type CompanyFactDraft = Omit<CompanyFact, 'id'> & { id?: string };

const FIELDS = 'id, key, label, value, detail, icon, position, published';

export const FACT_ICONS = ['clock', 'map', 'phone', 'zap', 'shield', 'info'] as const;

export async function loadCompanyFacts(includeHidden = false): Promise<CompanyFact[]> {
  if (!supabase) return [];
  let query = supabase.from('company_facts').select(FIELDS).order('position', { ascending: true });
  if (!includeHidden) query = query.eq('published', true);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data as CompanyFact[];
}

export function slugifyFactKey(label: string) {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export async function saveCompanyFact(fact: CompanyFactDraft): Promise<CompanyFact> {
  if (!supabase) throw new Error('Base de données indisponible.');
  const payload = {
    key: fact.key || slugifyFactKey(fact.label),
    label: fact.label.trim(),
    value: fact.value.trim(),
    detail: fact.detail.trim(),
    icon: fact.icon,
    position: fact.position,
    published: fact.published,
    updated_at: new Date().toISOString(),
  };
  const request = fact.id
    ? supabase.from('company_facts').update(payload).eq('id', fact.id).select(FIELDS).maybeSingle()
    : supabase.from('company_facts').insert(payload).select(FIELDS).maybeSingle();
  const { data, error } = await request;
  if (error) throw new Error(error.code === '23505' ? 'Cette information existe déjà.' : error.message);
  if (!data) throw new Error('Enregistrement impossible.');
  return data as CompanyFact;
}

export async function deleteCompanyFact(id: string): Promise<void> {
  if (!supabase) throw new Error('Base de données indisponible.');
  const { error } = await supabase.from('company_facts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
