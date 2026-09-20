/*
# Create carnet_settings table for AI configuration

1. New Tables
  - `carnet_settings` (singleton config table, one row)
    - `id` (integer, primary key, always 1)
    - `ai_prompt` (text) - system prompt for AI photo analysis
    - `ai_style` (text) - writing style for AI summaries (e.g. "professionnel", "decontracte")
    - `ai_model` (text) - OpenAI model to use (default: "gpt-4o-mini")
    - `activity_context` (text) - main activity description for the AI (e.g. "electricien")
    - `detect_brands` (boolean) - whether to detect brands in photos
    - `auto_transcribe` (boolean) - whether to transcribe voice messages
    - `updated_at` (timestamptz) - last update timestamp

2. Security
  - RLS enabled. Only authenticated admin users can read/update settings.
  - Policies scoped TO authenticated with admin role check via profiles table.

3. Seed data
  - Insert a default row (id=1) with sensible defaults for CELEC.
*/

CREATE TABLE IF NOT EXISTS carnet_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ai_prompt text NOT NULL DEFAULT 'Tu es l''assistant de CELEC, un electricien de terrain en region parisienne. On t''envoie une photo et/ou un texte pris sur un chantier. Tu dois analyser et produire un JSON avec exactement ces champs :
- "title": titre court et descriptif pour le carnet de bord (max 60 caracteres)
- "summary": description claire de l''intervention ou de la situation montree (2-4 phrases). Explique ce qui est montre, le type de travail, le contexte.
- "brands": tableau des marques visibles ou mentionnees (ex: ["Legrand", "Schneider"]). Si aucune marque, tableau vide.
- "category": une parmi "depannage", "renovation", "installation", "diagnostic", "autre"

Reponds UNIQUEMENT avec le JSON, sans markdown, sans backticks.',
  ai_style text NOT NULL DEFAULT 'professionnel',
  ai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  activity_context text NOT NULL DEFAULT 'Electricien de terrain, interventions en region parisienne (Paris, Hauts-de-Seine 92, Essonne 91). Specialites : depannage, renovation electrique, mise aux normes, installation.',
  detect_brands boolean NOT NULL DEFAULT true,
  auto_transcribe boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE carnet_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_carnet_settings" ON carnet_settings;
CREATE POLICY "admin_select_carnet_settings" ON carnet_settings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_carnet_settings" ON carnet_settings;
CREATE POLICY "admin_update_carnet_settings" ON carnet_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_carnet_settings" ON carnet_settings;
CREATE POLICY "admin_insert_carnet_settings" ON carnet_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

INSERT INTO carnet_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
