/*
# Familles et sujets du carnet, types de partenaires, contexte de l'assistant

1. Modified Tables
- `photos`
  - `topics` (text[], default '{}'): sujets associés au billet (alarme, tableau, recharge...).
    Un billet peut avoir plusieurs sujets ; les familles s'en déduisent.
- `partners`
  - `kind` (text, 'brand' ou 'pro', default 'brand'): marque de matériel ou professionnel local.
  - `trade` (text): métier du professionnel (menuisier, portail...).
  - `locality` (text): commune d'implantation.
  - `why_story` (text): pourquoi nous avons choisi cette marque / ce professionnel, en quelques phrases.
- `concierge_conversations`
  - `context` (jsonb, default '{}'): page et sujet courants, contenus montrés, demande en préparation.
  - `expires_at` (timestamptz, default now() + 90 days): date de fin de conservation d'un échange invité.
  - `mode` (text, default 'turns'): distingue les échanges par tours des anciens échanges vocaux continus.

2. Security
- Aucune nouvelle politique : les tables gardent leurs règles existantes
  (lecture publique des billets/partenaires publiés, écriture réservée à l'administration,
  conversations accessibles uniquement par les fonctions serveur).

3. Notes
1. Colonnes ajoutées seulement, aucune donnée supprimée.
2. Index GIN sur `photos.topics` pour filtrer rapidement par sujet.
*/

ALTER TABLE photos ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS photos_topics_gin ON photos USING gin (topics);

ALTER TABLE partners ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'brand';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS trade text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS locality text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS why_story text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_kind_check') THEN
    ALTER TABLE partners ADD CONSTRAINT partners_kind_check CHECK (kind IN ('brand', 'pro'));
  END IF;
END $$;

ALTER TABLE concierge_conversations ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE concierge_conversations ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');
ALTER TABLE concierge_conversations ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'turns';
CREATE INDEX IF NOT EXISTS concierge_conversations_profile_idx ON concierge_conversations (profile_id, last_activity_at DESC);
