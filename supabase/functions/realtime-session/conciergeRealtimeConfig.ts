type FunctionTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export interface ConciergeSettings {
  greeting?: string | null;
  tone?: string | null;
  prompt?: string | null;
  site_info?: string | null;
  focus_message?: string | null;
  max_cards?: number | null;
  show_brand_cards?: boolean | null;
  voice?: string | null;
  enabled?: boolean | null;
}

export const DEFAULT_CONCIERGE_VOICE = 'coral';

export const CELEC_CONCIERGE_TOOLS: FunctionTool[] = [
  {
    type: 'function',
    name: 'update_client_panel',
    description: 'Met à jour les informations client affichées à l’écran dès qu’elles sont connues ou corrigées.',
    parameters: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'Prénom du client.' },
        last_name: { type: 'string', description: 'Nom de famille du client.' },
        phone: { type: 'string', description: 'Numéro de téléphone dicté par le client.' },
        summary: {
          type: 'string',
          description: 'Objet de l’appel en une phrase, tel que le client l’a formulé.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_request_panel',
    description:
      'Met à jour la fiche de demande affichée à l’écran avec uniquement les faits confirmés par le client.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['depannage', 'travaux', 'projet', 'question'],
          description: 'Catégorie principale de la demande.',
        },
        summary: { type: 'string', description: 'Résumé court et factuel du besoin.' },
        site_type: {
          type: 'string',
          description: 'Type de site : appartement, maison, commerce, bureaux, copropriété, etc.',
        },
        location: { type: 'string', description: 'Commune ou adresse approximative utile à l’intervention.' },
        urgency: {
          type: 'string',
          enum: ['normale', 'rapide', 'urgente'],
          description: 'Niveau d’urgence confirmé par la situation.',
        },
        availability: { type: 'string', description: 'Disponibilités exprimées par le client.' },
        callback_requested: { type: 'boolean', description: 'Le client souhaite être rappelé.' },
        photo_needed: { type: 'boolean', description: 'Une photo aiderait à qualifier la demande.' },
        next_step: { type: 'string', description: 'Prochaine étape convenue avec le client.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_carnet',
    description:
      'Cherche dans les billets publiés du carnet CELEC. À utiliser dès que le client pose une question précise sur une marque, un type de matériel ou une intervention déjà réalisée.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Mots clés à chercher dans le carnet : marque, matériel, type de travaux ou commune (par exemple « Legrand », « déplacement de prise », « tableau électrique Clamart »).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'show_carnet_entries',
    description:
      'Affiche à l’écran des billets du carnet en preuve visuelle de ce que tu viens de dire. Utilise uniquement les identifiants renvoyés par search_carnet.',
    parameters: {
      type: 'object',
      properties: {
        entry_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Identifiants des billets à afficher, dans l’ordre de pertinence.',
        },
        intro: {
          type: 'string',
          description: 'Phrase courte disant au client ce que tu affiches.',
        },
      },
      required: ['entry_ids'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'show_brand',
    description:
      'Affiche la fiche d’une marque partenaire à l’écran quand le client cite cette marque. N’appelle cet outil que si la marque figure dans la liste des marques travaillées fournie en contexte.',
    parameters: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'Nom de la marque citée par le client, tel qu’il la nomme.' },
      },
      required: ['brand'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'begin_appointment_flow',
    description:
      'Passe en mode rendez-vous dès que le client veut être contacté ou fixer un rendez-vous. À partir de cet instant, tu ne traites plus les questions sur le site.',
    parameters: {
      type: 'object',
      properties: {
        callback_requested: {
          type: 'boolean',
          description: 'True si le client a demandé à être rappelé par téléphone.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'end_appointment_flow',
    description:
      'Sort de la prise de rendez-vous quand le client veut revenir aux questions sur le site, les marques ou le carnet. La fiche reste enregistrée et peut être renvoyée plus tard si elle change.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'submit_request',
    description:
      'Transmet la demande à l’équipe CELEC uniquement après récapitulatif et accord explicite du client.',
    parameters: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'Prénom confirmé.' },
        phone: { type: 'string', description: 'Téléphone confirmé.' },
        category: { type: 'string', enum: ['depannage', 'travaux', 'projet', 'question'] },
        summary: { type: 'string', description: 'Résumé précis à transmettre.' },
        site_type: { type: 'string' },
        location: { type: 'string' },
        urgency: { type: 'string', enum: ['normale', 'rapide', 'urgente'] },
        availability: { type: 'string' },
        callback_requested: { type: 'boolean' },
        explicit_confirmed: {
          type: 'boolean',
          description: 'Doit être true uniquement si le client vient d’autoriser la transmission.',
        },
      },
      required: ['first_name', 'phone', 'category', 'summary', 'explicit_confirmed'],
      additionalProperties: false,
    },
  },
];

function text(value: string | null | undefined, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function buildConciergeInstructions(settings: ConciergeSettings | null): string {
  const prompt = text(settings?.prompt, 'Tu es le concierge numérique de CELEC. Tu réponds en français, avec une voix chaleureuse, calme, naturelle et concise.');
  const tone = text(settings?.tone);
  const siteInfo = text(settings?.site_info);
  const focus = text(settings?.focus_message);
  const maxCards = Number.isFinite(settings?.max_cards) ? Math.min(Math.max(Number(settings?.max_cards), 1), 6) : 3;

  const sections: string[] = [prompt];

  if (tone) sections.push(`TON\n- ${tone.replace(/\n+/g, '\n- ')}`);
  if (siteInfo) sections.push(`INFORMATIONS DU SITE (à citer oralement, sans afficher de carte)\n${siteInfo}`);
  sections.push(
    `RÈGLES D’AFFICHAGE\n- Affiche au maximum ${maxCards} carte${maxCards > 1 ? 's' : ''} par réponse.\n- Les cartes affichées justifient ta réponse : jamais de carte sans explication à l’oral, jamais d’explication visuelle sans carte.\n- Si les informations du site comportent une mention « À COMPLÉTER », ne l’invente jamais : dis simplement que l’équipe confirmera.`,
  );
  sections.push(
    [
      'PRISE DE RENDEZ-VOUS',
      '- Dès que le client veut un rendez-vous ou être rappelé, appelle begin_appointment_flow et passe directement à la prise de rendez-vous.',
      '- N’annonce jamais que tu changes de mode et ne prononce jamais les mots « mode rendez-vous ». Ne dis pas non plus que tu arrêtes de répondre. Enchaîne naturellement : « Très bien, on prend vos coordonnées et un rappel vous sera proposé. »',
      '- Quand begin_appointment_flow est actif, la prise de rendez-vous est ta seule occupation. Tu ne parles plus du carnet, des marques ni du site, et tu n’affiches plus rien d’autre que la fiche.',
      `- Si le client veut parler d’autre chose, propose-lui de sortir de la prise de rendez-vous : la fiche est déjà enregistrée, il peut cliquer sur « Sortir de la prise de rendez-vous », ou te demander de le faire. Appelle alors end_appointment_flow. Dis-le en une phrase simple, sans annoncer de « mode » : « ${focus || 'Votre demande est là, on ne la perd pas : on peut sortir de la prise de rendez-vous quand vous voulez.'} »`,
      '- Une fois sorti de la prise de rendez-vous, la fiche reste à l’écran et peut être renvoyée si le client corrige une information.',
      '- Tu dois récupérer le nom, le numéro de téléphone et l’objet de l’appel. Ces trois éléments sont obligatoires. L’adresse est utile mais facultative.',
      '- Dès que le client corrige ou donne une information (nom, téléphone, adresse, objet), appelle immédiatement l’outil de mise à jour avec la valeur corrigée, avant même de répondre à l’oral. Ne regroupe pas les corrections pour plus tard et n’attends pas la fin de la phrase.',
      '- Après une correction, la demande peut être renvoyée : si le client confirme, appelle submit_request avec explicit_confirmed à true et les informations à jour.',
      '- Ne demande pas le prénom. Seul le nom compte.',
      '- Tu peux inviter le client à joindre une photo ou une courte vidéo depuis la fiche quand cela aide à comprendre la situation.',
      '- La priorité et les disponibilités ne sont utiles à la fiche que si le client les évoque spontanément. Ne les réclame pas.',
    ].join('\n'),
  );

  return sections.filter(Boolean).join('\n\n');
}

export function createConciergeRealtimeSession(
  model: string,
  voice: string,
  settings?: ConciergeSettings | null,
) {
  return {
    type: 'realtime' as const,
    model,
    instructions: buildConciergeInstructions(settings ?? null),
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe' },
      },
      output: { voice: voice || DEFAULT_CONCIERGE_VOICE },
    },
    tools: CELEC_CONCIERGE_TOOLS,
    tool_choice: 'auto' as const,
  };
}
