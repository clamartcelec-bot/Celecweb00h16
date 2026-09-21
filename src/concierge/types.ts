export type RequestCategory = 'depannage' | 'travaux' | 'projet' | 'question';
export type RequestUrgency = 'normale' | 'rapide' | 'urgente';

export interface ConciergeCard {
  id: string;
  kind: 'carnet' | 'brand';
  title: string;
  subtitle: string;
  imageUrl: string;
  brandName?: string;
}

export interface ConciergeDraft {
  firstName: string;
  lastName: string;
  phone: string;
  category: RequestCategory | '';
  summary: string;
  siteType: string;
  location: string;
  urgency: RequestUrgency | '';
  availability: string;
  callbackRequested: boolean;
  photoNeeded: boolean;
  nextStep: string;
  attachments: string[];
}

export const EMPTY_CONCIERGE_DRAFT: ConciergeDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  category: '',
  summary: '',
  siteType: '',
  location: '',
  urgency: '',
  availability: '',
  callbackRequested: false,
  photoNeeded: false,
  nextStep: '',
  attachments: [],
};

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  depannage: 'Dépannage',
  travaux: 'Travaux',
  projet: 'Projet',
  question: 'Question',
};

export const URGENCY_LABELS: Record<RequestUrgency, string> = {
  normale: 'Normale',
  rapide: 'Rapide',
  urgente: 'Urgente',
};

export function isDraftSubmittable(draft: ConciergeDraft) {
  const name = draft.lastName.trim() || draft.firstName.trim();
  const phoneDigits = draft.phone.replace(/\D/g, '');
  return Boolean(name) && phoneDigits.length >= 8 && Boolean(draft.summary.trim());
}

export interface ConciergeMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
}
