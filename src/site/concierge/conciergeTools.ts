import type { Partner, Photo } from '@/site/types';
import { familyById, topicById, topicsOf, TOPICS } from '@/site/taxonomy';
import { searchCarnet } from '@/site/carnetMix';
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

export interface Guide { id: number; view: string; family?: string; topic?: string; search?: string; entryId?: string; partnerId?: string }

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
  onChatPage: boolean;
  lastSearch: { current: string };
  guide(step: Omit<Guide, 'id'>): void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’-]/g, ' ');
const searchEntries = (photos: Photo[], query: string, limit: number) => searchCarnet(photos, query, limit);
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
    SITE_MAP,
    recent.length ? `Derniers échanges avec ce visiteur :\n${recent.join('\n')}` : 'Premier échange avec ce visiteur.',
  ].join('\n');
}

const SITE_MAP = [
  'PLAN DU SITE ET CHEMINS (tu te déplaces toi-même dans le site, le visiteur te voit cliquer et taper) :',
  '- Accueil > Services (5 univers : electricite, confort, securite, reseau, energie) > page d’un univers → navigate view = family + family.',
  '- Accueil > Carnet > barre de recherche > réalisation → navigate view = carnet + search = 2 à 5 mots-clés (ex. « éclairage LED bureaux »). Tu tapes la recherche toi-même dans la barre. Ajoute entry_id pour ouvrir une réalisation précise ensuite.',
  '- Accueil > Carnet > filtre par sujet → navigate view = carnet + topic.',
  '- Accueil > Carte des interventions (communes) → navigate view = map.',
  '- Accueil > Partenaires > fiche d’une marque ou d’un artisan → show_brand (tu vas sur la page Partenaires et tu ouvres la fiche).',
  '- Accueil > Entretien et suivi → navigate view = entretien. BlockTech (bureau d’études) → navigate view = blocktech.',
  '- Rendez-vous ou rappel : jamais une page. Appelle begin_appointment_flow : une fenêtre s’ouvre au centre de l’écran et tu la remplis avec le visiteur.',
  '- Pour montrer une réalisation, emmène le visiteur dans le carnet avec une recherche, plutôt que de l’afficher dans une bulle. Annonce le chemin en une phrase (« je vous emmène dans le carnet et je cherche … »).',
].join('\n');

const NOTIFY_CATEGORY: Record<string, string> = { depannage: 'depannage', travaux: 'chantier', projet: 'projet', question: 'question' };
const VIEWS = ['home', 'carnet', 'map', 'partners', 'blocktech', 'entretien', 'family', 'contact'];

export async function runTool(name: string, args: Record<string, unknown>, env: ToolEnv): Promise<Record<string, unknown>> {
  switch (name) {
    case 'search_carnet': {
      env.lastSearch.current = str(args.query, 80);
      const found = searchEntries(env.photos, env.lastSearch.current, 6);
      return { results: found.map((p) => ({ id: p.id, title: p.title, city: p.city, brands: p.detected_brands ?? [] })) };
    }
    case 'show_carnet_entries': {
      const ids = strList(args.entry_ids, 6).filter((id) => env.photos.some((p) => p.id === id));
      if (!ids.length) return { shown: 0, error: 'Identifiants inconnus : utilise ceux du contexte.' };
      if (!env.onChatPage) {
        const first = env.photos.find((p) => p.id === ids[0]);
        env.guide({ view: 'carnet', search: env.lastSearch.current || first?.title.split(/\s+/).slice(0, 4).join(' '), entryId: ids.length === 1 ? ids[0] : undefined });
        return { shown: ids.length, how: 'Tu emmènes le visiteur dans le carnet et tu tapes la recherche.' };
      }
      env.show({ kind: 'entries', ids, intro: str(args.intro, 160) });
      env.act({ type: 'show_entries', ids });
      return { shown: ids.length };
    }
    case 'show_brand': {
      const wanted = norm(str(args.brand, 80));
      const partner = env.partners.find((p) => norm(p.name) === wanted) ?? env.partners.find((p) => wanted && (norm(p.name).includes(wanted) || wanted.includes(norm(p.name))));
      if (partner && !env.onChatPage) {
        env.guide({ view: 'partners', partnerId: partner.id });
        return { shown: partner.name, description: partner.description.slice(0, 400), why: partner.why_story?.slice(0, 400) ?? '' };
      }
      if (partner) {
        env.show({ kind: 'partner', id: partner.id, intro: '' });
        env.act({ type: 'show_partner', id: partner.id });
        return { shown: partner.name, description: partner.description.slice(0, 400), why: partner.why_story?.slice(0, 400) ?? '' };
      }
      const entries = searchEntries(env.photos, wanted, 4);
      if (entries.length) {
        const ids = entries.map((p) => p.id);
        if (!env.onChatPage) {
          env.guide({ view: 'carnet', search: str(args.brand, 60) });
          return { shown: 'carnet', titles: entries.map((p) => p.title) };
        }
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
      const search = view === 'carnet' ? str(args.search, 80) : '';
      const entryId = str(args.entry_id, 60);
      env.guide({
        view,
        family: str(args.family, 20) || undefined,
        topic: view === 'carnet' && topicById(topic) ? topic : undefined,
        search: search || undefined,
        entryId: env.photos.some((p) => p.id === entryId) ? entryId : undefined,
      });
      const found = search ? searchEntries(env.photos, search, 4).map((p) => p.title) : undefined;
      return { ok: true, now_on: view, results: found };
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
