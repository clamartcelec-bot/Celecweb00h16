/*
# Add AI analysis and raw data columns to photos table

1. Modified Tables
  - `photos`
    - `raw_data` (jsonb) - stores original Telegram message data, GPS coords, raw caption
    - `detected_brands` (text[]) - brand names detected by AI in photos
    - `voice_transcript` (text) - speech-to-text transcription of voice messages
    - `ai_summary` (text) - AI-generated description/summary ready for the carnet
    - `source` (text) - origin of the entry: 'telegram', 'manual', 'concierge'

2. Important Notes
  - Existing entries get NULL for all new columns (no data loss).
  - The `published` column default remains true for backward compat with manual entries;
    the telegram-carnet function will explicitly set published=false for drafts.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'raw_data') THEN
    ALTER TABLE photos ADD COLUMN raw_data jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'detected_brands') THEN
    ALTER TABLE photos ADD COLUMN detected_brands text[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'voice_transcript') THEN
    ALTER TABLE photos ADD COLUMN voice_transcript text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'ai_summary') THEN
    ALTER TABLE photos ADD COLUMN ai_summary text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'source') THEN
    ALTER TABLE photos ADD COLUMN source text DEFAULT 'manual';
  END IF;
END $$;
