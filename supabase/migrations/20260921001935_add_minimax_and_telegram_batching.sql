/*
# Add MiniMax provider and Telegram batching

1. Modified Tables
  - `carnet_settings`
    - `minimax_api_key` (text, default '') - API key used when a MiniMax model is selected.
      Preference order in the bot: the MINIMAX_API_KEY secret if present, otherwise this value.
    - `minimax_base_url` (text, default 'https://api.minimax.io/v1') - OpenAI-compatible base URL
      for MiniMax. Editable so the endpoint can be changed without a code change.
    - `batch_window_seconds` (integer, default 120) - inactivity window used to group several
      Telegram messages (photos + text + voice) into a single carnet entry.

2. New Tables
  - `telegram_batches` - one row per group of Telegram messages being assembled.
    - `id` (uuid, primary key)
    - `chat_id` (bigint) - Telegram chat the messages came from.
    - `group_key` (text) - grouping key: `mg:<chat>:<media_group_id>` for albums, `sg:<chat>` otherwise.
    - `status` (text) - 'pending' (collecting), 'processing' (being finalized), 'done', 'failed'.
    - `window_expires_at` (timestamptz) - sliding deadline; extended on every new message.
    - `last_message_at` (timestamptz)
    - `photo_id` (uuid, nullable) - the carnet entry created from this batch.
    - `error` (text, nullable) - failure reason when status = 'failed'.
    - `created_at` / `updated_at` (timestamptz)
  - `telegram_batch_messages` - one row per raw Telegram message belonging to a batch.
    - `id` (uuid, primary key)
    - `batch_id` (uuid, FK -> telegram_batches.id, ON DELETE CASCADE)
    - `message_id` (bigint) - Telegram message id.
    - `from_name` (text) - sender display name.
    - `sent_at` (timestamptz) - Telegram message date.
    - `caption` (text) - raw caption/text of the message.
    - `transcript` (text, nullable) - speech-to-text result when the message was a voice note.
    - `location` (jsonb, nullable) - shared GPS position if any.
    - `image_urls` (jsonb) - array of `{ url, position }` for the photos of this message.
    - `raw` (jsonb) - compact copy of the original Telegram payload.
    - `created_at` (timestamptz)

3. Security
  - RLS enabled on both new tables. NO policies are created on purpose: only the service role
    (used by the Telegram edge function) may touch them, so the public anon key can read or write nothing.
  - `carnet_settings` RLS and its admin-only policies are left unchanged.

4. Important Notes
  - Purely additive: no column is dropped, renamed or retyped, so existing data is untouched.
  - The batching tables are working state. Finalized rows keep a history of what was received but the
    carnet entries themselves live in `photos` as before.
*/

ALTER TABLE carnet_settings
  ADD COLUMN IF NOT EXISTS minimax_api_key text NOT NULL DEFAULT '';
ALTER TABLE carnet_settings
  ADD COLUMN IF NOT EXISTS minimax_base_url text NOT NULL DEFAULT 'https://api.minimax.io/v1';
ALTER TABLE carnet_settings
  ADD COLUMN IF NOT EXISTS batch_window_seconds integer NOT NULL DEFAULT 120;

CREATE TABLE IF NOT EXISTS telegram_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  group_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  window_expires_at timestamptz NOT NULL,
  last_message_at timestamptz,
  photo_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_batches_group_key_idx
  ON telegram_batches (group_key, status);
CREATE INDEX IF NOT EXISTS telegram_batches_window_idx
  ON telegram_batches (status, window_expires_at);

CREATE TABLE IF NOT EXISTS telegram_batch_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES telegram_batches(id) ON DELETE CASCADE,
  message_id bigint,
  from_name text,
  sent_at timestamptz,
  caption text,
  transcript text,
  location jsonb,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_batch_messages_batch_idx
  ON telegram_batch_messages (batch_id, created_at);

ALTER TABLE telegram_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_batch_messages ENABLE ROW LEVEL SECURITY;
