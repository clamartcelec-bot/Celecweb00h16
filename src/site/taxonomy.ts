import type { Photo } from '@/site/types';

export type FamilyId = 'electricite' | 'confort' | 'securite' | 'reseau' | 'energie';

export interface Family {
  id: FamilyId;
  name: string;
  tagline: string;
  intro: string;
  accent: string;
}

export interface Topic {
  id: string;
  name: string;
  families: FamilyId[];
  summary: string;
  keywords: string[];
  neighbors: string[];
  pending?: string;
}

export const FAMILIES: Family[] = [
  {
    id: 'electricite',
    name: 'Électricité',
    tagline: 'Une panne, un circuit, un tableau, une rénovation.',
    intro:
      'L’électricité de la maison, sur le terrain : on cherche le défaut, on reprend un circuit, on refait un tableau, on adapte l’installation quand le logement change. Et quand le projet grandit, on mène le chantier complet.',
    accent: '#e84a7f',
  },
  {
    id: 'confort',
    name: 'Confort',
    tagline: 'Des commandes qui simplifient la vie.',
    intro:
      'Lumières, volets, ambiances, scénarios : on fait travailler les équipements ensemble pour que la maison se pilote simplement, au quotidien.',
    accent: '#d9822b',
  },
  {
    id: 'securite',
    name: 'Sécurité',
    tagline: 'Alarme, vidéo, interphonie, accès.',
    intro:
      'Une installation de sécurité que vous comprenez, que vous gérez vous-même et que l’on peut suivre dans le temps.',
    accent: '#2d6cdf',
  },
  {
    id: 'reseau',
    name: 'Réseau',
    tagline: 'Wi-Fi, câblage, équipements qui communiquent.',
    intro:
      'Le réseau relie caméras, domotique et objets connectés. On le met au propre, on le configure et on l’entretient pour qu’il reste lisible.',
    accent: '#0f9b8e',
  },
  {
    id: 'energie',
    name: 'Énergie',
    tagline: 'Produire, consommer, répartir, piloter.',
    intro:
      'Bornes de recharge, suivi des consommations, gestion de puissance, pilotage du chauffage : comprendre où va l’énergie pour mieux maîtriser ses usages.',
    accent: '#3f9b3a',
  },
];

export const TOPICS: Topic[] = [
  { id: 'depannage', name: 'Dépannage', families: ['electricite'], summary: 'Recherche de défaut et remise en service, au plus près de chez vous.', keywords: ['depann', 'panne', 'defaut', 'disjonct', 'coupure', 'court-circuit', 'court circuit', 'saute', 'differentiel', 'fuite'], neighbors: ['tableau', 'prises', 'entretien'] },
  { id: 'tableau', name: 'Tableau électrique', families: ['electricite'], summary: 'Création, remplacement et mise en sécurité de tableaux.', keywords: ['tableau', 'disjoncteur', 'differentiel', 'interrupteur differentiel', 'rangee', 'peigne', 'coffret', 'parafoudre', 'gtl'], neighbors: ['depannage', 'renovation', 'puissance'] },
  { id: 'prises', name: 'Prises & circuits', families: ['electricite'], summary: 'Ajout ou reprise de prises, lignes et circuits dédiés.', keywords: ['prise', 'circuit', 'nouvelle ligne', 'gaine', 'goulotte', 'interrupteur', 'point lumineux'], neighbors: ['depannage', 'renovation', 'eclairage'] },
  { id: 'renovation', name: 'Rénovation', families: ['electricite'], summary: 'Reprise complète ou partielle d’une installation lors de travaux.', keywords: ['renov', 'mise aux normes', 'mise en securite', 'normes', 'nf c 15-100', 'refection', 'renover', 'refait a neuf'], neighbors: ['tableau', 'prises', 'eclairage'] },
  { id: 'projet', name: 'Projets avec architecte', families: ['electricite'], summary: 'Des projets conçus avec un architecte et un bureau d’études, réalisés par notre équipe.', keywords: ['architecte', 'bureau d etude', 'conception', 'blocktech', 'maitre d oeuvre'], neighbors: ['renovation', 'domotique', 'reseau-local'] },
  { id: 'eclairage', name: 'Éclairage & ambiances', families: ['confort', 'electricite'], summary: 'Lumière, variation et ambiances adaptées à chaque pièce.', keywords: ['eclairage', 'lumiere', 'luminaire', 'spot', ' led', 'ruban', 'variat', 'dimm', 'suspension', 'applique', 'lampe'], neighbors: ['domotique', 'prises'] },
  { id: 'domotique', name: 'Domotique & scénarios', families: ['confort'], summary: 'Les équipements travaillent ensemble pour simplifier les usages.', keywords: ['domoti', 'knx', 'scenario', 'centralis', 'automat', 'connecte', 'smart', 'zigbee', 'home assistant', 'legrand with netatmo', 'with netatmo', 'pilotage'], neighbors: ['eclairage', 'volets', 'reseau-local', 'chauffage'] },
  { id: 'volets', name: 'Volets & motorisations', families: ['confort'], summary: 'Volets roulants, stores et commandes centralisées.', keywords: ['volet', 'store', 'motoris', 'somfy', 'roulant'], neighbors: ['domotique', 'portail'] },
  { id: 'chauffage', name: 'Chauffage & climatisation', families: ['confort', 'energie'], summary: 'Température souhaitée et pilotage des équipements.', keywords: ['chauffage', 'radiateur', 'thermostat', 'climatis', 'clim', 'pompe a chaleur', 'chauffe-eau', 'ballon', 'ventilation', 'vmc', 'seche-serviette'], neighbors: ['domotique', 'suivi-conso', 'puissance'], pending: 'Le périmètre exact de CELEC sur la climatisation reste à confirmer.' },
  { id: 'alarme', name: 'Alarme', families: ['securite'], summary: 'Une alarme actuelle, simple à utiliser, que vous gérez vous-même.', keywords: ['alarme', 'ajax', 'intrusion', 'detecteur', 'sirene', 'hub'], neighbors: ['video', 'acces', 'reseau-local', 'entretien'] },
  { id: 'video', name: 'Vidéosurveillance', families: ['securite', 'reseau'], summary: 'Caméras raccordées et consultables, avec un réseau propre.', keywords: ['camera', 'video', 'surveillance', 'nvr', 'enregistreur', 'hikvision', 'dahua'], neighbors: ['alarme', 'reseau-local', 'acces'] },
  { id: 'acces', name: 'Interphonie & accès', families: ['securite'], summary: 'Interphones, visiophones et contrôle d’accès.', keywords: ['interphon', 'visiophon', 'portier', 'controle d', 'badge', 'digicode', 'gache', 'ventouse', 'urmet', 'comelit', 'bticino'], neighbors: ['portail', 'video', 'alarme'] },
  { id: 'portail', name: 'Portails : partie électrique', families: ['securite', 'confort'], summary: 'Alimentation, commandes et motorisation, en lien avec le professionnel du portail.', keywords: ['portail', 'portillon', 'barriere', 'motorisation de portail'], neighbors: ['acces', 'volets'] },
  { id: 'reseau-local', name: 'Wi-Fi & câblage', families: ['reseau'], summary: 'Wi-Fi, baie, prises RJ45 et équipements bien reliés.', keywords: ['reseau', 'wifi', 'wi-fi', 'rj45', 'switch', 'box', 'ethernet', 'fibre', 'baie de brassage', 'brassage', 'unifi', 'ubiquiti', 'borne wifi', 'point d acces'], neighbors: ['video', 'domotique', 'supervision'] },
  { id: 'supervision', name: 'Supervision & suivi', families: ['reseau', 'energie'], summary: 'Garder un œil sur les équipements et intervenir à distance quand c’est possible.', keywords: ['supervis', 'a distance', 'monitor', 'notification'], neighbors: ['reseau-local', 'suivi-conso', 'entretien'] },
  { id: 'recharge', name: 'Bornes de recharge', families: ['energie', 'electricite'], summary: 'Installation et alimentation de bornes pour véhicules électriques.', keywords: ['borne', 'recharge', 'irve', 'vehicule electrique', 'wallbox', 'voiture'], neighbors: ['puissance', 'tableau', 'suivi-conso'] },
  { id: 'suivi-conso', name: 'Suivi des consommations', families: ['energie'], summary: 'Comprendre où va l’énergie pour mieux maîtriser ses usages.', keywords: ['consommation', 'compteur', 'linky', 'consommations', 'ecocompteur', 'sous-compteur'], neighbors: ['puissance', 'chauffage', 'supervision'] },
  { id: 'puissance', name: 'Gestion de puissance', families: ['energie'], summary: 'Répartir la puissance disponible entre les usages.', keywords: ['puissance', 'delest', 'abonnement', 'kva', 'triphase', 'monophase', 'repartition'], neighbors: ['recharge', 'suivi-conso', 'tableau'] },
  { id: 'photovoltaique', name: 'Photovoltaïque', families: ['energie'], summary: 'Production solaire et son raccordement.', keywords: ['photovolta', 'solaire', 'panneau solaire', 'onduleur', 'autoconsommation'], neighbors: ['suivi-conso', 'puissance'], pending: 'Le périmètre exact de CELEC sur le photovoltaïque reste à confirmer.' },
  { id: 'entretien', name: 'Entretien & suivi', families: ['electricite', 'confort', 'securite', 'reseau', 'energie'], summary: 'Une installation se conçoit, puis s’entretient et évolue.', keywords: ['entretien', 'maintenance', 'contrat', 'contrat d entretien', 'visite annuelle', 'mise a jour'], neighbors: ['depannage', 'alarme', 'supervision'] },
];

export type FamilyKey = FamilyId | 'entretien';

export const isFamilyKey = (v: string | null): v is FamilyKey =>
  v === 'entretien' || FAMILIES.some((f) => f.id === v);

export const topicById = (id: string) => TOPICS.find((t) => t.id === id) ?? null;
export const familyById = (id: string) => FAMILIES.find((f) => f.id === id) ?? null;
export const topicsOfFamily = (id: FamilyId) => TOPICS.filter((t) => t.families.includes(id));

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ');

export function classifyText(text: string): string[] {
  const hay = ` ${normalize(text)}`;
  return TOPICS.filter((t) => t.keywords.some((k) => hay.includes(normalize(k)))).map((t) => t.id);
}

export function entryText(p: Photo): string {
  return [p.title, p.description, p.ai_summary, (p.detected_brands ?? []).join(' ')].filter(Boolean).join(' ');
}

export function topicsOf(p: Photo): string[] {
  if (p.topics && p.topics.length > 0) return p.topics;
  return classifyText(entryText(p));
}

export function familiesOf(p: Photo): FamilyId[] {
  const set = new Set<FamilyId>();
  topicsOf(p).forEach((id) => topicById(id)?.families.forEach((f) => set.add(f)));
  return [...set];
}
