/*
# Add rewrite_model setting for description rewriting

1. Modified Tables
- `carnet_settings`: add `rewrite_model` text column, default 'gpt-4o-mini'.
  Dedicated (small) model used only to rewrite carnet descriptions from voice
  dictation, independent of the main photo-analysis model (ai_model).
2. Security
- No RLS changes; column inherits existing carnet_settings policies.
*/

ALTER TABLE carnet_settings ADD COLUMN IF NOT EXISTS rewrite_model text NOT NULL DEFAULT 'gpt-4o-mini';
