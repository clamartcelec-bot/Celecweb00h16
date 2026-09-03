import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Lock,
  MapPin,
  Menu,
  Mic,
  Moon,
  Phone,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Sun,
  UserRound,
  X,
  Zap,
  Wrench,
  Lightbulb,
  RotateCcw,
  Camera,
  Check,
  Star,
  ChevronDown,
  MessageCircle,
  Handshake,
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';
import { LoginModal } from '@/components/LoginModal';
import { AdminDashboard } from '@/components/AdminDashboard';
import { ClientSpace } from '@/components/ClientSpace';

type Lang = 'fr' | 'en' | 'es' | 'ar';
type View = 'home' | 'carnet' | 'partners' | 'blocktech' | 'admin-login';
type Theme = 'light' | 'dark';

interface Photo {
  id: string;
  title: string;
  city: string;
  lat: number;
  lng: number;
  description: string | null;
  author: string;
  image_url: string;
  created_at: string;
  photo_images?: { id: string; image_url: string; caption: string | null; position: number }[];
}

interface CityGroup {
  city: string;
  count: number;
  lat: number;
  lng: number;
}

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  position: number;
  published: boolean;
  created_at: string;
}

interface Comment {
  id: string;
  target_type: 'partner' | 'photo';
  target_id: string;
  user_id: string | null;
  author_name: string;
  content: string;
  rating: number | null;
  created_at: string;
}

const fr = {
  heroTitle: 'Votre \u00e9lectricien de terrain,\nautour de chez nous.',
  heroSub: 'D\u00e9pannage, travaux et installations pour les maisons, copropri\u00e9t\u00e9s et locaux professionnels.',
  question: 'Qu\u2019est-ce qui vous am\u00e8ne\u202f?',
  chips: ['Une panne', 'Des travaux', 'Un projet', 'Une question'],
  orType: 'Ou d\u00e9crivez votre besoin ici\u2026',
  send: 'Envoyer',
  voice: 'Laisser un message vocal',
  voiceSub: 'Comme sur un r\u00e9pondeur.',
  callback: '\u00catre rappel\u00e9',
  services: 'Ce que nous faisons',
  method: 'Notre m\u00e9thode',
  methodText: 'On ne repart pas de z\u00e9ro. On \u00e9coute, on documente, on garde le fil.',
  carnet: 'Le Carnet',
  carnetSub: 'Ce qu\u2019on apprend sur le terrain.',
  team: 'L\u2019\u00e9quipe',
  around: 'Autour de chez nous',
  aroundSub: 'Nos interventions, l\u00e0 o\u00f9 vous vivez.',
  contact: 'Nous contacter',
  admin: 'Espace CELEC',
  followTitle: 'Garder le fil\u202f?',
  followYes: 'Activer mon suivi',
  followNo: 'Continuer sans suivi',
  followWhy: 'Retrouvez vos demandes et l\u2019historique de votre installation.',
  sent: 'Message envoy\u00e9.',
  sentSub: 'Nous revenons vers vous rapidement.',
  close: 'Fermer',
  voiceTitle: 'Votre r\u00e9pondeur CELEC',
  voiceText: 'Apr\u00e8s le bip, expliquez-nous ce qui se passe.',
  voiceStart: 'Appuyez pour enregistrer',
  voiceStop: 'Arr\u00eater',
  voiceReady: 'Message enregistr\u00e9',
  voiceSend: 'Envoyer le message',
  voiceRetry: 'Recommencer',
  callbackTitle: 'On vous rappelle',
  callbackText: 'Laissez votre num\u00e9ro.',
  callbackSend: 'Demander un rappel',
  callbackDone: 'C\u2019est not\u00e9, on vous rappelle.',
  loginTitle: 'Espace CELEC',
  loginSub: 'Connexion r\u00e9serv\u00e9e \u00e0 l\u2019\u00e9quipe.',
  blocktechNote: 'Quand le projet d\u00e9passe l\u2019\u00e9lectricit\u00e9 classique, CELEC s\u2019appuie sur BlockTech pour l\u2019\u00e9tude et l\u2019architecture technique.',
  footer: 'CELEC \u2014 \u00c9lectricit\u00e9 de proximit\u00e9',
  partners: 'Partenaires',
  partnersSub: 'Les marques avec lesquelles on travaille.',
  contactFor: 'Je vous contacte pour\u2026',
  catDepannage: 'Un d\u00e9pannage',
  catChantier: 'Un chantier',
  catProjet: 'Un projet',
  guestSend: 'Envoyer en tant qu\u2019invit\u00e9',
  guestPhone: 'Votre num\u00e9ro de t\u00e9l\u00e9phone',
  orConnect: 'ou connectez-vous pour un suivi',
  writeComment: '\u00c9crire un avis\u2026',
  yourRating: 'Votre note',
  submitReview: 'Publier',
};

const en: typeof fr = {
  heroTitle: 'Your field electrician,\naround us.',
  heroSub: 'Troubleshooting, renovation and installations for homes, buildings and professionals.',
  question: 'What brings you here?',
  chips: ['A fault', 'Some work', 'A project', 'A question'],
  orType: 'Or describe your need here\u2026',
  send: 'Send',
  voice: 'Leave a voice message',
  voiceSub: 'Like an answering machine.',
  callback: 'Be called back',
  services: 'What we do',
  method: 'Our method',
  methodText: 'We don\u2019t start from scratch. We listen, document, keep the thread.',
  carnet: 'The Notebook',
  carnetSub: 'What we learn in the field.',
  team: 'The team',
  around: 'Around us',
  aroundSub: 'Our work, where you live.',
  contact: 'Contact us',
  admin: 'CELEC Area',
  followTitle: 'Keep the thread?',
  followYes: 'Activate my follow-up',
  followNo: 'Continue without',
  followWhy: 'Find your requests and installation history.',
  sent: 'Message sent.',
  sentSub: 'We\u2019ll get back to you soon.',
  close: 'Close',
  voiceTitle: 'Your CELEC answering machine',
  voiceText: 'After the beep, tell us what\u2019s going on.',
  voiceStart: 'Press to record',
  voiceStop: 'Stop',
  voiceReady: 'Message recorded',
  voiceSend: 'Send message',
  voiceRetry: 'Try again',
  callbackTitle: 'We\u2019ll call you back',
  callbackText: 'Leave your number.',
  callbackSend: 'Request a callback',
  callbackDone: 'Noted, we\u2019ll call you back.',
  loginTitle: 'CELEC Area',
  loginSub: 'Team access only.',
  blocktechNote: 'When a project goes beyond standard electrical work, CELEC relies on BlockTech for engineering and technical architecture.',
  footer: 'CELEC \u2014 Local electricity',
  partners: 'Partners',
  partnersSub: 'The brands we work with.',
  contactFor: 'I\u2019m contacting you for\u2026',
  catDepannage: 'Troubleshooting',
  catChantier: 'A renovation',
  catProjet: 'A project',
  guestSend: 'Send as guest',
  guestPhone: 'Your phone number',
  orConnect: 'or sign in for follow-up',
  writeComment: 'Write a review\u2026',
  yourRating: 'Your rating',
  submitReview: 'Submit',
};

const es: typeof fr = {
  heroTitle: 'Su electricista de campo,\ncerca de usted.',
  heroSub: 'Reparaciones, obras e instalaciones para viviendas, comunidades y locales profesionales.',
  question: '\u00bfQu\u00e9 le trae por aqu\u00ed?',
  chips: ['Una aver\u00eda', 'Unas obras', 'Un proyecto', 'Una pregunta'],
  orType: 'O describa su necesidad aqu\u00ed\u2026',
  send: 'Enviar',
  voice: 'Dejar un mensaje de voz',
  voiceSub: 'Como en un contestador.',
  callback: 'Que me llamen',
  services: 'Lo que hacemos',
  method: 'Nuestro m\u00e9todo',
  methodText: 'No empezamos de cero. Escuchamos, documentamos, mantenemos el hilo.',
  carnet: 'El Cuaderno',
  carnetSub: 'Lo que aprendemos en el campo.',
  team: 'El equipo',
  around: 'Cerca de nosotros',
  aroundSub: 'Nuestras intervenciones, donde usted vive.',
  contact: 'Cont\u00e1ctenos',
  admin: 'Espacio CELEC',
  followTitle: '\u00bfMantener el hilo?',
  followYes: 'Activar mi seguimiento',
  followNo: 'Continuar sin seguimiento',
  followWhy: 'Encuentre sus solicitudes y el historial de su instalaci\u00f3n.',
  sent: 'Mensaje enviado.',
  sentSub: 'Nos pondremos en contacto pronto.',
  close: 'Cerrar',
  voiceTitle: 'Su contestador CELEC',
  voiceText: 'Despu\u00e9s del pitido, cu\u00e9ntenos lo que pasa.',
  voiceStart: 'Pulse para grabar',
  voiceStop: 'Parar',
  voiceReady: 'Mensaje grabado',
  voiceSend: 'Enviar mensaje',
  voiceRetry: 'Reintentar',
  callbackTitle: 'Le devolvemos la llamada',
  callbackText: 'Deje su n\u00famero.',
  callbackSend: 'Solicitar llamada',
  callbackDone: 'Anotado, le llamamos.',
  loginTitle: 'Espacio CELEC',
  loginSub: 'Acceso reservado al equipo.',
  blocktechNote: 'Cuando un proyecto va m\u00e1s all\u00e1 de la electricidad cl\u00e1sica, CELEC se apoya en BlockTech para el estudio y la arquitectura t\u00e9cnica.',
  footer: 'CELEC \u2014 Electricidad de proximidad',
  partners: 'Socios',
  partnersSub: 'Las marcas con las que trabajamos.',
  contactFor: 'Les contacto por\u2026',
  catDepannage: 'Una aver\u00eda',
  catChantier: 'Una obra',
  catProjet: 'Un proyecto',
  guestSend: 'Enviar como invitado',
  guestPhone: 'Su n\u00famero de tel\u00e9fono',
  orConnect: 'o inicie sesi\u00f3n para seguimiento',
  writeComment: 'Escribir una rese\u00f1a\u2026',
  yourRating: 'Su nota',
  submitReview: 'Publicar',
};

const ar: typeof fr = {
  heroTitle: '\u0643\u0647\u0631\u0628\u0627\u0626\u064a\u0643\u0645 \u0627\u0644\u0645\u064a\u062f\u0627\u0646\u064a\u060c\n\u0628\u0627\u0644\u0642\u0631\u0628 \u0645\u0646\u0643\u0645.',
  heroSub: '\u0625\u0635\u0644\u0627\u062d\u0627\u062a\u060c \u0623\u0634\u063a\u0627\u0644 \u0648\u062a\u0631\u0643\u064a\u0628\u0627\u062a \u0644\u0644\u0645\u0646\u0627\u0632\u0644 \u0648\u0627\u0644\u0639\u0645\u0627\u0631\u0627\u062a \u0648\u0627\u0644\u0645\u062d\u0644\u0627\u062a \u0627\u0644\u0645\u0647\u0646\u064a\u0629.',
  question: '\u0645\u0627 \u0627\u0644\u0630\u064a \u064a\u0623\u062a\u064a \u0628\u0643\u0645\u061f',
  chips: ['\u0639\u0637\u0644', '\u0623\u0634\u063a\u0627\u0644', '\u0645\u0634\u0631\u0648\u0639', '\u0633\u0624\u0627\u0644'],
  orType: '\u0623\u0648 \u0635\u0641 \u062d\u0627\u062c\u062a\u0643 \u0647\u0646\u0627\u2026',
  send: '\u0625\u0631\u0633\u0627\u0644',
  voice: '\u062a\u0631\u0643 \u0631\u0633\u0627\u0644\u0629 \u0635\u0648\u062a\u064a\u0629',
  voiceSub: '\u0643\u0645\u0627 \u0641\u064a \u062c\u0647\u0627\u0632 \u0627\u0644\u0631\u062f.',
  callback: '\u0627\u062a\u0635\u0644\u0648\u0627 \u0628\u064a',
  services: '\u0645\u0627 \u0646\u0642\u0648\u0645 \u0628\u0647',
  method: '\u0637\u0631\u064a\u0642\u062a\u0646\u0627',
  methodText: '\u0644\u0627 \u0646\u0628\u062f\u0623 \u0645\u0646 \u0627\u0644\u0635\u0641\u0631. \u0646\u0633\u062a\u0645\u0639\u060c \u0646\u0648\u062b\u0642\u060c \u0646\u062d\u0627\u0641\u0638 \u0639\u0644\u0649 \u0627\u0644\u062e\u064a\u0637.',
  carnet: '\u0627\u0644\u062f\u0641\u062a\u0631',
  carnetSub: '\u0645\u0627 \u0646\u062a\u0639\u0644\u0645\u0647 \u0641\u064a \u0627\u0644\u0645\u064a\u062f\u0627\u0646.',
  team: '\u0627\u0644\u0641\u0631\u064a\u0642',
  around: '\u062d\u0648\u0644\u0646\u0627',
  aroundSub: '\u062a\u062f\u062e\u0644\u0627\u062a\u0646\u0627\u060c \u062d\u064a\u062b \u062a\u0639\u064a\u0634\u0648\u0646.',
  contact: '\u0627\u062a\u0635\u0644\u0648\u0627 \u0628\u0646\u0627',
  admin: '\u0641\u0636\u0627\u0621 CELEC',
  followTitle: '\u0627\u0644\u062d\u0641\u0627\u0638 \u0639\u0644\u0649 \u0627\u0644\u062e\u064a\u0637\u061f',
  followYes: '\u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629',
  followNo: '\u0645\u062a\u0627\u0628\u0639\u0629 \u0628\u062f\u0648\u0646 \u062d\u0633\u0627\u0628',
  followWhy: '\u0627\u0639\u062b\u0631 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062a\u0643 \u0648\u062a\u0627\u0631\u064a\u062e \u062a\u0631\u0643\u064a\u0628\u0643.',
  sent: '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629.',
  sentSub: '\u0633\u0646\u0639\u0648\u062f \u0625\u0644\u064a\u0643\u0645 \u0642\u0631\u064a\u0628\u0627.',
  close: '\u0625\u063a\u0644\u0627\u0642',
  voiceTitle: '\u062c\u0647\u0627\u0632 \u0627\u0644\u0631\u062f CELEC',
  voiceText: '\u0628\u0639\u062f \u0627\u0644\u0635\u0627\u0641\u0631\u0629\u060c \u0623\u062e\u0628\u0631\u0648\u0646\u0627 \u0628\u0645\u0627 \u064a\u062d\u062f\u062b.',
  voiceStart: '\u0627\u0636\u063a\u0637 \u0644\u0644\u062a\u0633\u062c\u064a\u0644',
  voiceStop: '\u0625\u064a\u0642\u0627\u0641',
  voiceReady: '\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629',
  voiceSend: '\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629',
  voiceRetry: '\u0625\u0639\u0627\u062f\u0629',
  callbackTitle: '\u0633\u0646\u0639\u0627\u0648\u062f \u0627\u0644\u0627\u062a\u0635\u0627\u0644',
  callbackText: '\u0627\u062a\u0631\u0643 \u0631\u0642\u0645\u0643.',
  callbackSend: '\u0637\u0644\u0628 \u0645\u0639\u0627\u0648\u062f\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644',
  callbackDone: '\u062a\u0645\u060c \u0633\u0646\u062a\u0635\u0644 \u0628\u0643.',
  loginTitle: '\u0641\u0636\u0627\u0621 CELEC',
  loginSub: '\u062f\u062e\u0648\u0644 \u0645\u062e\u0635\u0635 \u0644\u0644\u0641\u0631\u064a\u0642.',
  blocktechNote: '\u0639\u0646\u062f\u0645\u0627 \u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621 \u0627\u0644\u062a\u0642\u0644\u064a\u062f\u064a\u0629\u060c \u064a\u0639\u062a\u0645\u062f CELEC \u0639\u0644\u0649 BlockTech \u0644\u0644\u062f\u0631\u0627\u0633\u0629 \u0648\u0627\u0644\u0647\u0646\u062f\u0633\u0629 \u0627\u0644\u062a\u0642\u0646\u064a\u0629.',
  footer: 'CELEC \u2014 \u0643\u0647\u0631\u0628\u0627\u0621 \u0627\u0644\u0642\u0631\u0628',
  partners: '\u0627\u0644\u0634\u0631\u0643\u0627\u0621',
  partnersSub: '\u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062a \u0627\u0644\u062a\u064a \u0646\u0639\u0645\u0644 \u0645\u0639\u0647\u0627.',
  contactFor: '\u0623\u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0643\u0645 \u0628\u0634\u0623\u0646\u2026',
  catDepannage: '\u0625\u0635\u0644\u0627\u062d',
  catChantier: '\u0623\u0634\u063a\u0627\u0644',
  catProjet: '\u0645\u0634\u0631\u0648\u0639',
  guestSend: '\u0625\u0631\u0633\u0627\u0644 \u0643\u0632\u0627\u0626\u0631',
  guestPhone: '\u0631\u0642\u0645 \u0647\u0627\u062a\u0641\u0643',
  orConnect: '\u0623\u0648 \u0633\u062c\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629',
  writeComment: '\u0627\u0643\u062a\u0628 \u0631\u0623\u064a\u0643\u2026',
  yourRating: '\u062a\u0642\u064a\u064a\u0645\u0643',
  submitReview: '\u0646\u0634\u0631',
};

const copy: Record<Lang, typeof fr> = { fr, en, es, ar };

const languages: { code: Lang; flag: string; label: string }[] = [
  { code: 'fr', flag: '\ud83c\uddeb\ud83c\uddf7', label: 'Fran\u00e7ais' },
  { code: 'en', flag: '\ud83c\uddec\ud83c\udde7', label: 'English' },
  { code: 'es', flag: '\ud83c\uddea\ud83c\uddf8', label: 'Espa\u00f1ol' },
  { code: 'ar', flag: '\ud83c\uddf8\ud83c\udde6', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' },
];

const serviceList = [
  { icon: Zap, label: { fr: 'D\u00e9pannage', en: 'Troubleshooting', es: 'Reparaciones', ar: '\u0625\u0635\u0644\u0627\u062d\u0627\u062a' }, desc: 'Pannes, recherche de d\u00e9faut, remise en service.' },
  { icon: Wrench, label: { fr: 'Travaux & r\u00e9novation', en: 'Renovation', es: 'Obras y renovaci\u00f3n', ar: '\u0623\u0634\u063a\u0627\u0644 \u0648\u062a\u062c\u062f\u064a\u062f' }, desc: 'Tableaux, lignes, mise en s\u00e9curit\u00e9, remise aux normes.' },
  { icon: Lightbulb, label: { fr: 'Projets & installations', en: 'Projects', es: 'Proyectos e instalaciones', ar: '\u0645\u0634\u0627\u0631\u064a\u0639 \u0648\u062a\u0631\u0643\u064a\u0628\u0627\u062a' }, desc: '\u00c9clairage, domotique, maisons, copropri\u00e9t\u00e9s, locaux pros.' },
];

const PAGE_SIZE = 20;

const teamMembers = [
  { name: 'L\u00e9a', role: '\u00c9lectricit\u00e9 & relation client', bio: 'Elle relie les d\u00e9tails techniques aux usages du quotidien.' },
  { name: 'Marc', role: 'D\u00e9pannage & r\u00e9novation', bio: 'Il comprend pourquoi une installation raconte une autre histoire.' },
  { name: 'No\u00e9', role: 'Installations & \u00e9clairage', bio: 'Il pense les lignes et la lumi\u00e8re pour qu\u2019ils tiennent dans le temps.' },
];

/* ─── Leaflet map component ─── */
function InterventionMap({ cityGroups, theme, onCityClick, selectedCity }: { cityGroups: CityGroup[]; theme: Theme; onCityClick?: (city: string) => void; selectedCity?: string | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [48.82, 2.32],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map);
  }, [theme]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || cityGroups.length === 0) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    cityGroups.forEach(g => {
      const isSelected = selectedCity === g.city;
      const r = Math.max(10, Math.min(38, 6 + g.count * 3.5));
      const marker = L.circleMarker([g.lat, g.lng], {
        radius: isSelected ? r + 4 : r,
        fillColor: isSelected ? '#fff' : '#e8336a',
        fillOpacity: isSelected ? 0.6 : 0.35,
        color: '#e8336a',
        weight: isSelected ? 3 : 2,
      }).addTo(map);
      marker.bindTooltip(`<strong>${g.city}</strong><br/>${g.count} photo${g.count > 1 ? 's' : ''}<br/><em style="font-size:10px;opacity:.7">Cliquer pour voir</em>`, {
        direction: 'top',
        className: 'map-tooltip',
      });
      marker.on('click', () => onCityClick?.(g.city));
      markersRef.current.push(marker);
    });
  }, [cityGroups, theme, onCityClick, selectedCity]);

  return <div ref={mapRef} className="leaflet-map" />;
}

/* ─── App ─── */
function App() {
  const [lang, setLang] = useState<Lang>('fr');
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [freeText, setFreeText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [langSubOpen, setLangSubOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [telegramOk, setTelegramOk] = useState<boolean | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [carnetEntries, setCarnetEntries] = useState<Photo[]>([]);
  const [carnetLoading, setCarnetLoading] = useState(false);
  const [carnetHasMore, setCarnetHasMore] = useState(true);
  const [carnetDetail, setCarnetDetail] = useState<Photo | null>(null);
  const [mapSelectedCity, setMapSelectedCity] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [contactCategory, setContactCategory] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [voiceTime, setVoiceTime] = useState(0);
  const [guestPhone, setGuestPhone] = useState('');

  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newRating, setNewRating] = useState(0);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const carnetSentinel = useRef<HTMLDivElement>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [clientSpaceOpen, setClientSpaceOpen] = useState(false);
  const t = copy[lang];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [theme, lang]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setUserEmail(data.session.user.email);
        supabase!.from('profiles').select('role').eq('id', data.session.user.id).maybeSingle().then(({ data: prof }) => {
          if (prof?.role) setUserRole(prof.role);
        });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const email = session?.user?.email ?? null;
        setUserEmail(email);
        if (session?.user?.id && supabase) {
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
          setUserRole(prof?.role ?? null);
        } else {
          setUserRole(null);
        }
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
        setLangSubOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('photos').select('*').eq('published', true).then(({ data }) => {
      if (!data) return;
      setPhotos(data);
      const groups: Record<string, CityGroup> = {};
      data.forEach(p => {
        if (!groups[p.city]) groups[p.city] = { city: p.city, count: 0, lat: p.lat, lng: p.lng };
        groups[p.city].count++;
      });
      setCityGroups(Object.values(groups).sort((a, b) => b.count - a.count));
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('partners').select('*').eq('published', true).order('position').then(({ data }) => {
      if (data) setPartners(data);
    });
  }, []);

  const loadComments = useCallback(async (targetType: string, targetId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from('comments').select('*').eq('target_type', targetType).eq('target_id', targetId).order('created_at', { ascending: false });
    if (data) setComments(data);
  }, []);

  const submitComment = async (targetType: 'partner' | 'photo', targetId: string) => {
    if (!supabase || !newComment.trim()) return;
    setCommentSubmitting(true);
    const authorName = userEmail ? userEmail.split('@')[0] : 'Invite';
    const { error } = await supabase.from('comments').insert({
      target_type: targetType,
      target_id: targetId,
      author_name: authorName,
      content: newComment.trim(),
      rating: newRating > 0 ? newRating : null,
    });
    if (!error) {
      setNewComment('');
      setNewRating(0);
      await loadComments(targetType, targetId);
    }
    setCommentSubmitting(false);
  };

  const loadCarnetPage = useCallback(async () => {
    if (!supabase || carnetLoading || !carnetHasMore) return;
    setCarnetLoading(true);
    const { data, error } = await supabase
      .from('photos')
      .select('*, photo_images(id, image_url, caption, position)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .range(carnetEntries.length, carnetEntries.length + PAGE_SIZE - 1);
    if (!error && data) {
      setCarnetEntries(prev => [...prev, ...data]);
      if (data.length < PAGE_SIZE) setCarnetHasMore(false);
    } else {
      setCarnetHasMore(false);
    }
    setCarnetLoading(false);
  }, [carnetEntries.length, carnetLoading, carnetHasMore]);

  useEffect(() => {
    if (view === 'carnet' && carnetEntries.length === 0 && carnetHasMore) {
      loadCarnetPage();
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'carnet' || !carnetHasMore) return;
    const el = carnetSentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadCarnetPage();
    }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [view, carnetHasMore, loadCarnetPage]);

  const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const go = (v: View) => {
    setView(v);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChipClick = (index: number) => {
    const cats = ['problem', 'works', 'project', 'question'];
    setFreeText('');
    sendToDb(cats[index], t.chips[index], 'chat');
  };

  const startVoiceRecording = () => {
    setVoiceState('recording');
    setVoiceTime(0);
    voiceTimerRef.current = setInterval(() => setVoiceTime(prev => prev + 1), 1000);
  };

  const stopVoiceRecording = () => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    setVoiceState('done');
  };

  const resetVoiceRecording = () => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    setVoiceState('idle');
    setVoiceTime(0);
  };

  const fmtVoiceTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleSend = async () => {
    const cat = contactCategory || 'question';
    const catLabels: Record<string, string> = { depannage: t.catDepannage, chantier: t.catChantier, projet: t.catProjet };
    const desc = freeText.trim() || catLabels[contactCategory || ''] || cat;
    const source = voiceState === 'done' ? 'voice' : 'chat';
    const phone = !userEmail ? guestPhone.trim() : undefined;
    setSendStatus('sending');
    setTelegramOk(null);
    await sendToDb(cat, desc, source, phone);
    setContactCategory(null);
    setFreeText('');
    resetVoiceRecording();
    setGuestPhone('');

  };

  const sendToDb = async (category: string, description: string, source: string, phone?: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && anonKey) {
        const res = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            category,
            description,
            source,
            user_email: userEmail || undefined,
            guest_phone: phone,
          }),
        });
        if (!res.ok) { setSendStatus('error'); return; }
        const data = await res.json();
        setTelegramOk(data.telegram === true);
      }
      setSendStatus('sent');
      setTimeout(() => { setSendStatus('idle'); setTelegramOk(null); }, 5000);
    } catch {
      setSendStatus('error');
      setTimeout(() => setSendStatus('idle'), 4000);
    }
  };

  return (
    <div className="app">
      <header className="hdr">
        <button className="logo" onClick={() => go('home')}>CELEC<span className="logo-dot">.</span></button>
        <nav className={`nav ${menuOpen ? 'open' : ''}`}>
          <button onClick={() => go('home')}>{t.services}</button>
          <button onClick={() => go('carnet')}>{t.carnet}</button>
          <button onClick={() => go('partners')}>{t.partners}</button>
          <a href="/concierge" className="nav-concierge-link">Concierge</a>
        </nav>
        <div className="hdr-right">
          <button className="guest-btn" onClick={() => userEmail ? setClientSpaceOpen(true) : setLoginOpen(true)}>
            <UserRound size={15} />
            <span>{userEmail ? userEmail.split('@')[0] : (lang === 'fr' ? 'Invit\u00e9' : lang === 'es' ? 'Invitado' : lang === 'ar' ? '\u0632\u0627\u0626\u0631' : 'Guest')}</span>
          </button>
          <div className="settings-wrap" ref={settingsRef}>
            <button className="settings-btn" onClick={() => { setSettingsOpen(!settingsOpen); setLangSubOpen(false); }}>
              <Settings size={18} />
            </button>
            {settingsOpen && (
              <div className="settings-popup">
                <div className="settings-group">
                  <button className="settings-row" onClick={() => setLangSubOpen(!langSubOpen)}>
                    <span className="lang-flag">{languages.find(l => l.code === lang)?.flag}</span>
                    <span>{languages.find(l => l.code === lang)?.label}</span>
                    <ArrowRight size={14} className={`settings-chevron ${langSubOpen ? 'rotated' : ''}`} />
                  </button>
                  {langSubOpen && (
                    <div className="lang-sub">
                      {languages.map(l => (
                        <button
                          key={l.code}
                          className={`lang-option ${lang === l.code ? 'active' : ''}`}
                          onClick={() => { setLang(l.code); setLangSubOpen(false); setSettingsOpen(false); }}
                        >
                          <span className="lang-flag">{l.flag}</span>
                          <span>{l.label}</span>
                          {lang === l.code && <Check size={14} className="lang-check" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="settings-divider" />
                <div className="settings-group">
                  <button className="theme-option" onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); setSettingsOpen(false); }}>
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    <span>{theme === 'light' ? 'Mode sombre' : 'Mode clair'}</span>
                  </button>
                </div>
                {userRole === 'admin' && (
                  <>
                    <div className="settings-divider" />
                    <div className="settings-group">
                      <button className="theme-option" onClick={() => { setAdminOpen(true); setSettingsOpen(false); }}>
                        <ShieldCheck size={16} />
                        <span>Acc\u00e8s admin</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <button className="burger" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </header>

      <main>
        {view === 'home' && (
          <>
            {/* HERO */}
            <section className="hero hero-new">
              <div className="hero-content">
                <div className="hero-badge">CELEC<span className="logo-dot">.</span></div>
                <h1>{t.heroTitle}</h1>
                <p className="hero-sub">{t.heroSub}</p>
                <div className="hero-cats">
                  <button className="hero-cat" onClick={() => { setContactCategory('depannage'); document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' }); }}>
                    <Zap size={18} /><span>{t.catDepannage}</span>
                  </button>
                  <button className="hero-cat" onClick={() => { setContactCategory('chantier'); document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' }); }}>
                    <Wrench size={18} /><span>{t.catChantier}</span>
                  </button>
                  <button className="hero-cat" onClick={() => { setContactCategory('projet'); document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' }); }}>
                    <Lightbulb size={18} /><span>{t.catProjet}</span>
                  </button>
                </div>
              </div>
              <div className="hero-visual">
                <img src="/pink-van.webp" alt="CELEC" className="hero-van" />
                <div className="hero-map-mini" onClick={() => setMapExpanded(true)}>
                  <InterventionMap cityGroups={cityGroups} theme={theme} />
                  <div className="hero-map-label"><MapPin size={12} /> {cityGroups.length} communes <ChevronDown size={12} /></div>
                </div>
              </div>
            </section>

            {/* MAP EXPANDED */}
            {mapExpanded && (
              <section className="map-section">
                <div className="map-header">
                  <h2>{t.around}</h2>
                  <p>{t.aroundSub}</p>
                  <button className="map-close" onClick={() => setMapExpanded(false)}><X size={16} /></button>
                </div>
                <div className="map-wrap">
                  <InterventionMap
                    cityGroups={cityGroups}
                    theme={theme}
                    selectedCity={mapSelectedCity}
                    onCityClick={(city) => {
                      setMapSelectedCity(prev => prev === city ? null : city);
                    }}
                  />
                  <div className="map-legend">
                    <MapPin size={14} /> {photos.length} photos &middot; {cityGroups.length} communes
                    {mapSelectedCity && (
                      <button className="map-filter-badge" onClick={() => setMapSelectedCity(null)}>
                        <X size={12} /> {mapSelectedCity}
                      </button>
                    )}
                  </div>
                </div>
                {mapSelectedCity && (
                  <div className="map-city-entries">
                    <h3><MapPin size={14} /> {mapSelectedCity}</h3>
                    <div className="map-city-grid">
                      {photos.filter(p => p.city === mapSelectedCity).map(p => (
                        <article key={p.id} className="map-city-card" onClick={() => setCarnetDetail(p)}>
                          {p.image_url
                            ? <img src={p.image_url} alt={p.title} loading="lazy" />
                            : <div className="map-city-placeholder"><Camera size={18} /></div>}
                          <div className="map-city-overlay">
                            <h4>{p.title}</h4>
                            <span>{fmtDateShort(p.created_at)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                    {photos.filter(p => p.city === mapSelectedCity).length === 0 && (
                      <p className="map-city-empty">Aucune photo pour cette ville.</p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* CONTACT BOX */}
            <section className="sec" id="contact-box">
              <div className="cb-card">
                <div className="cb-header">
                  <h2>{t.contactFor}</h2>
                  <div className="cb-cats">
                    {(['depannage', 'chantier', 'projet'] as const).map(cat => (
                      <button
                        key={cat}
                        className={`cb-cat ${contactCategory === cat ? 'active' : ''}`}
                        onClick={() => setContactCategory(contactCategory === cat ? null : cat)}
                      >
                        {cat === 'depannage' && <Zap size={16} />}
                        {cat === 'chantier' && <Wrench size={16} />}
                        {cat === 'projet' && <Lightbulb size={16} />}
                        <span>{cat === 'depannage' ? t.catDepannage : cat === 'chantier' ? t.catChantier : t.catProjet}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="cb-compose">
                  <textarea
                    className="cb-textarea"
                    placeholder={t.orType}
                    value={freeText}
                    onChange={e => setFreeText(e.target.value)}
                    rows={3}
                  />
                  {voiceState !== 'idle' && (
                    <div className="cb-voice-inline">
                      {voiceState === 'recording' ? (
                        <>
                          <span className="cb-rec-dot pulsing" />
                          <span className="cb-rec-time">{fmtVoiceTime(voiceTime)}</span>
                          <button className="cb-rec-stop" onClick={stopVoiceRecording}><Square size={12} /> {t.voiceStop}</button>
                        </>
                      ) : (
                        <>
                          <span className="cb-rec-done-icon" />
                          <span className="cb-rec-time">{fmtVoiceTime(voiceTime)}</span>
                          <button className="cb-rec-retry" onClick={resetVoiceRecording}><RotateCcw size={12} /> {t.voiceRetry}</button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="cb-bottom-row">
                    <button className="cb-voice" onClick={() => voiceState === 'idle' ? startVoiceRecording() : voiceState === 'recording' ? stopVoiceRecording() : resetVoiceRecording()}>
                      {voiceState === 'idle' ? <><span className="cb-rec-icon" /> <span>{t.voice}</span></> : voiceState === 'recording' ? <><Square size={14} /> <span>{t.voiceStop}</span></> : <><RotateCcw size={14} /> <span>{t.voiceRetry}</span></>}
                    </button>
                    {userEmail && (
                      <button
                        className="cb-send-btn"
                        onClick={handleSend}
                        disabled={!freeText.trim() && !contactCategory && voiceState !== 'done'}
                      >
                        <Send size={16} />
                        <span>{t.send}</span>
                      </button>
                    )}
                  </div>
                </div>
                {sendStatus === 'sent' && (
                  <div className="cb-confirm-inline">
                    <CheckCircle2 size={15} />
                    <span>
                      {t.sent}{' '}
                      {telegramOk === true && <span className="cb-confirm-sub">— notifie sur Telegram</span>}
                      {telegramOk === false && <span className="cb-confirm-sub">— enregistre (Telegram en attente)</span>}
                    </span>
                  </div>
                )}
                {sendStatus === 'error' && (
                  <div className="cb-confirm-inline cb-confirm-error">
                    <AlertCircle size={15} />
                    <span>Erreur d'envoi, réessayez.</span>
                  </div>
                )}
                {sendStatus === 'sending' && (
                  <div className="cb-confirm-inline cb-confirm-sending">
                    <Loader2 size={15} className="cb-spin" />
                    <span>Envoi en cours...</span>
                  </div>
                )}
                {userEmail ? (
                  <div className="cb-account-info">
                    <UserRound size={13} />
                    <span>{userEmail.split('@')[0]}</span>
                  </div>
                ) : (
                  <div className="cb-guest-footer">
                    <button className="cb-connect-cta" onClick={() => setLoginOpen(true)}>
                      <UserRound size={16} />
                      <span>{t.orConnect}</span>
                      <ArrowRight size={14} />
                    </button>
                    <div className="cb-guest-sub">
                      <input
                        className="cb-phone-field"
                        placeholder={t.guestPhone}
                        value={guestPhone}
                        onChange={e => setGuestPhone(e.target.value)}
                      />
                      <button
                        className="cb-guest-send-icon"
                        onClick={handleSend}
                        disabled={(!freeText.trim() && !contactCategory && voiceState !== 'done') || !guestPhone.trim()}
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* SERVICES */}
            <section className="sec">
              <h2>{t.services}</h2>
              <div className="svc-grid">
                {serviceList.map((s, i) => (
                  <div className="svc-card" key={i}>
                    <s.icon size={22} className="svc-icon" />
                    <h3>{s.label[lang]}</h3>
                    <p>{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="bt-line">
                <p>{t.blocktechNote}</p>
                <button onClick={() => go('blocktech')}>BlockTech <ArrowRight size={14} /></button>
              </div>
            </section>

            {/* METHOD */}
            <section className="sec sec-alt">
              <h2>{t.method}</h2>
              <p className="sec-text">{t.methodText}</p>
              <div className="steps">
                {['\u00c9couter', 'Comprendre', 'Documenter', 'Garder le fil'].map((s, i) => (
                  <div className="step" key={i}><span className="step-n">0{i + 1}</span><span>{s}</span></div>
                ))}
              </div>
            </section>

            {/* CARNET PREVIEW */}
            <section className="sec">
              <div className="sec-row">
                <div><h2>{t.carnet}</h2><p className="sec-sub">{t.carnetSub}</p></div>
                <button className="see-all" onClick={() => go('carnet')}>Voir tout <ArrowRight size={14} /></button>
              </div>
              <div className="bento-preview">
                {photos.slice(0, 4).map((p, i) => (
                  <article className={`bento-prev-card bento-prev-${i}`} key={p.id} onClick={() => go('carnet')}>
                    {p.image_url
                      ? <img src={p.image_url} alt={p.title} loading="lazy" />
                      : <div className="bento-prev-placeholder"><Camera size={24} /></div>}
                    <div className="bento-prev-overlay">
                      {p.city && <span className="bento-prev-city"><MapPin size={10} /> {p.city}</span>}
                      <h3>{p.title}</h3>
                      <span className="bento-prev-author">{p.author || 'CELEC'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* TEAM */}
            <section className="sec sec-alt">
              <h2>{t.team}</h2>
              <div className="team-row">
                {teamMembers.map((m, i) => (
                  <div className="team-card" key={i}>
                    <div className="avatar"><UserRound size={32} /></div>
                    <h3>{m.name}</h3>
                    <span className="t-role">{m.role}</span>
                    <p>{m.bio}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {view === 'carnet' && (
          <section className="sec">
            <h2>{t.carnet}</h2>
            <p className="sec-sub">{t.carnetSub}</p>
            <div className="carnet-bento">
              {carnetEntries.map((entry, i) => {
                const mainImg = entry.image_url || entry.photo_images?.[0]?.image_url;
                const desc = entry.description || '';
                const truncated = desc.length > 90;
                const sizeClass = i % 7 === 0 ? 'cn-lg' : i % 7 === 3 ? 'cn-wide' : i % 5 === 4 ? 'cn-tall' : 'cn-md';
                return (
                  <article
                    className={`cn-card ${sizeClass}`}
                    key={entry.id}
                    onClick={() => setCarnetDetail(entry)}
                  >
                    {mainImg
                      ? <img src={mainImg} alt={entry.title} loading="lazy" className="cn-img" />
                      : <div className="cn-placeholder"><Camera size={28} /></div>}
                    <div className="cn-overlay">
                      {entry.city && <span className="cn-city"><MapPin size={10} /> {entry.city}</span>}
                      <h3>{entry.title}</h3>
                      {desc && <p className="cn-desc">{truncated ? desc.slice(0, 90) + '...' : desc}</p>}
                      <div className="cn-meta">
                        <span>{entry.author || 'CELEC'}</span>
                        <span>&middot;</span>
                        <span>{fmtDateShort(entry.created_at)}</span>
                      </div>
                      {truncated && <span className="cn-more">Voir plus</span>}
                    </div>
                  </article>
                );
              })}
            </div>
            {carnetLoading && <div className="carnet-loader"><div className="carnet-spinner" /></div>}
            {!carnetHasMore && carnetEntries.length > 0 && (
              <p className="carnet-end">Tout le carnet est affiche.</p>
            )}
            {!carnetLoading && !carnetHasMore && carnetEntries.length === 0 && (
              <p className="carnet-end">Le carnet est vide pour le moment.</p>
            )}
            <div ref={carnetSentinel} className="carnet-sentinel" />
          </section>
        )}

        {carnetDetail && (
          <div className="overlay" onClick={() => { setCarnetDetail(null); setComments([]); setNewComment(''); setNewRating(0); }}>
            <div className="carnet-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-x" onClick={() => { setCarnetDetail(null); setComments([]); setNewComment(''); setNewRating(0); }}><X size={18} /></button>
              {(carnetDetail.image_url || carnetDetail.photo_images?.[0]?.image_url) && (
                <div className="cm-hero">
                  <img src={carnetDetail.image_url || carnetDetail.photo_images![0].image_url} alt={carnetDetail.title} />
                </div>
              )}
              <div className="cm-body">
                <div className="cm-meta">
                  <span>{carnetDetail.author || 'CELEC'}</span>
                  <span>&middot;</span>
                  <span>{fmtDateShort(carnetDetail.created_at)}</span>
                  {carnetDetail.city && <><span>&middot;</span><MapPin size={12} /><span>{carnetDetail.city}</span></>}
                </div>
                <h2>{carnetDetail.title}</h2>
                {carnetDetail.description && <p className="cm-desc">{carnetDetail.description}</p>}
                {(carnetDetail.photo_images?.length ?? 0) > 1 && (
                  <div className="cm-gallery">
                    {carnetDetail.photo_images!.sort((a, b) => a.position - b.position).map(img => (
                      <div className="cm-gallery-item" key={img.id}>
                        <img src={img.image_url} alt={img.caption || ''} loading="lazy" />
                        {img.caption && <span>{img.caption}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {/* Comments section */}
                <div className="cm-comments">
                  <h3><MessageCircle size={16} /> Avis</h3>
                  <button className="cm-load-comments" onClick={() => loadComments('photo', carnetDetail.id)}>Charger les avis</button>
                  {comments.length > 0 && (
                    <div className="cm-comment-list">
                      {comments.map(c => (
                        <div className="cm-comment" key={c.id}>
                          <div className="cm-comment-head">
                            <strong>{c.author_name}</strong>
                            <span>{fmtDateShort(c.created_at)}</span>
                            {c.rating && <span className="cm-stars">{'\u2605'.repeat(c.rating)}{'\u2606'.repeat(5 - c.rating)}</span>}
                          </div>
                          <p>{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="cm-add-comment">
                    <div className="cm-rating-row">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} className={`cm-star ${s <= newRating ? 'active' : ''}`} onClick={() => setNewRating(s === newRating ? 0 : s)}>
                          <Star size={16} />
                        </button>
                      ))}
                    </div>
                    <textarea className="field cm-comment-input" placeholder={t.writeComment} value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} />
                    <button className="btn-pink cm-submit" onClick={() => submitComment('photo', carnetDetail.id)} disabled={commentSubmitting || !newComment.trim()}>
                      {t.submitReview}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'partners' && (
          <section className="sec">
            <h2>{t.partners}</h2>
            <p className="sec-sub">{t.partnersSub}</p>
            <div className="partners-bento">
              {partners.map((p, i) => {
                const sizeClass = i % 5 === 0 ? 'pb-lg' : i % 5 === 2 ? 'pb-wide' : 'pb-md';
                return (
                  <article className={`pb-card ${sizeClass}`} key={p.id} onClick={() => { setCarnetDetail(null); loadComments('partner', p.id); }}>
                    {p.logo_url
                      ? <img src={p.logo_url} alt={p.name} className="pb-logo" />
                      : <div className="pb-logo-placeholder"><Handshake size={32} /></div>}
                    <div className="pb-overlay">
                      <h3>{p.name}</h3>
                      {p.description && <p className="pb-desc">{p.description.length > 80 ? p.description.slice(0, 80) + '...' : p.description}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
            {partners.length === 0 && <p className="carnet-end">Aucun partenaire pour le moment.</p>}

            {/* Partner detail with comments - shown when comments loaded and no carnet detail */}
            {comments.length > 0 && !carnetDetail && (() => {
              const targetId = comments[0]?.target_id;
              const partner = partners.find(p => p.id === targetId);
              if (!partner) return null;
              return (
                <div className="overlay" onClick={() => { setComments([]); setNewComment(''); setNewRating(0); }}>
                  <div className="carnet-modal" onClick={e => e.stopPropagation()}>
                    <button className="modal-x" onClick={() => { setComments([]); setNewComment(''); setNewRating(0); }}><X size={18} /></button>
                    {partner.logo_url && (
                      <div className="cm-hero pb-modal-logo">
                        <img src={partner.logo_url} alt={partner.name} />
                      </div>
                    )}
                    <div className="cm-body">
                      <h2>{partner.name}</h2>
                      {partner.description && <p className="cm-desc">{partner.description}</p>}
                      <div className="cm-comments">
                        <h3><MessageCircle size={16} /> Avis ({comments.length})</h3>
                        <div className="cm-comment-list">
                          {comments.map(c => (
                            <div className="cm-comment" key={c.id}>
                              <div className="cm-comment-head">
                                <strong>{c.author_name}</strong>
                                <span>{fmtDateShort(c.created_at)}</span>
                                {c.rating && <span className="cm-stars">{'\u2605'.repeat(c.rating)}{'\u2606'.repeat(5 - c.rating)}</span>}
                              </div>
                              <p>{c.content}</p>
                            </div>
                          ))}
                        </div>
                        <div className="cm-add-comment">
                          <div className="cm-rating-row">
                            {[1,2,3,4,5].map(s => (
                              <button key={s} className={`cm-star ${s <= newRating ? 'active' : ''}`} onClick={() => setNewRating(s === newRating ? 0 : s)}>
                                <Star size={16} />
                              </button>
                            ))}
                          </div>
                          <textarea className="field cm-comment-input" placeholder={t.writeComment} value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} />
                          <button className="btn-pink cm-submit" onClick={() => submitComment('partner', partner.id)} disabled={commentSubmitting || !newComment.trim()}>
                            {t.submitReview}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {view === 'blocktech' && (
          <section className="sec">
            <h2>BlockTech</h2>
            <p className="sec-text">{t.blocktechNote}</p>
            <div className="bt-duo">
              <div className="bt-card"><strong>CELEC</strong><span>Le terrain</span><ul><li>Installation</li><li>D\u00e9pannage</li><li>\u00c9lectricit\u00e9</li></ul></div>
              <span className="bt-x">&times;</span>
              <div className="bt-card bt-accent"><strong>BLOCKTECH</strong><span>L\u2019architecture</span><ul><li>\u00c9tude</li><li>R\u00e9seau</li><li>Automatisme</li></ul></div>
            </div>
          </section>
        )}

        {view === 'admin-login' && (
          <AdminLogin t={t} onSuccess={() => { setAdminOpen(true); go('home'); }} />
        )}
      </main>

      <footer className="ftr">
        <div className="ftr-main"><strong>CELEC<span className="logo-dot">.</span></strong><p>{t.footer}</p></div>
        <div className="ftr-links">
          <button onClick={() => go('carnet')}>{t.carnet}</button>
          <button onClick={() => go('partners')}>{t.partners}</button>
          <button onClick={() => go('blocktech')}>BlockTech</button>
          <button className="admin-link" onClick={() => go('admin-login')}><Lock size={11} /> {t.admin}</button>
        </div>
      </footer>

      {/* MODALS */}
      {callbackOpen && (
        <CallbackModal t={t} onClose={() => setCallbackOpen(false)} />
      )}

      {loginOpen && (
        <LoginModal lang={lang} onClose={() => setLoginOpen(false)} onAuthed={() => {}} />
      )}

      {adminOpen && (
        <AdminDashboard onClose={() => setAdminOpen(false)} />
      )}

      {clientSpaceOpen && (
        <ClientSpace onClose={() => setClientSpaceOpen(false)} onLogout={() => { setUserEmail(null); setUserRole(null); }} />
      )}

      {/* Floating contact button */}
      <button className="fab-contact" onClick={() => { go('home'); setTimeout(() => document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>
        <Phone size={22} />
      </button>
    </div>
  );
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function CallbackModal({ t, onClose }: { t: typeof fr; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');

  const handleSend = async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && anonKey) {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            category: "callback",
            description: `Rappel demande - Tel: ${phone}`,
            source: "callback",
            callback_requested: true,
          }),
        });
      }
    } catch {
      // silently fail
    }
    setSent(true);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}><X size={18} /></button>
        <Phone size={22} className="modal-top-icon" />
        <h2>{t.callbackTitle}</h2>
        <p className="modal-p">{t.callbackText}</p>
        {sent ? <p className="confirm-txt">{t.callbackDone}</p> : (
          <>
            <input className="field" placeholder="+33 6 00 00 00 00" value={phone} onChange={e => setPhone(e.target.value)} />
            <button className="btn-pink full" onClick={handleSend} disabled={!phone.trim()}>{t.callbackSend}</button>
          </>
        )}
      </div>
    </div>
  );
}

function AdminLogin({ t, onSuccess }: { t: typeof fr; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !pw || !supabase) return;
    setLoading(true);
    setError('');
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (err) { setError(err.message); setLoading(false); return; }
    const userId = signInData.user?.id;
    if (!userId) { setError('Erreur de connexion.'); setLoading(false); return; }
    const { data: prof, error: profErr } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profErr || prof?.role !== 'admin') {
      setError('Acces reserve a l\'equipe CELEC.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    setLoading(false);
    onSuccess();
  };

  return (
    <section className="sec">
      <div className="login-box">
        <Lock size={28} className="login-icon" />
        <h2>{t.loginTitle}</h2>
        <p>{t.loginSub}</p>
        <input className="field" placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="field" type="password" placeholder="Mot de passe" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
        <button className="btn-pink" onClick={handleLogin} disabled={loading || !email.trim() || !pw}>
          {loading ? '...' : 'Se connecter'}
        </button>
        {error && <p className="login-error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </section>
  );
}

export default App;
