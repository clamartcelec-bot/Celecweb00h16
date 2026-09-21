/*
# Add AI output language setting to the carnet

1. Modified Tables
  - `carnet_settings`
    - `ai_language` (text, default 'fr') - language in which the AI writes the title,
      summary and analysis of Telegram carnet entries. Follows the technician's language
      by default ('fr'), can be switched in the admin AI settings.

2. Notes
  - Additive only, no existing data touched.
*/

ALTER TABLE carnet_settings ADD COLUMN IF NOT EXISTS ai_language text NOT NULL DEFAULT 'fr';
