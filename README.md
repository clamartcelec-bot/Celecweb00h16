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


## Robot du concierge vocal

Le personnage approuvé remplace l’ancien avatar « CE » sur `/concierge`. Il reste en haut à gauche,
avec un fond transparent, une petite casquette rose, deux sourcils, des pupilles indépendantes,
deux mains et un tournevis. Le composant conserve une instance unique entre les états de connexion.

- Au premier message vocal : salut de la main et casquette qui se soulève.
- Pendant la parole : bouche pilotée par l’amplitude RMS du **flux audio reçu**, avec fermeture dans
  les silences. Il s’agit d’une synchronisation par amplitude, pas d’une reconnaissance des phonèmes.
- Écoute, préparation de réponse et connexion : regards et expressions dédiés.
- Appels de fonctions : antenne active, hochement de tête pour les mises à jour, mains pour les cartes,
  salut de la casquette après transmission réussie, expression inquiète en cas d’échec.
- L’interruption, le raccrochage et la déconnexion ferment la bouche ; les ressources audio sont libérées.
  Les animations ambiantes respectent `prefers-reduced-motion` et s’arrêtent hors écran.

`src/concierge/components/ConciergeRobot.tsx` relie les états du concierge au personnage.
Le dessin en calques et son moteur sont dans `src/concierge/robot/`. Les textures sont locales et
traitées par Vite ; aucun service d’images ni secret supplémentaire n’est nécessaire.
Les fonctions métier existantes restent branchées au même backend Supabase.

### Vérification

Avec Node.js 20 ou plus :

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run build
npm run test:concierge
```

Les tests navigateur utilisent de vrais analyseurs Web Audio avec des sons synthétiques et simulent
WebRTC/Supabase. Ils ne transmettent aucune demande réelle. Un appel vocal réel reste à vérifier
avec la configuration Supabase du site. Le lint global comporte des erreurs préexistantes dans
`App.tsx` et `ClientSpace.tsx`, ainsi qu’un avertissement de dépendance React existant dans `ConciergePage.tsx`.
