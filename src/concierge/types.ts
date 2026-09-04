export type RequestCategory = 'depannage' | 'travaux' | 'projet' | 'question';
export type RequestUrgency = 'normale' | 'rapide' | 'urgente';

export interface ConciergeDraft {
  firstName: string;
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
}

export const EMPTY_CONCIERGE_DRAFT: ConciergeDraft = {
  firstName: '',
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
