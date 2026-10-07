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
  facts?: CompanyFact[];
}

export interface CompanyFact {
  key: string;
  label: string;
  value: string;
  detail: string;
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
    name: 'show_info',
    description:
      'Affiche à l’écran un encart clair qui structure ce que tu expliques : points clés, étapes, éléments à préparer ou coordonnées. À utiliser quand un visuel aide le client à retenir, en complément de ton explication orale.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['info', 'steps', 'checklist', 'contact'],
          description: 'info = points clés, steps = étapes dans l’ordre, checklist = éléments à préparer, contact = comment joindre CELEC.',
        },
        title: { type: 'string', description: 'Titre court de l’encart (6 mots maximum).' },
        points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entre 2 et 5 points très courts, factuels, issus de tes informations. N’invente rien.',
        },
        note: { type: 'string', description: 'Phrase facultative en bas de l’encart, par exemple la suite proposée.' },
      },
      required: ['kind', 'title', 'points'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'show_fact',
    description:
      'Épingle à l’écran une ou plusieurs balises de la FICHE SOCIÉTÉ (horaires, zone, rappel…). La balise reste visible pendant tout l’appel. À utiliser dès que tu réponds avec une information de la fiche.',
    parameters: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Clés exactes des informations de la FICHE SOCIÉTÉ à épingler (1 à 3).',
        },
      },
      required: ['keys'],
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
        first_name: { type: 'string', description: 'Nom ou prénom, seulement si le client l’a donné.' },
        phone: { type: 'string', description: 'Téléphone confirmé.' },
        category: { type: 'string', enum: ['depannage', 'travaux', 'projet', 'question'] },
        summary: { type: 'string', description: 'Objet à transmettre. S’il n’a pas été formulé, résume toi-même la question du client en une phrase.' },
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
      required: ['phone', 'summary', 'explicit_confirmed'],
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

  const greeting = text(settings?.greeting);

  const sections: string[] = [prompt];
  const facts = (settings?.facts ?? []).filter((fact) => fact.key && fact.value);

  if (greeting) {
    sections.push(
      `DÉBUT DE CONVERSATION\n- Au tout début de l'appel, avant toute autre chose, tu DOIS prononcer exactement cette phrase d'accueil, naturellement et sans la lire:\n« ${greeting} »\n- Ne dis rien d'autre avant cette phrase. Ne la récite pas mécaniquement : dis-la comme si tu accueillais quelqu'un qui vient d'arriver.\n- Après l'accueil, tu attends la réponse du client.`,
    );
  }

  if (tone) sections.push(`TON\n- ${tone.replace(/\n+/g, '\n- ')}`);
  if (siteInfo) sections.push(`INFORMATIONS DU SITE (à citer oralement, sans afficher de carte)\n${siteInfo}`);
  sections.push(
    [
      'TON INTENTION',
      '- Tu es là pour trois choses : renseigner, discuter et montrer. Chaque réponse suit ce fil : tu réponds simplement à l’oral, tu montres un visuel quand il aide, puis tu proposes une suite utile.',
      '- Visuels possibles : billets du carnet (search_carnet puis show_carnet_entries) pour prouver une réalisation, fiche marque (show_brand), encart show_info pour structurer une explication (étapes d’une intervention, points clés, ce qu’il faut préparer, comment joindre CELEC).',
      '- Quand tu affiches quelque chose, dis en une phrase pourquoi tu le montres, puis commente-le brièvement. Ne lis jamais l’écran mot pour mot.',
      '- Garde des réponses courtes : deux ou trois phrases à l’oral, puis laisse la parole.',
    ].join('\n'),
  );
  if (facts.length) {
    sections.push(
      [
        'FICHE SOCIÉTÉ (informations officielles et à jour de CELEC — elles priment sur tout le reste)',
        ...facts.map((fact) => `- [${fact.key}] ${fact.label} : ${fact.value}${fact.detail ? ` — ${fact.detail}` : ''}`),
        '- Quand tu réponds avec l’une de ces informations (par exemple « vous fermez à quelle heure ? »), donne la réponse à l’oral et appelle show_fact avec la clé correspondante pour l’épingler à l’écran.',
        '- N’invente jamais d’horaire, de tarif ou de zone qui ne figure pas dans cette fiche.',
      ].join('\n'),
    );
  }
  sections.push(
    [
      'QUAND TU N’AS PAS LA RÉPONSE',
      '- Ne dis jamais que tu es bloqué, que tu ne peux pas aider ou que tu es sans réponse.',
      '- Propose aussitôt de faire suivre la question : « Je n’ai pas cette information sous la main, mais je peux la transmettre tout de suite : donnez-moi simplement votre numéro, et l’équipe vous répond par SMS ou par téléphone dès que possible. »',
      '- C’est la même chose pour un chiffrage, un devis, un horaire, une disponibilité ou un tarif : le numéro de téléphone suffit pour que l’équipe rappelle.',
      '- Dès que le client accepte, appelle begin_appointment_flow avec callback_requested à true, puis update_client_panel avec le numéro et l’objet (sa question, résumée par toi en une phrase).',
    ].join('\n'),
  );
  sections.push(
    `RÈGLES D’AFFICHAGE\n- Affiche au maximum ${maxCards} carte${maxCards > 1 ? 's' : ''} par réponse.\n- Les cartes affichées justifient ta réponse : jamais de carte sans explication à l’oral, jamais d’explication visuelle sans carte.\n- Si les informations du site comportent une mention « À COMPLÉTER », ne l’invente jamais : propose de transmettre la question avec le numéro du client pour que l’équipe confirme.`,
  );
  sections.push(
    [
      'PRISE DE RENDEZ-VOUS',
      '- Dès que le client veut un rendez-vous ou être rappelé, appelle begin_appointment_flow et passe directement à la prise de rendez-vous.',
      '- N’annonce jamais que tu changes de mode et ne prononce jamais les mots « mode rendez-vous ». Ne dis pas non plus que tu arrêtes de répondre. Enchaîne naturellement : « Très bien, on prend vos coordonnées et un rappel vous sera proposé. »',
      '- Quand begin_appointment_flow est actif, la prise de rendez-vous est ta seule occupation. Tu ne parles plus du carnet, des marques ni du site, et tu n’affiches plus rien d’autre que la fiche.',
      `- Si le client veut parler d’autre chose, propose-lui de sortir de la prise de rendez-vous : la fiche est déjà enregistrée, il peut cliquer sur « Sortir de la prise de rendez-vous », ou te demander de le faire. Appelle alors end_appointment_flow. Dis-le en une phrase simple, sans annoncer de « mode » : « ${focus || 'Votre demande est là, on ne la perd pas : on peut sortir de la prise de rendez-vous quand vous voulez.'} »`,
      '- Une fois sorti de la prise de rendez-vous, la fiche reste à l’écran et peut être renvoyée si le client corrige une information.',
      '- Le numéro de téléphone est la seule information obligatoire. L’objet est utile : s’il n’a pas été formulé clairement, résume toi-même la demande en une phrase. Le nom et l’adresse sont facultatifs.',
      '- Dès que le client corrige ou donne une information (nom, téléphone, adresse, objet), appelle immédiatement l’outil de mise à jour avec la valeur corrigée, avant même de répondre à l’oral. Ne regroupe pas les corrections pour plus tard et n’attends pas la fin de la phrase.',
      '- Après une correction, la demande peut être renvoyée : si le client confirme, appelle submit_request avec explicit_confirmed à true et les informations à jour.',
      '- Tu peux demander le nom une seule fois, poliment, sans insister. Si le client ne le donne pas, la demande part quand même.',
      '- Dès que tu as le numéro, fais un récapitulatif très court et demande l’accord pour transmettre.',
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
