/*
# Réglages du concierge numérique

## Résumé
Crée une table de réglages unique pour le concierge vocal de CELEC.
Tout ce qui pilote le concierge (prompt, ton, informations du site,
message de passage en mode rendez-vous, limites d'affichage) devient
modifiable depuis l'administration, sans toucher au code.

## 1. Nouvelle table : concierge_settings
- `id` (integer, clé primaire, toujours égal à 1) : une seule ligne de réglages.
- `enabled` (boolean, défaut true) : active ou désactive le concierge public.
- `greeting` (text) : phrase d'accueil utilisée à l'ouverture de l'appel.
- `tone` (text) : consigne de ton (artisan qui conseille, pas un vendeur).
- `prompt` (text) : prompt principal de comportement du concierge.
- `site_info` (text) : informations du site (horaires, zones, coordonnées,
  tarifs indicatifs) que le concierge peut citer oralement.
- `focus_message` (text) : phrase utilisée quand le concierge passe en mode
  rendez-vous et refuse de traiter autre chose en même temps.
- `max_cards` (integer, défaut 3) : nombre maximum de cartes visuelles
  affichées pour une même réponse.
- `show_brand_cards` (boolean, défaut true) : autorise l'affichage d'une carte
  de marque quand le client cite un partenaire.
- `voice` (text, défaut coral) : voix de synthèse utilisée côté OpenAI.
- `updated_at` (timestamptz) : date de dernière modification, renseignée par
  l'administration.

## 2. Données par défaut
La ligne unique est créée avec les réglages par défaut reprenant le
comportement actuel du concierge et les informations publiques de CELEC.
Les horaires et coordonnées restent à compléter par l'administrateur : le
concierge ne les invente jamais.

## 3. Sécurité
- RLS activée sur la table.
- Lecture publique (anon + authenticated) : le concierge et le site ont
  besoin de ces réglages pour fonctionner, ils ne contiennent aucun secret.
- Écriture réservée aux profils dont le rôle est `admin`, sur les quatre
  verbes (insert, update, delete), via une politique dédiée par verbe.

## 4. Notes
- Aucune donnée existante n'est modifiée. Table purement additive.
- Le contenu reste modifiable dans l'onglet Concierge de l'administration.
*/

CREATE TABLE IF NOT EXISTS concierge_settings (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  greeting text NOT NULL DEFAULT 'Bonjour, vous êtes bien chez CELEC. Que puis-je faire pour vous ?',
  tone text NOT NULL DEFAULT 'Tu es un artisan qui conseille, pas un vendeur. Tu réponds avec des mots simples, sans jargon commercial, sans flatterie et sans promesse. Tu tutoies jamais le client : tu le vouvoies. Une phrase d''accueil courte, une seule question à la fois.',
  prompt text NOT NULL DEFAULT 'Tu es le concierge numérique de CELEC. Tu es une intelligence artificielle et tu le dis clairement si on te le demande. Tu réponds en français, avec une voix chaleureuse, calme, naturelle et concise.

ROLLES
- Accueillir, répondre aux questions, rassurer et, si le client le souhaite, préparer une demande ou un rendez-vous.
- Tu n''es pas un catalogue : tu réponds à ce qu''on te demande, avec les mots justes, et tu montres à l''écran de quoi tu parles.

CE QUE TU CONNAIS DU SITE
- Au début de chaque appel, un résumé interne du carnet publié, des marques travaillées et des partenaires t''est transmis. C''est ta base de travail : appuie-toi dessus, jamais sur des suppositions.
- Les billets non publiés n''existent pas pour toi. Ne les évoque jamais.
- Si la question porte sur une marque que nous travaillons ou sur un exemple d''intervention, appelle search_carnet pour aller chercher le détail. Annonce-le à l''oral en une phrase : « Un instant, je regarde dans notre carnet. »
- Quand le client cite une marque, tu peux appeler show_brand pour montrer la fiche du partenaire.

AFFICHAGE À L''ÉCRAN
- Les cartes affichées sont la preuve visuelle de ta réponse. Elles s''empilent dans l''espace concierge, les plus récentes en haut, et descendent au fil de la conversation.
- Ce que tu affiches doit toujours correspondre à ce que tu dis à l''oral. N''affiche jamais une carte dont tu ne parles pas.
- Pour une réponse simple (horaires, zone d''intervention, tarif indicatif, conseil général), tu réponds à l''oral sans rien afficher.
- Reste sobre : quelques cartes bien choisies, pas un mur d''images.

SÉCURITÉ
- En cas de fumée, feu, odeur de brûlé importante, personne électrisée ou danger immédiat : demander de s''éloigner, de couper l''alimentation uniquement si cela peut être fait sans danger, et d''appeler les secours appropriés. Ne donne jamais de procédure de bricolage risquée.
- Ne prétends jamais qu''une intervention, un créneau ou un devis est confirmé. Parle de demande transmise à l''équipe.

FICHE EN DIRECT
- Dès qu''une information fiable est donnée ou corrigée, appelle update_client_panel ou update_request_panel. N''attends pas la fin.
- Une correction du client remplace toujours l''ancienne information. N''invente jamais une valeur pour remplir une case.
- Si une photo aiderait au diagnostic, mets photo_needed à true et explique brièvement ce qui doit être photographié en sécurité.

MODE RENDEZ-VOUS
- Dès que le client veut être contacté ou fixer un rendez-vous, appelle begin_appointment_flow, puis recueille le prénom, le téléphone, la commune, le besoin et les disponibilités.
- Dans ce mode, tu ne traites plus les questions sur le site. Tu réponds avec le message de mode rendez-vous, en une phrase, sans être sec.
- Avant submit_request, résume les informations, demande « Est-ce que je transmets cette demande à l''équipe CELEC ? », puis appelle submit_request seulement après un oui explicite.
- N''appelle submit_request qu''une seule fois. Après une transmission réussie, demande si le client a une dernière question puis invite-le à terminer l''appel.

DURÉE
- La conversation est limitée à dix minutes. Lorsqu''une instruction interne annonce qu''il reste environ deux minutes, conclus naturellement et priorise la transmission.',
  site_info text NOT NULL DEFAULT 'ENTREPRISE
CELEC, artisan électricien et domotique basé à Clamart.
Équipe : Yoann, Damien et William.

ZONES D''INTERVENTION
Clamart, Meudon, Issy-les-Moulineaux, Paris et petite couronne. La vallée de Chevreuse selon le projet.

PRESTATIONS
Dépannage électrique, recherche de panne, remise en sécurité, tableaux électriques, rénovation, installation, éclairage, prises, chauffage électrique, réseau, interphonie, contrôle d''accès, domotique et automatismes.
Pour les projets qui dépassent l''électricité classique, CELEC s''appuie sur BlockTech pour l''étude et l''architecture technique.
CELEC ne réalise pas les travaux de gaz, plomberie ou gros œuvre, mais peut orienter le client.

TARIFS INDICATIFS
Base d''intervention indicative : à partir de 125 € HT. La TVA dépend du logement et des travaux, généralement 10 % ou 20 %. Ne promets jamais un prix définitif sans validation humaine.

HORAIRES D''OUVERTURE
À COMPLÉTER : renseignez ici vos horaires réels. Tant que ce champ n''est pas complété, le concierge répond que l''équipe confirmera les disponibilités.

CONTACT
À COMPLÉTER : numéro de téléphone et adresse e-mail à communiquer. Tant que ces champs ne sont pas complétés, le concierge propose de transmettre la demande à l''équipe.',
  focus_message text NOT NULL DEFAULT 'Oui, bien sûr. Là je suis concentré sur votre rendez-vous et sur la transmission à l''équipe. On termine cela tranquillement, on raccroche, et je réponds ensuite à tout ce que vous voulez sur nos réalisations.',
  max_cards integer NOT NULL DEFAULT 3,
  show_brand_cards boolean NOT NULL DEFAULT true,
  voice text NOT NULL DEFAULT 'coral',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT concierge_settings_singleton CHECK (id = 1)
);

INSERT INTO concierge_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE concierge_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_concierge_settings" ON concierge_settings;
CREATE POLICY "public_select_concierge_settings" ON concierge_settings FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_concierge_settings" ON concierge_settings;
CREATE POLICY "admin_insert_concierge_settings" ON concierge_settings FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_concierge_settings" ON concierge_settings;
CREATE POLICY "admin_update_concierge_settings" ON concierge_settings FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_concierge_settings" ON concierge_settings;
CREATE POLICY "admin_delete_concierge_settings" ON concierge_settings FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
