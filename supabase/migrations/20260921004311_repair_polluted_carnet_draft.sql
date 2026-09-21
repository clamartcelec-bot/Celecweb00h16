/*
# Repair the carnet draft polluted by the AI reasoning text

1. Problem repaired
  - One Telegram draft had its reasoning text (including an internal thinking block) copied
    into `description` and into `raw_data.ai_analysis.raw_response`, while `title` stayed
    "Sans titre". The real JSON answer was buried at the end of that same text.

2. Fix
  - The genuine JSON object is extracted from the stored raw answer.
  - `title`, `description` and `ai_summary` are rebuilt from it.
  - `detected_brands` is rebuilt from its "brands" array.
  - `raw_data` is replaced by a clean version, keeping a flag that the entry was recovered.

3. Notes
  - Targets one row only, by id. No other row is touched.
  - Idempotent: the row is skipped once it carries the `ai_recovered` flag.
*/

WITH target AS (
  SELECT id, raw_data->>'raw_response' AS raw
  FROM photos
  WHERE id = '4982007a-4fda-4aa5-8687-1cd120d88d0b'
    AND source = 'telegram'
    AND (raw_data->>'ai_recovered') IS NULL
),
parsed AS (
  SELECT id, (substring(raw from '\{[^{}]*\}')::jsonb) AS j
  FROM target
  WHERE raw IS NOT NULL
    AND substring(raw from '\{[^{}]*\}') IS NOT NULL
)
UPDATE photos p SET
  title = left(coalesce(nullif(j->>'title', ''), title), 120),
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
