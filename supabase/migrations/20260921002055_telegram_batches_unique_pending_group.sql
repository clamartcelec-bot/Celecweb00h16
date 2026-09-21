/*
# Guarantee a single active Telegram batch per group

1. Modified Tables
  - `telegram_batches`
    - New partial unique index `telegram_batches_one_pending_per_group`
      on (group_key) restricted to rows where status = 'pending'.

2. Why
  - Telegram delivers the photos of one album as several near-simultaneous webhook calls.
    Without this index, two calls could both create a "collecting" batch for the same album
    and produce two carnet entries. The index makes the second insert fail, and the bot then
    simply attaches its photo to the batch that already exists.

3. Notes
  - Non-destructive: adds an index only, no data is touched.
*/

CREATE UNIQUE INDEX IF NOT EXISTS telegram_batches_one_pending_per_group
  ON telegram_batches (group_key)
  WHERE status = 'pending';
