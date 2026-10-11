import type { Partner, Photo } from '@/site/types';
import { classifyText, entryText, familyById, topicById, topicsOf, TOPICS } from '@/site/taxonomy';
import type { CompanyFact } from '@/concierge/services/companyFacts';
import { notifyTeam } from '@/site/notify';
import type { ConciergeAction, ConciergeContext } from './useConcierge';

export interface RequestDraft {
  first_name?: string;
  last_name?: string;
  phone?: string;
  summary?: string;
  category?: 'depannage' | 'travaux' | 'projet' | 'question';
  site_type?: string;
  location?: string;
  urgency?: string;
  availability?: string;
  callback_requested?: boolean;
}

export type Stage =
  | { kind: 'entries'; ids: string[]; intro: string }
  | { kind: 'partner'; id: string; intro: string }
  | { kind: 'info'; variant: string; title: string; points: string[]; note: string }
  | { kind: 'facts'; facts: CompanyFact[] }
  | { kind: 'request'; sent: boolean };

export interface ToolEnv {
  photos: Photo[];
  partners: Partner[];
  facts: CompanyFact[];
  draft: RequestDraft;
  userEmail: string | null;
  show(stage: Stage): void;
  act(action: ConciergeAction): void;
  patchDraft(patch: Partial<RequestDraft>): void;
  setAppointment(on: boolean): void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’-]/g, ' ');
const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => str(x, 160)).filter(Boolean).slice(0, max) : []);

const PAGE_LABELS: Record<string, string> = {
  home: 'la page d’accueil',
  carnet: 'le carnet de chantiers (toutes les réalisations)',
  map: 'la carte des interventions par commune',
  partners: 'la page des marques et partenaires',
  blocktech: 'la page BlockTech (bureau d’études partenaire)',
  entretien: 'la page entretien et suivi',
  concierge: 'la grande page de conversation avec toi',
};

export function describePage(ctx: ConciergeContext) {
  if (ctx.page === 'family' && ctx.family) return `l’univers « ${familyById(ctx.family)?.name ?? ctx.family} »`;
  const base = PAGE_LABELS[ctx.page] ?? `la page « ${ctx.page} »`;
  const topic = ctx.topic ? topicById(ctx.topic)?.name : null;
  return topic ? `${base}, filtré sur « ${topic} »` : base;
}

export function buildSiteContext(ctx: ConciergeContext, photos: Photo[], partners: Partner[], history: { role: string; text: string }[]) {
  const entries = photos.slice(0, 70).map((p) => {
    const brands = (p.detected_brands ?? []).slice(0, 4).join(', ');
    return `- ${p.id} | ${p.title} | ${p.city}${brands ? ` | ${brands}` : ''} | ${topicsOf(p).join(',')}`;
  });
  const brands = partners.filter((p) => p.published !== false).map((p) => (p.kind === 'pro' ? `${p.name} (artisan local${p.trade ? `, ${p.trade}` : ''})` : p.name));
  const recent = history.filter((t) => t.text).slice(-8).map((t) => `${t.role === 'user' ? 'Visiteur' : 'Toi'} : ${t.text.slice(0, 240)}`);
  return [
    'CONTEXTE DU SITE (à jour, prioritaire sur tes connaissances générales)',
    `Le visiteur est sur ${describePage(ctx)}.`,
    `Sujets (id : nom) : ${TOPICS.map((t) => `${t.id} : ${t.name}`).join(' ; ')}.`,
    'Réalisations du carnet (id | titre | commune | marques | sujets). Tu peux appeler show_carnet_entries directement avec ces id, sans search_carnet :',
    ...entries,
    `Marques et partenaires : ${brands.join(', ') || 'aucun'}.`,
    'Pour faire défiler le carnet sur un sujet, appelle navigate avec view = carnet et topic = id du sujet.',
    recent.length ? `Derniers échanges avec ce visiteur :\n${recent.join('\n')}` : 'Premier échange avec ce visiteur.',
  ].join('\n');
}

export function searchEntries(photos: Photo[], query: string, limit = 6) {
  const words = norm(query).split(/\s+/).filter((w) => w.length >= 3).map((w) => w.replace(/s$/, ''));
  const topics = new Set(classifyText(query));
  return photos
    .map((p) => {
      const title = norm(p.title);
      const city = norm(p.city);
      const brands = norm((p.detected_brands ?? []).join(' '));
      const text = norm(entryText(p));
      let score = topicsOf(p).filter((t) => topics.has(t)).length * 2;
      for (const w of words) {
        if (title.includes(w)) score += 3;
        if (brands.includes(w)) score += 3;
        if (city.includes(w)) score += 2;
        else if (text.includes(w)) score += 1;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.p);
}

const NOTIFY_CATEGORY: Record<string, string> = { depannage: 'depannage', travaux: 'chantier', projet: 'projet', question: 'question' };
const VIEWS = ['home', 'carnet', 'map', 'partners', 'blocktech', 'entretien', 'family', 'contact'];

export async function runTool(name: string, args: Record<string, unknown>, env: ToolEnv): Promise<Record<string, unknown>> {
  switch (name) {
    case 'search_carnet': {
      const found = searchEntries(env.photos, str(args.query, 120));
      return { results: found.map((p) => ({ id: p.id, title: p.title, city: p.city, brands: p.detected_brands ?? [] })) };
    }
    case 'show_carnet_entries': {
      const ids = strList(args.entry_ids, 6).filter((id) => env.photos.some((p) => p.id === id));
      if (!ids.length) return { shown: 0, error: 'Identifiants inconnus : utilise ceux du contexte.' };
      env.show({ kind: 'entries', ids, intro: str(args.intro, 160) });
      env.act({ type: 'show_entries', ids });
      return { shown: ids.length };
    }
    case 'show_brand': {
      const wanted = norm(str(args.brand, 80));
      const partner = env.partners.find((p) => norm(p.name) === wanted) ?? env.partners.find((p) => wanted && (norm(p.name).includes(wanted) || wanted.includes(norm(p.name))));
      if (partner) {
        env.show({ kind: 'partner', id: partner.id, intro: '' });
        env.act({ type: 'show_partner', id: partner.id });
        return { shown: partner.name, description: partner.description.slice(0, 400), why: partner.why_story?.slice(0, 400) ?? '' };
      }
      const entries = searchEntries(env.photos, wanted, 4);
      if (entries.length) {
        const ids = entries.map((p) => p.id);
        env.show({ kind: 'entries', ids, intro: '' });
        env.act({ type: 'show_entries', ids });
        return { shown: 'réalisations', titles: entries.map((p) => p.title) };
      }
      return { shown: null, note: 'Marque absente du site.' };
    }
    case 'show_info': {
      const points = strList(args.points, 5);
      if (!points.length) return { shown: false };
      env.show({ kind: 'info', variant: str(args.kind, 20) || 'info', title: str(args.title, 80), points, note: str(args.note, 200) });
      return { shown: true };
    }
    case 'show_fact': {
      const keys = strList(args.keys, 3);
      const facts = env.facts.filter((f) => keys.includes(f.key));
      if (facts.length) env.show({ kind: 'facts', facts });
      return { shown: facts.map((f) => f.key) };
    }
    case 'navigate': {
      const view = str(args.view, 20);
      if (!VIEWS.includes(view)) return { ok: false };
      const topic = str(args.topic, 30);
      if (view === 'carnet' && topicById(topic)) env.act({ type: 'filter_carnet', topic });
      else env.act({ type: 'navigate', view, family: str(args.family, 20) || undefined });
      return { ok: true, now_on: view };
    }
    case 'update_client_panel':
    case 'update_request_panel': {
      const patch: Partial<RequestDraft> = {};
      for (const key of ['first_name', 'last_name', 'phone', 'summary', 'site_type', 'location', 'urgency', 'availability'] as const) {
        const v = str(args[key], 300);
        if (v) patch[key] = v;
      }
      if (typeof args.category === 'string' && args.category in NOTIFY_CATEGORY) patch.category = args.category as RequestDraft['category'];
      if (typeof args.callback_requested === 'boolean') patch.callback_requested = args.callback_requested;
      env.patchDraft(patch);
      env.show({ kind: 'request', sent: false });
      return { ok: true };
    }
    case 'begin_appointment_flow':
      env.setAppointment(true);
      if (args.callback_requested === true) env.patchDraft({ callback_requested: true });
      env.show({ kind: 'request', sent: false });
      return { ok: true };
    case 'end_appointment_flow':
      env.setAppointment(false);
      return { ok: true };
    case 'submit_request': {
      if (args.explicit_confirmed !== true) return { sent: false, error: 'Demande l’accord explicite du client avant de transmettre.' };
      const d = { ...env.draft, ...Object.fromEntries(Object.entries(args).filter(([, v]) => typeof v === 'string' && v.trim())) } as RequestDraft;
      const phone = str(d.phone, 30);
      if (phone.replace(/\D/g, '').length < 8) return { sent: false, error: 'Numéro de téléphone manquant ou incomplet.' };
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ');
      const description = [
        d.summary,
        name && `Nom : ${name}`,
        d.location && `Lieu : ${d.location}`,
        d.site_type && `Type de site : ${d.site_type}`,
        d.urgency && `Urgence : ${d.urgency}`,
        d.availability && `Disponibilités : ${d.availability}`,
      ].filter(Boolean).join('\n');
      try {
        await notifyTeam({
          category: NOTIFY_CATEGORY[d.category ?? 'question'] ?? 'question',
          description: description || 'Demande de rappel',
          source: 'concierge',
          guest_phone: phone,
          user_email: env.userEmail ?? undefined,
          callback_requested: Boolean(d.callback_requested ?? args.callback_requested),
        });
      } catch {
        return { sent: false, error: 'Envoi impossible pour le moment : propose le formulaire de contact.' };
      }
      env.patchDraft({ phone });
      env.show({ kind: 'request', sent: true });
      env.setAppointment(false);
      return { sent: true };
    }
    default:
      return { error: 'unknown_tool' };
  }
}
