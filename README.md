# Celecweb00h16

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-zxzm3pjq)

## Configuration

Le concierge vocal utilise les variables Netlify suivantes :

- `OPENAI_API_KEY` (obligatoire)
- `REALTIME_MODEL` (facultatif, valeur par défaut : `gpt-realtime-2.1-mini`)
- `REALTIME_VOICE` (facultatif, valeur par défaut : `coral`)

La fonction Supabase `telegram-notify` utilise des secrets Supabase, jamais des valeurs écrites dans le dépôt :

- `TELEGRAM_NOTIFY_BOT_TOKEN`
- `TELEGRAM_NOTIFY_CHAT_ID`

Après toute exposition d'un jeton Telegram dans Git, il faut le révoquer auprès de BotFather, générer un nouveau jeton, enregistrer ce nouveau secret dans Supabase puis redéployer la fonction.
