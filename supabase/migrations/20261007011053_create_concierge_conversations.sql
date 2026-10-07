/*
# Archive complète des conversations du concierge

1. Nouvelle table `concierge_conversations`
   Une ligne par appel au concierge vocal, alimentée uniquement par la fonction serveur `concierge-log`.
   - `id` (uuid, clé primaire)
   - `session_key` (text, unique) : identifiant de session généré par le navigateur
   - `write_token_hash` (text) : empreinte SHA-256 du jeton d'écriture propre à l'appel ; seul le navigateur
     qui a ouvert l'appel peut compléter sa conversation
   - `started_at`, `last_activity_at`, `ended_at` (timestamptz)
   - `duration_seconds` (integer)
   - `ended_reason` (text) : raccroché, temps écoulé, onglet fermé…
   - `client_name`, `client_phone`, `client_email` (text) : identité connue ou dictée pendant l'appel
   - `profile_id` (uuid, nullable) : compte client connecté, s'il y en a un
   - `request_id` (uuid, nullable) : demande transmise à l'équipe pendant l'appel
   - `transcript` (jsonb) : tous les échanges [{ role, text, at }]
   - `events` (jsonb) : actions du concierge (recherches, affichages, fiche, transmission)
   - `draft` (jsonb) : dernière fiche de demande
   - `summary` (text), `summary_status` (text : pending | done | error), `summarized_at`
   - `message_count` (integer)

2. Sécurité
   - RLS activée. Lecture, création, modification et suppression réservées aux administrateurs (is_admin()).
   - Les visiteurs n'écrivent jamais directement : la fonction serveur vérifie le jeton d'écriture puis
     enregistre avec les droits serveur.

3. Notes
   1. Aucune table existante n'est modifiée.
   2. Index sur la date de début pour la liste de l'administration.
*/

CREATE TABLE IF NOT EXISTS concierge_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text UNIQUE NOT NULL,
  write_token_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  ended_reason text,
  client_name text,
  client_phone text,
  client_email text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft jsonb,
  summary text,
  summary_status text NOT NULL DEFAULT 'pending',
  summarized_at timestamptz,
  message_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS concierge_conversations_started_idx ON concierge_conversations (started_at DESC);

ALTER TABLE concierge_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read conversations" ON concierge_conversations;
CREATE POLICY "Admins read conversations" ON concierge_conversations FOR SELECT
TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins insert conversations" ON concierge_conversations;
CREATE POLICY "Admins insert conversations" ON concierge_conversations FOR INSERT
TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins update conversations" ON concierge_conversations;
CREATE POLICY "Admins update conversations" ON concierge_conversations FOR UPDATE
TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins delete conversations" ON concierge_conversations;
CREATE POLICY "Admins delete conversations" ON concierge_conversations FOR DELETE
TO authenticated USING (is_admin());
