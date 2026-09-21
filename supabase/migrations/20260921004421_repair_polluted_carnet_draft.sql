/*
# Repair the carnet draft polluted by the AI reasoning text

1. Problem repaired
  - One Telegram draft stored the model reasoning text in `description` and in
    `raw_data.ai_analysis.raw_response`, while `title` stayed "Sans titre". The real JSON
    answer was buried at the end of that same text, nested under `ai_analysis`.

2. Fix
  - The genuine JSON object is extracted from `ai_analysis.raw_response`, flattened onto a
    single line and parsed.
  - `title`, `description` and `ai_summary` are rebuilt from it, and `detected_brands`
    is rebuilt from its "brands" array.
  - `raw_data` is replaced by a clean version carrying a recovery flag.

3. Notes
  - Targets one row only, by id.
  - Idempotent: skipped once the row carries the `ai_recovered` flag.
*/

WITH target AS (
  SELECT id,
         regexp_replace(
           substring(raw_data->'ai_analysis'->>'raw_response' from '(?s)\{"title".*\}'),
           E'[\n\r\t]+', ' ', 'g'
         ) AS payload
  FROM photos
  WHERE id = '4982007a-4fda-4aa5-8687-1cd120d88d0b'
    AND source = 'telegram'
    AND (raw_data->>'ai_recovered') IS NULL
),
parsed AS (
  SELECT id, payload::jsonb AS j
  FROM target
  WHERE payload IS NOT NULL
)
UPDATE photos p SET
  title = left(coalesce(nullif(j->>'title', ''), p.title), 120),
  description = nullif(j->>'summary', ''),
  ai_summary = nullif(j->>'summary', ''),
  detected_brands = (
    SELECT array_agg(value)
    FROM jsonb_array_elements_text(j->'brands')
  ),
  raw_data = jsonb_build_object(
    'ai_analysis', j,
    'ai_recovered', true,
    'ai_previous_issue', 'raisonnement du modele recopie dans la description'
  )
FROM parsed
WHERE p.id = parsed.id;
