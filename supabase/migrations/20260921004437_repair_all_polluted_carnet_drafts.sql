/*
# Repair every remaining carnet draft polluted by the AI reasoning text

1. Problem repaired
  - Some Telegram drafts created before the fix stored the model reasoning text in
    `description` and in `raw_data.ai_analysis.raw_response`, while `title` stayed
    "Sans titre". The genuine JSON answer was buried at the end of that same text.

2. Fix
  - For every affected row, the embedded JSON object is extracted, flattened onto a single
    line and parsed.
  - `title`, `description` and `ai_summary` are rebuilt from it, and `detected_brands` is
    rebuilt from its "brands" array.
  - `raw_data` is replaced by a clean version carrying a recovery flag.

3. Notes
  - Only rows whose stored answer actually contains an embedded JSON object are touched.
  - Idempotent: rows already carrying the `ai_recovered` flag are skipped.
*/

WITH target AS (
  SELECT id,
         regexp_replace(
           substring(raw_data->'ai_analysis'->>'raw_response' from '(?s)\{"title".*\}'),
           E'[\n\r\t]+', ' ', 'g'
         ) AS payload
  FROM photos
  WHERE source = 'telegram'
    AND (raw_data->>'ai_recovered') IS NULL
    AND raw_data->'ai_analysis'->>'raw_response' LIKE '%{"title"%'
),
parsed AS (
  SELECT id, payload::jsonb AS j
  FROM target
  WHERE payload LIKE '{"title"%'
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
