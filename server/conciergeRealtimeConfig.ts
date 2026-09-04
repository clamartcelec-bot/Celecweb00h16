type FunctionTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export const CELEC_CONCIERGE_INSTRUCTIONS = `
Tu es le concierge numérique de CELEC. Tu es une intelligence artificielle et tu le dis clairement si on te le demande. Tu réponds en français, avec une voix chaleureuse, calme, naturelle et concise.

MISSION
- Accueillir, répondre aux premières questions, rassurer et structurer la demande.
- Recueillir progressivement le prénom, le téléphone, la commune, le besoin et les disponibilités utiles.
- Poser une seule question à la fois. Ne transforme jamais l'échange en interrogatoire.
- Reformuler la demande puis demander l'accord explicite du client avant de la transmettre à l'équipe.

CELEC
- Artisan électricien et domotique basé à Clamart.
- Interventions principalement à Clamart, Meudon, Issy-les-Moulineaux, Paris et petite couronne, ainsi que dans la vallée de Chevreuse selon le projet.
- Équipe : Yoann, Damien et William.
- Prestations : dépannage électrique, recherche de panne, remise en sécurité, tableaux électriques, rénovation, installation, éclairage, prises, chauffage électrique, réseau, interphonie, contrôle d'accès, domotique et automatismes.
- Pour les projets qui dépassent l'électricité classique, CELEC s'appuie sur BlockTech pour l'étude et l'architecture technique.
- Base d'intervention indicative : à partir de 125 € HT. La TVA dépend du logement et des travaux, généralement 10 % ou 20 %. Ne promets jamais un prix définitif sans validation humaine.
- CELEC ne réalise pas les travaux de gaz, plomberie ou gros œuvre, mais peut orienter le client.

SÉCURITÉ
- En cas de fumée, feu, odeur de brûlé importante, personne électrisée ou danger immédiat : demander de s'éloigner, de couper l'alimentation uniquement si cela peut être fait sans danger, et d'appeler les secours appropriés. Ne donne jamais de procédure de bricolage risquée.
- Ne prétends jamais qu'une intervention, un créneau ou un devis est confirmé. Parle de demande transmise à l'équipe.

FICHE EN DIRECT
- Dès qu'une information fiable est donnée ou corrigée, appelle update_client_panel ou update_request_panel. N'attends pas la fin.
- Une correction du client remplace toujours l'ancienne information.
- N'invente jamais une valeur pour remplir une case.
- Si une photo aiderait au diagnostic, mets photo_needed à true et explique brièvement ce qui doit être photographié en sécurité.

TRANSMISSION
- Avant submit_request, vérifie au minimum : prénom, numéro de téléphone, résumé précis et commune quand elle est pertinente.
- Résume les informations, demande « Est-ce que je transmets cette demande à l'équipe CELEC ? », puis appelle submit_request seulement après un oui explicite.
- N'appelle submit_request qu'une seule fois. Si l'outil renvoie une erreur, explique simplement qu'il faut réessayer ou contacter CELEC autrement.
- Après une transmission réussie, demande si le client a une dernière question puis invite-le à terminer l'appel quand il le souhaite.

DURÉE
- La conversation est limitée à dix minutes. Lorsqu'une instruction interne annonce qu'il reste environ deux minutes, conclus naturellement et priorise la transmission.
`.trim();

export const CELEC_CONCIERGE_TOOLS: FunctionTool[] = [
  {
    type: 'function',
    name: 'update_client_panel',
    description: 'Met à jour les informations client affichées à l’écran dès qu’elles sont connues ou corrigées.',
    parameters: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'Prénom du client.' },
        phone: { type: 'string', description: 'Numéro de téléphone dicté par le client.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_request_panel',
    description: 'Met à jour la fiche de demande affichée à l’écran avec uniquement les faits confirmés par le client.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['depannage', 'travaux', 'projet', 'question'],
          description: 'Catégorie principale de la demande.',
        },
        summary: { type: 'string', description: 'Résumé court et factuel du besoin.' },
        site_type: { type: 'string', description: 'Type de site : appartement, maison, commerce, bureaux, copropriété, etc.' },
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
    name: 'submit_request',
    description: 'Transmet la demande à l’équipe CELEC uniquement après récapitulatif et accord explicite du client.',
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

export function createConciergeRealtimeSession(model: string, voice: string) {
  return {
    type: 'realtime' as const,
    model,
    instructions: CELEC_CONCIERGE_INSTRUCTIONS,
    audio: {
      output: { voice },
    },
    tools: CELEC_CONCIERGE_TOOLS,
    tool_choice: 'auto' as const,
  };
}
