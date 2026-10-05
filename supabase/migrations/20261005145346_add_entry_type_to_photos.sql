/*
# Add entry_type column to photos (carnet entries)

1. Modified Tables
- `photos`: add `entry_type` text column, default 'intervention', nullable allowed for legacy rows.
  Values: 'chantier', 'intervention', 'remarque'. Displayed as a tag on carnet cards in admin.
2. Security
- No RLS changes; column inherits existing photos policies.
*/

ALTER TABLE photos ADD COLUMN IF NOT EXISTS entry_type text DEFAULT 'intervention';

UPDATE photos SET entry_type = 'intervention' WHERE entry_type IS NULL;
