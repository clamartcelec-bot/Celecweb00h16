import type { Lang } from '@/site/types';

interface PageLines { lines: string[]; chips: string[] }

const FR: Record<string, PageLines> = {
  home: {
    lines: ['Bonjour ! Appuyez sur moi, je vous emmène où vous voulez.', 'Une panne, des travaux, un projet ? Restez appuyé et racontez-moi.', 'Je peux vous montrer nos chantiers, nos marques, notre carte.'],
    chips: ['Montre-moi vos chantiers', 'J’ai une panne', 'Quelles marques utilisez-vous ?'],
  },
  carnet: {
    lines: ['Dites-moi quel chantier vous voulez voir, je vous le montre.', 'Un tableau, une alarme, une borne ? Demandez, je cherche pour vous.'],
    chips: ['Montre-moi un tableau électrique', 'Une installation domotique', 'Une borne de recharge'],
  },
  map: {
    lines: ['Votre commune ? Dites-la-moi, je vous montre ce qu’on y a fait.', 'Appuyez sur moi, je vous emmène dans votre quartier.'],
    chips: ['Qu’avez-vous fait à Clamart ?', 'Vous intervenez où ?'],
  },
  partners: {
    lines: ['Une marque vous intrigue ? Demandez-moi pourquoi on l’a choisie.'],
    chips: ['Pourquoi ces marques ?', 'Quelle marque pour une alarme ?'],
  },
  family: {
    lines: ['Une question sur cet univers ? Appuyez sur moi pour me parler.', 'Je peux vous montrer nos réalisations sur ce sujet.'],
    chips: ['Montre-moi des réalisations', 'Comment se passe une intervention ?'],
  },
  entretien: {
    lines: ['Votre installation a besoin d’un suivi ? Racontez-moi, je m’en occupe.'],
    chips: ['Comment se passe l’entretien ?', 'Être rappelé'],
  },
  blocktech: {
    lines: ['Un projet à étudier ? Je vous explique comment on travaille avec BlockTech.'],
    chips: ['C’est quoi BlockTech ?', 'J’ai un projet avec architecte'],
  },
  concierge: {
    lines: ['Restez appuyé sur moi pour parler, ou écrivez en bas.'],
    chips: ['Montre-moi vos chantiers', 'J’ai une panne', 'Être rappelé'],
  },
};

const EN: Record<string, PageLines> = {
  home: {
    lines: ['Hello! Press me, I’ll take you wherever you want.', 'A fault, some work, a project? Hold me and tell me.'],
    chips: ['Show me your projects', 'I have a power fault', 'Which brands do you use?'],
  },
  carnet: {
    lines: ['Tell me which project you’d like to see, I’ll show it to you.'],
    chips: ['Show me a fuse board', 'A home automation install', 'An EV charger'],
  },
  concierge: {
    lines: ['Hold me to talk, or type below.'],
    chips: ['Show me your projects', 'I have a power fault', 'Call me back'],
  },
};

export const HOLD_HINT: Record<Lang, string> = {
  fr: 'Restez appuyé sur moi pour me parler',
  en: 'Hold me to talk',
  es: 'Mantenme pulsado para hablar',
  ar: 'اضغط مطولاً للتحدث',
};

export function dockLines(lang: Lang, page: string, name: string | null): PageLines {
  const table = lang === 'fr' ? FR : EN;
  const base = table[page] ?? table.home ?? FR.home;
  if (page !== 'home' || !name) return base;
  const hello = lang === 'fr' ? `Re-bonjour ${name} ! Appuyez sur moi, je m’occupe de tout.` : `Welcome back ${name}! Press me, I’ll handle it.`;
  return { lines: [hello, ...base.lines.slice(1)], chips: base.chips };
}
