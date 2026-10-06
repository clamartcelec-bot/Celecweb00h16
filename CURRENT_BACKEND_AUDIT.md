# CURRENT_BACKEND_AUDIT — Le Carnet CELEC / connecteur Android

**Phase 1 — audit du dépôt et proposition minimale, sans implémentation.**

- Date : 5 octobre 2026.
- Dépôt : [clamartcelec-bot/Celecweb00h16](https://github.com/clamartcelec-bot/Celecweb00h16).
- Référence examinée : `main`, commit [c765e8cc8312929d84ae9f440a9d38e87d46b683](https://github.com/clamartcelec-bot/Celecweb00h16/commit/c765e8cc8312929d84ae9f440a9d38e87d46b683), daté du 5 octobre 2026 à 17:47:46, heure de Paris.
- Méthode : lecture par le connecteur GitHub, copie locale de 55 fichiers pertinents, contrôle des SHA des blobs, examen du code et de la succession des 32 migrations SQL.
- Portée : état versionné du dépôt. Les migrations effectivement appliquées, les règles ajoutées hors Git, les secrets déployés et les données de production n'ont pas été inspectés.
- Aucune application Android, migration, Edge Function ou modification du site n'est créée pendant cette phase.

## 1. Conclusion exploitable

Le Carnet existe déjà. Une entrée est une ligne de `photos`; ses images supplémentaires sont dans `photo_images`. Telegram produit des brouillons dans ces mêmes tables, ensuite validés dans l'administration du site.

Le moteur métier existe, mais il est incorporé à `supabase/functions/telegram-carnet/index.ts`. Il n'existe actuellement ni module `_shared/carnetProcessor.ts`, ni endpoint mobile, ni contrat API mobile, ni mécanisme de lot mobile idempotent.

La solution proposée est de :

1. Réutiliser le même Supabase Auth, le même Carnet, les mêmes réglages et le même traitement IA.
2. Extraire seulement le calcul commun du brouillon et le traitement audio indépendant du transport, après des tests de référence Telegram.
3. Ajouter `mobile-carnet`, des tables techniques de lots/médias et une finalisation transactionnelle réservée au backend.
4. Conserver les médias bruts mobiles dans un nouveau bucket privé.
5. Corriger les écarts de permissions qui empêchent actuellement de garantir « connecté ne signifie pas autorisé ».
6. Attendre un `carnet_entry_id` confirmé par une transaction réussie avant de vider le lot Android.

Il n'est pas nécessaire de créer un autre backend, une autre base utilisateur, un autre Carnet ou des prompts métier dans l'APK. La séparation du code peut rester limitée; une réécriture globale de Telegram serait disproportionnée.

**L'audit met toutefois en évidence des problèmes existants qui doivent être examinés avant une ouverture mobile : rôle de profil modifiable, anciennes permissions d'écriture trop larges, brouillons lisibles via l'API et jeton Telegram présent en clair.** Ce sont des constats du dépôt, pas la preuve d'une exploitation en production.

## 2. Inventaire et sources examinées

Les références S1–S15 renvoient à des fichiers figés sur le commit audité. Les liens de l'annexe permettent de retrouver le code concerné sans dépendre d'une évolution de `main`.

| Zone | Éléments examinés | Résultat |
|---|---|---|
| Configuration Supabase | `supabase/config.toml` [S1] | Paramètres JWT par fonction; aucun identifiant de projet Supabase |
| Schéma et sécurité | Les 32 fichiers de `supabase/migrations/` | Tables métier, profils, Storage, regroupement Telegram, paramètres IA, correctifs historiques |
| Fonctions backend | Les 5 handlers `index.ts`, plus `realtime-session/conciergeRealtimeConfig.ts` | Carnet Telegram, réécriture de description, notifications et Concierge |
| Client Supabase | `src/lib/supabase.ts` [S2] | URL et clé publique fournies par variables Vite |
| Connexion et session | `LoginModal.tsx`, `PasswordResetModal.tsx`, `ClientSpace.tsx`, parties Auth de `App.tsx` [S3, S4] | Email/mot de passe, récupération de session, suivi des changements Auth, déconnexion |
| Administration Carnet | `AdminDashboard.tsx` [S5] | Brouillons, publication, images, réglages IA, dictée de description |
| Consultation et Concierge | Parties Carnet de `App.tsx`, services `knowledge`, `context`, `upload`, `lead`, `config`, hook Realtime | Réutilisation de `photos`; affichage de billets publiés et pièces jointes Concierge distinctes |
| Documentation et validation | `README.md`, `package.json`, configuration Playwright, `tests/concierge-robot.spec.ts` | Six tests navigateur du robot; aucune suite de non-régression du pipeline Carnet |

L'arbre GitHub complet n'est pas tronqué. Aucun `AGENTS.md` ni workflow `.github/workflows/` n'y a été trouvé. Le projet Android séparé n'a pas été créé : cela appartient à la phase 4.

## 3. Fonctionnement réel de telegram-carnet

### 3.1 Réception et préparation du message

Le handler [S6] accepte un corps JSON et retient `body.message || body.channel_post`. Un corps sans l'un de ces champs reçoit `{ ok: true }`.

Les secrets attendus sont :

- `TELEGRAM_CARNET_BOT_TOKEN`;
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`;
- `OPENAI_API_KEY`, facultatif pour l'analyse et nécessaire à la transcription actuelle;
- `MINIMAX_API_KEY` ou `MINIMAX_M3_API_KEY`, avec un repli vers la clé enregistrée dans `carnet_settings`.

La fonction utilise un client **service role**. Elle ne représente pas un utilisateur Supabase et n'utilise pas `public.is_admin()`.

`extractMessage()` normalise les identifiants de chat/message/auteur, la date, le texte ou la légende, la localisation Telegram, les photos, un document et `voice || audio`.

La provenance Telegram n'est pas liée à un `auth.users.id`. Un nom ou une mention Telegram ne constitue pas une autorisation Supabase.

### 3.2 Regroupement

`attachBatch()` utilise `telegram_batches`.

- Album : clé `mg:<chat_id>:<media_group_id>`.
- Message hors album : clé créée sous la forme `sg:<chat_id>:<sender_id>:<timestamp>`.
- La recherche d'un lot existant pour un auteur porte sur les clés `sg:`, dans le même chat, en état `pending`, créées depuis moins de dix minutes.
- La fenêtre d'inactivité vient de `batch_window_seconds`, par défaut 120 secondes, bornée dans le code entre 10 et 3 600 secondes. Une valeur 0 retombe à 120.
- L'index unique partiel sur `group_key` s'applique seulement aux lots `pending` [S7].

**Limite importante :** un album reçu en premier sous une clé `mg:` n'est pas retrouvé par la recherche `sg:` lorsqu'un vocal séparé arrive ensuite. Album puis vocal ne garantit donc pas un lot unique. Photos hors album puis vocal peuvent partager un lot `sg:`. Le mobile doit regrouper explicitement ses médias par UUID; il ne doit pas reproduire cette heuristique temporelle.

Les anciens lots en attente du même chat sont rendus immédiatement éligibles à la finalisation quand un nouveau lot apparaît. Cette opération n'est pas limitée au même auteur.

### 3.3 Médias reçus

| Média | Traitement actuel |
|---|---|
| Photo Telegram compressée | La dernière taille de `update.photo` est retenue, puis téléchargée |
| Image envoyée comme document | Acceptée si le MIME déclaré commence par `image/` |
| Vocal / audio | Téléchargé depuis Telegram et envoyé à Whisper si la transcription est activée et la clé OpenAI disponible |
| Texte / légende | Conservé dans `telegram_batch_messages.caption` |
| Localisation | Coordonnées Telegram, GPS EXIF JPEG ou commune issue du texte |
| Vidéo Telegram | Aucun traitement de `update.video`; pas de conservation ni d'analyse vidéo dans ce pipeline |
| Autre document | Aucun traitement métier, sauf document image |

`fetchAndStoreImage()` tente deux fois le téléchargement et l'upload. Les images sont placées dans le bucket public `photos`, sous des chemins aléatoires `telegram/...`. Le code lit éventuellement le GPS EXIF des JPEG. Les photos compressées Telegram peuvent avoir perdu ces métadonnées.

L'audio brut **n'est pas sauvegardé dans Supabase Storage par cette fonction**. Seul le résultat de transcription est conservé. Une erreur de transcription renvoie `null`; elle n'est pas exposée comme erreur structurée.

Une ligne de `telegram_batch_messages` conserve la légende, la transcription, les images stockées, la localisation et quelques indicateurs de provenance. Le champ `raw` n'est pas une copie exhaustive du message et ne garde pas les identifiants de fichiers audio nécessaires à une reprise complète.

### 3.4 Déclenchement de la finalisation

`reconcileDueBatches()` traite au maximum cinq lots arrivés à échéance par appel. Un passage conditionnel `pending → processing` limite la prise simultanée du même lot.

Un réveil est lancé après la fenêtre d'inactivité avec `setTimeout` et, si disponible, `EdgeRuntime.waitUntil`. Ce réveil recharge les paramètres puis relance la réconciliation.

Ce n'est pas une file durable. Aucune migration de planification ni processus de récupération des lots `processing` abandonnés n'est présent dans le dépôt.

Les limites hébergées publiées par Supabase sont 150 secondes de durée de worker sur Free, 400 secondes sur les offres payantes, avec un délai de réponse de 150 secondes [D2]. Le réveil peut dépasser ces durées avec une fenêtre longue; avec le défaut de 120 secondes, la marge de traitement peut également être réduite. `waitUntil` reste soumis aux limites du worker [D3]. Le plan et le runtime réellement déployés restent à vérifier.

### 3.5 Construction du brouillon

`finalizeBatch()` lit les messages dans l'ordre `created_at ASC`, puis :

1. Agrège les URL d'images et les transcriptions.
2. Retient le premier nom d'auteur disponible.
3. Extrait la première commune `#...` et la première mention d'auteur `@...`; les underscores deviennent des espaces.
4. Cherche les coordonnées de la commune dans `french_cities` si nécessaire.
5. Refuse un lot sans image, texte ou transcription exploitable.
6. Appelle `analyzeWithAi()`.
7. Calcule le titre et la description avec les replis existants.
8. Insère une ligne `photos` avec **`published: false`** et `source: "telegram"`.
9. Insère les lignes `photo_images` en ordre croissant.
10. Marque le lot `done`, avec `photo_id`, puis envoie « Carnet : brouillon créé » sur Telegram.

**Texte transmis à l'IA :** s'il existe une légende non vide, le code utilise les légendes nettoyées; sinon il utilise la transcription. Il ne combine pas systématiquement légendes et vocaux. Un texte composé uniquement de mentions peut donc aussi masquer le vocal dans l'analyse. Cette règle doit être figée dans les tests avant extraction.

**Ordre des images :** il dépend de l'ordre d'insertion des messages, puis des images de chaque message. Ce n'est pas un ordre global explicite envoyé par le client.

**Confirmation HTTP actuelle :** la réponse est `{ success: true, batch: batchId, finalized }`. Elle ne contient pas l'identifiant du brouillon du lot courant. `finalized` est un compteur de réconciliation, potentiellement pour d'autres lots. Cette réponse est un accusé de réception, pas le contrat de succès nécessaire à Android.

## 4. Moteur métier, IA et transcription réutilisables

### 4.1 Réglages communs existants

La ligne `carnet_settings.id = 1` contrôle [S8] :

| Champ | Rôle actuel |
|---|---|
| `ai_prompt`, `ai_style`, `activity_context` | Instructions, style et contexte CELEC |
| `ai_model` | Modèle de création du brouillon; repli `gpt-4o-mini` |
| `detect_brands` | Activation des marques |
| `auto_transcribe` | Activation de la transcription des vocaux |
| `ai_language` | Langue du titre, du résumé et de la transcription; repli français |
| `minimax_api_key`, `minimax_base_url` | Configuration alternative MiniMax |
| `batch_window_seconds` | Regroupement Telegram; pas une temporisation à imposer au bouton Envoyer |
| `rewrite_model` | Modèle distinct pour réécrire une description; ajouté le 5 octobre |

Les valeurs effectivement enregistrées peuvent différer des valeurs de migration. Aucun secret ou réglage de production n'a été lu.

### 4.2 Analyse de création

Les unités métier réutilisables dans [S6] sont :

- `buildPrompt()`, les langues et le schéma JSON;
- `resolveProvider()`;
- `extractJsonObject()`;
- `analyzeWithAi()`;
- `fallbackTitle()`;
- la sélection du titre, de la description et des données IA du brouillon.

L'analyse transmet au maximum **six images**, plus le contexte texte et la commune, à une API compatible Chat Completions. Les images restantes sont conservées mais non analysées; le modèle reçoit une indication du nombre omis.

Le code utilise `max_tokens: 800` et `temperature: 0.3`. Le schéma demandé est `title, summary, brands, category`. La catégorie attendue est une parmi dépannage, rénovation, installation, diagnostic, autre, sous les codes sans accents.

Le parseur extrait le premier objet JSON équilibré. Il filtre les marques pour retenir des chaînes mais ne vérifie pas complètement les catégories, les longueurs ou tous les champs du résultat. Le titre stocké est limité à 120 caractères, alors que le prompt demande 60.

En cas de réponse vide, erreur API ou JSON inexploitable, un résultat avec `error` est retourné. Telegram peut néanmoins créer un brouillon de repli; l'erreur est enregistrée dans `raw_data.ai_error`. Une réponse brute inexploitable n'est pas copiée dans la description, mais un extrait peut rester dans les diagnostics.

La promesse de parité doit porter sur le **même traitement, les mêmes réglages et la même structure de brouillon**. Des sorties IA littéralement identiques ne peuvent pas être garanties entre appels; compression Telegram et fichiers Android peuvent aussi différer.

### 4.3 Transcription

`transcribeVoice()` contient deux responsabilités :

- Telegram : résoudre `file_id`, télécharger l'audio;
- Commune : envoyer un fichier à `/v1/audio/transcriptions`, avec `whisper-1` et la langue.

Il faut extraire la seconde partie sous une interface recevant le fichier, son vrai nom/MIME et la langue. Le mobile enregistrera vraisemblablement du M4A/AAC; il ne faut pas renommer arbitrairement ce fichier `voice.ogg`.

L'échec mobile doit rester identifiable et réessayable lorsque la transcription est requise. Si `auto_transcribe = false`, l'audio est tout de même conservé comme média privé; cette désactivation volontaire ne doit pas devenir une perte de média.

### 4.4 Réécriture de description : un autre usage

`description-rewrite` [S9] accepte du texte ou un formulaire audio, transcrit avec Whisper et renvoie une description reformulée. Il utilise `rewrite_model`, puis le navigateur met à jour la ligne `photos`.

Cette fonction ne crée pas un lot, n'analyse pas les images, ne génère pas tous les champs Carnet et ne finalise pas une entrée. Elle ne constitue donc pas l'endpoint d'ingestion mobile.

Elle vérifie l'utilisateur avec `auth.getUser(token)`, mais **ne vérifie pas son rôle admin** avant l'utilisation du service role et des API IA. Ce point relève du durcissement existant.

## 5. Données et compatibilité de l'administration

| Élément | Fonction | Réutilisation mobile |
|---|---|---|
| `auth.users` | Identité Supabase unique | Oui, sans nouvelle base utilisateur |
| `profiles` | Email, nom, téléphone, rôle | Oui, après protection du rôle |
| `photos` | Entrée Carnet, couverture, publication, données IA | Oui, une ligne par lot confirmé |
| `photo_images` | Images d'une entrée avec `position` et suppression en cascade | Oui pour les images |
| `carnet_settings` | Paramètres IA partagés | Oui, lecture serveur |
| `telegram_batches` / `telegram_batch_messages` | État technique spécifique Telegram | À conserver pour Telegram |
| `french_cities` | Référence des communes et coordonnées | Réutilisable côté serveur sans permission Android de localisation |
| Bucket `photos` | Images publiques, upload admin prévu | Compatibilité des images finales à décider explicitement |
| Bucket `concierge-uploads` | Pièces jointes publiques du Concierge, dépôt visiteur | À conserver séparément; pas adapté aux médias bruts mobiles |

Les colonnes IA de `photos` sont `raw_data`, `detected_brands`, `voice_transcript`, `ai_summary`, `source` [S10].

La catégorie IA est actuellement dans **`raw_data.ai_category`**, pas dans une colonne métier `category`. Le champ `entry_type`, ajouté le 5 octobre, est distinct : chantier, intervention, remarque. Telegram ne le renseigne pas explicitement; le défaut DB est `intervention` [S11].

`source` est du texte avec un défaut `manual`; aucune contrainte trouvée n'interdit `mobile_app`. Aucun changement d'enum source n'est donc nécessaire.

L'administration [S5] lit toutes les entrées, regroupe les images, distingue brouillons/publiées et offre déjà création manuelle, édition, couverture, publication, dépublication et suppression. Une nouvelle ligne compatible apparaît donc sans nouveau Carnet. Le badge de provenance n'est actuellement affiché que pour Telegram; un badge mobile est facultatif.

Elle ne sait pas lire une vidéo ou un audio privé rattaché à un lot. Leur conservation serveur n'implique pas leur visualisation immédiate dans l'admin existant.

Le site et le Concierge filtrent les billets `published = true` dans leurs requêtes [S4, S15]. Leur comportement d'affichage peut être conservé. Ce filtre client ne remplace toutefois pas une politique RLS.

## 6. Authentification et autorisation

### 6.1 Ce qui existe

`src/lib/supabase.ts` crée le client avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` [S2].

- `LoginModal` appelle `signInWithPassword({ email, password })` et permet aussi l'inscription sur le site.
- Le profil créé par le trigger `handle_new_user()` reçoit le rôle `client`.
- `App.tsx` récupère la session, écoute `onAuthStateChange` et lit le rôle du profil.
- Le formulaire d'administration de `App.tsx` vérifie `profiles.role === "admin"`; sinon il déconnecte le compte.
- `PasswordResetModal` utilise Supabase Auth pour la réinitialisation.
- `ClientSpace` lit son propre profil et déconnecte via Supabase Auth.
- `public.is_admin()` est une fonction SQL `SECURITY DEFINER`, `STABLE`, avec `search_path = public`; elle vérifie le profil correspondant à `auth.uid()` [S12].

Le code versionné ne fournit pas l'URL réelle du projet Supabase ou son identifiant. `config.toml` ne les indique pas. La réutilisation du même projet devra être confirmée depuis la configuration de déploiement, avec uniquement l'URL et la clé publique nécessaires à l'APK.

### 6.2 Réutilisation mobile correcte

Pour le MVP, le droit le plus proche de l'existant est **admin uniquement**. Il n'existe pas de permission Carnet dédiée permettant d'assimiler tout salarié ou tout compte CELEC à un contributeur.

La future Edge Function doit :

1. Vérifier le bearer utilisateur auprès de Supabase Auth.
2. Déduire `user_id` de cette identité, jamais du JSON envoyé par le téléphone.
3. Vérifier l'autorisation avec le contexte utilisateur de `public.is_admin()`, ou lire le rôle côté serveur après validation de l'identité.
4. Refaire ce contrôle à chaque opération sensible, pas uniquement à la connexion.
5. Refuser les comptes non autorisés avec HTTP 403 et le message demandé.

**Piège à éviter :** appeler `is_admin()` avec un client service role seul ne lui donne pas automatiquement le contexte du téléphone. `auth.uid()` doit correspondre au JWT utilisateur vérifié.

Le mobile garde les tokens dans un stockage sécurisé Android, gère le refresh et présente le nom du profil ou l'email. Un lot local est attaché au compte qui l'a créé : déconnexion ou changement de compte ne doit ni le perdre ni l'envoyer sous une autre identité. Le retrait du droit bloque les nouveaux envois même si la session Auth reste valide.

## 7. Écarts de sécurité et fiabilité observés

Les conclusions de permissions ci-dessous résultent des migrations Git. Leur présence effective et les privilèges SQL doivent être confirmés en environnement de test ou par une lecture autorisée du schéma déployé.

### 7.1 Priorité élevée : rôle auto-modifiable

[S13] crée `update_own_profile` avec seulement `auth.uid() = id` en `USING` et `WITH CHECK`. Aucun mécanisme versionné ne protège la colonne `role`, et aucune migration suivante ne retire cette règle.

**Conséquence déduite :** avec les privilèges UPDATE habituels sur cette table, un utilisateur peut modifier son propre rôle. La fonction `is_admin()` ne suffit donc pas à fournir une autorisation fiable tant que ce champ est auto-modifiable. La même élévation exposerait les paramètres réservés aux admins, dont la clé MiniMax éventuelle.

**Correction proposée :** nouvelle migration protégeant le rôle contre les écritures utilisateur; par exemple retrait du droit UPDATE de table, puis droits limités aux seules colonnes de profil réellement éditables. Préserver une voie serveur contrôlée pour l'attribution des rôles. Les droits de colonne n'annulent pas un droit de table encore accordé [D5].

### 7.2 Priorité élevée : anciennes écritures photos toujours permissives

[S14] crée `auth_insert_photos`, `auth_update_photos` et `auth_delete_photos` avec une condition toujours vraie. [S10] ajoute ensuite des règles admin sous d'autres noms, sans supprimer les précédentes.

Les règles permissives PostgreSQL se combinent avec OR [D1]. Ajouter une règle admin ne neutralise donc pas l'ancienne autorisation ouverte.

**Conséquence déduite :** le schéma versionné permet encore les écritures Carnet à un compte authentifié non admin, sous réserve des privilèges SQL déployés.

**Correction proposée :** nouvelle migration supprimant explicitement les trois politiques `auth_*` historiques et conservant les règles admin nécessaires à l'administration actuelle. Ne pas retirer les écritures admin existantes que le site utilise.

### 7.3 Priorité élevée : brouillons et champs bruts accessibles par l'API

Les règles de lecture de `photos` et `photo_images` utilisent `USING (true)` pour anon et authenticated [S14, S10]. Elles ne limitent pas les lectures aux publications.

Cela peut rendre les brouillons et, selon les grants, leurs transcriptions et `raw_data` accessibles hors de l'interface. Le site appelle aussi `select("*")` sur les billets publiés; filtrer les brouillons ne masque pas les colonnes internes d'une entrée publiée.

**Correction minimale proposée :** lecture des brouillons réservée aux admins; lecture des `photo_images` liée aux droits sur l'entrée parent. Garder les identifiants utilisateur, chemins privés, manifests et diagnostics mobiles dans les nouvelles tables privées, hors de `photos.raw_data`.

Une séparation plus complète des champs publics et diagnostics historiques demande une projection publique ou une API dédiée et une adaptation des requêtes concernées. Elle ne doit pas être présentée comme déjà résolue par le seul bucket privé.

### 7.4 Priorité élevée : jeton Telegram dans le code

`supabase/functions/telegram-notify/index.ts`, lignes 12–13, contient un jeton de bot et un chat ID en constantes. Le jeton doit être considéré comme exposé tant que sa révocation n'est pas confirmée. Le dépôt est public.

Le README affirme que cette fonction utilise `TELEGRAM_NOTIFY_BOT_TOKEN` et `TELEGRAM_NOTIFY_CHAT_ID`, mais l'implémentation actuelle ne lit pas ces variables pour ces constantes.

**Correction proposée :** remplacer les constantes par des secrets de déploiement, révoquer/remplacer le jeton exposé et redéployer la fonction. Retirer le texte du code ne révoque pas la copie présente dans l'historique Git. La valeur du jeton n'est pas reproduite dans ce rapport.

Ce point touche les notifications/Concierge, distinctes du bot Carnet. Aucune rotation ou modification de configuration n'a été effectuée pendant cet audit.

### 7.5 Webhook Carnet non authentifié dans le code

`verify_jwt = false` est cohérent avec un webhook Telegram [S1], mais le handler Carnet ne vérifie ni secret de webhook Telegram, ni liste de chats/auteurs autorisés. Il n'effectue pas de contrôle équivalent avant l'utilisation du service role.

**Correction proposée, distincte et testée :** authentifier la provenance du webhook avec le secret Telegram prévu à cet effet et définir le périmètre des chats/auteurs autorisés. Ne pas activer simplement le JWT Supabase sur ce webhook : cela casserait Telegram.

### 7.6 Absence de finalisation atomique et idempotence incomplète

La création de `photos`, l'insertion des images et la mise à jour du lot sont plusieurs opérations indépendantes. Les erreurs d'insertion `photo_images` et de mise à jour du lot ne sont pas vérifiées.

Autres constats :

- aucune contrainte unique sur `(chat_id, message_id)` ou l'identifiant d'update Telegram;
- l'index des lots `pending` ne déduplique pas les messages livrés une nouvelle fois;
- aucune association atomique et unique entre un lot et un brouillon;
- aucun lease ni reprise de lot `processing` interrompu;
- une erreur réseau lors de la notification peut survenir après la création du brouillon;
- le compteur de réconciliation peut être incrémenté même si `finalizeBatch()` a terminé sans créer d'entrée.

Le verrou conditionnel existant est utile mais ne constitue pas une garantie d'idempotence complète. Il ne faut pas le copier comme seul mécanisme mobile.

**Correction mobile indispensable :** état durable, manifest immuable, contrôle d'ownership, prise atomique du lot et transaction DB finale. La suppression d'une entrée Carnet ne doit pas rendre son ancien lot recréable automatiquement lors d'un retry.

### 7.7 Dégradation IA et perte d'audio

Telegram conserve un brouillon même si l'analyse IA échoue, quand un autre contenu est disponible. L'audio non transcrit n'est pas conservé par le pipeline.

Le cahier des charges mobile exige de conserver le lot local après une erreur IA/backend. Le calcul métier commun peut donc être réutilisé, mais **la politique d'acceptation du connecteur mobile doit être plus stricte** : une erreur d'un traitement requis ne produit pas une confirmation `created`. Telegram garde sa politique historique pendant l'extraction.

### 7.8 Limites de validation supplémentaires

- Pas de limites explicites globales de taille/nombre de médias dans `telegram-carnet`.
- Pas de validation complète du schéma IA.
- `description-rewrite` authentifie le compte mais n'autorise pas spécifiquement l'admin.
- Le chargement des réglages peut retomber silencieusement aux défauts.
- Aucun délai explicite des appels IA dans ce pipeline.

Ces points motivent des validations explicites dans le connecteur mobile. Les améliorations Telegram doivent rester des changements séparés du simple déplacement de code.

## 8. Proposition minimale d'architecture

### 8.1 Ce qui reste en place

- Projet Supabase, Supabase Auth, comptes et profils.
- Tables `photos`, `photo_images`, `carnet_settings` et références métier.
- Regroupement, téléchargement, format du webhook et notifications propres à Telegram.
- Concierge et site, sauf adaptations ciblées justifiées par les médias privés ou la projection publique.
- Toutes les migrations existantes.
- Validation/publication humaine des brouillons.
- Pipeline IA et réglages métier côté serveur.

### 8.2 Extraction proposée, limitée et vérifiable

| Unité | Placement proposé | Changement attendu |
|---|---|---|
| Lecture des paramètres et calcul du brouillon | `_shared/carnetProcessor.ts` | Fonctions existantes déplacées, interface normalisée, aucune réécriture de prompts |
| Envoi audio à Whisper | `_shared/carnetTranscription.ts` | Réception d'un fichier indépendant de Telegram |
| Adaptateur Telegram | `telegram-carnet/index.ts` | Garde parsing, batching, téléchargement et messages Telegram; appelle le calcul commun |
| Adaptateur mobile | `mobile-carnet/index.ts` | Auth, autorisation, contrôle des lots/médias, appel du calcul commun et confirmation |
| Commit DB mobile | Fonction SQL privée au backend | Écrit l'entrée, ses images, les liens médias et l'état du lot dans une transaction |

Le moteur commun produit les champs du brouillon. Les adaptateurs gèrent la provenance et le transport; la persistance idempotente mobile ne nécessite pas de dupliquer les prompts ou l'analyse.

Le déplacement du code se fait après des tests de référence. Il doit préserver les choix actuels de langue, provider, titre de repli, limite de six images, priorité légende/transcription et données Telegram.

**Repli en cas de risque :** conserver Telegram inchangé et documenter une duplication temporaire précisément limitée aux routines métier nécessaires. L'APK ne doit jamais appeler le webhook avec de faux messages Telegram. Cette solution de repli n'est pas la recommandation initiale; les fonctions identifiées permettent une extraction ciblée.

### 8.3 Modèle technique mobile proposé

Créer de nouvelles tables techniques, sans détourner les tables Telegram :

| Table proposée | Données minimales | Accès |
|---|---|---|
| `carnet_ingest_batches` | `batch_id` UUID unique, `user_id`, source serveur, version, état, manifest/hash, `carnet_entry_id`, tentative/lease, erreur, dates | Backend; éventuelle lecture propriétaire via API |
| `carnet_ingest_media` | `item_id`, `batch_id`, type, position, MIME, taille, bucket/key, preuve de contenu, lien entrée | Backend; API autorisée pour les aperçus |

Contraintes proposées : positions et identifiants uniques par lot; liens FK; états/types contrôlés; propriétaire fixé à la création; manifest figé dès finalisation. `source = mobile_app` est imposée par le serveur.

Ne pas ajouter de droits généraux de modification de ces tables au client. Le suivi passe par l'Edge Function.

### 8.4 Finalisation sans doublon

1. Le mobile crée une fois son UUID et conserve médias et manifest localement.
2. Le backend enregistre le lot sous l'identité vérifiée et prépare ses chemins d'upload.
3. Les uploads se font sur des chemins déterministes du lot, sans écrasement.
4. Le backend vérifie l'existence réelle, la taille, le type, l'appartenance et la correspondance au manifest; les valeurs du client ne suffisent pas.
5. Une prise atomique attribue une tentative de traitement avec expiration et identifiant de tentative.
6. Le moteur calcule le brouillon. Un résultat IA déjà obtenu peut être conservé côté serveur pour la reprise.
7. Une transaction DB réservée au backend crée `photos`, toutes les lignes `photo_images`, les rattachements médias et le lien lot → entrée, puis passe à `created`.
8. Un retry retourne le même identifiant. Un manifest différent sur un lot figé est rejeté.
9. Une tentative ancienne ne peut pas committer après une reprise : la transaction vérifie le propriétaire du traitement.
10. Après suppression ultérieure de l'entrée, conserver un état terminal/tombstone du lot; ne pas recréer l'article par accident.

Les appels IA et les opérations Storage ne sont pas à inclure dans une transaction SQL longue. Préparer les objets avant le commit; publier la confirmation seulement après le commit. Les objets orphelins éventuels demandent un nettoyage différé contrôlé.

## 9. Storage : décision explicite

### 9.1 Bucket mobile privé

Créer **`carnet-ingest`, privé**. Y conserver images originales, audios, vidéos et uploads non encore finalisés.

Le backend peut générer des URL d'upload signées limitées aux objets d'un lot autorisé. Les clients n'ont pas besoin d'une permission générale sur le bucket. Les URL de lecture signées nécessaires à l'IA ou aux aperçus sont temporaires; les chemins stables sont conservés dans les tables privées.

Un chemin ressemblant à celui de l'utilisateur ne suffit pas à prouver l'ownership. Le serveur contrôle le lot, le média enregistré et l'objet réel. Les uploads doivent être immuables après validation.

Le bucket `concierge-uploads` est public avec dépôt anon/authenticated; il ne répond pas à ce besoin. Un bucket public sert les fichiers sans contrôle de lecture RLS [D4].

### 9.2 Compatibilité avec les images du site

Le site et l'administration lisent directement `image_url` et `photo_images.image_url`, avec des balises image ordinaires. Ils supposent des URL accessibles et stables.

| Option | Effet | Périmètre |
|---|---|---|
| Compatibilité actuelle | Copies finales d'images dans `photos`, bruts audio/vidéo/originaux privés | Peu de changements; images du brouillon publiquement accessibles par URL |
| Confidentialité des brouillons | Images privées jusqu'à validation; URL signées pour l'admin; copies publiques autorisées lors de la publication | Adaptation ciblée de l'affichage admin et de l'action publier |

**Recommandation :** bucket brut privé dans tous les cas; retenir l'option de confidentialité des brouillons pour une version sécurisée. La nécessité d'une petite adaptation admin est démontrée par son accès direct aux URL. La copie publique des images ne doit pas être déclenchée silencieusement à l'upload.

Un lien signé expirant ne doit pas être enregistré comme URL de publication permanente. Ne pas rendre privés les buckets historiques dans cette phase : les URL existantes du site et de Telegram en dépendent.

La politique de dépublication et de rétention des copies publiques doit être explicite; un drapeau `published = false` n'invalide pas à lui seul une URL publique déjà diffusée. Les médias de lots non confirmés ne doivent pas être effacés par un nettoyage trop précoce.

## 10. Vidéo MVP et limite fonctionnelle

La vidéo doit être conservée dans le bucket privé et rattachée au même lot, avec type, ordre, MIME, taille et durée validée si disponible.

Pour le MVP :

- Les photos alimentent l'analyse existante.
- Les vocaux séparés alimentent la transcription existante.
- La vidéo est conservée, sans extraction d'images, transcription de sa piste sonore ni analyse visuelle automatique.
- Un lot vidéo seul peut créer un brouillon minimal avec le titre de repli existant et une indication serveur « vidéo non analysée ». Il ne faut pas inventer une description d'intervention.
- Cette indication et les liens médias restent dans les données privées; l'admin existant ne devient pas automatiquement un lecteur vidéo.

Cette proposition est un choix fonctionnel explicite, à fixer dans le contrat de la phase 2/3. Les références stables des médias permettront ensuite d'ajouter des traitements vidéo serveur sans refaire la capture Android.

Aucune permission de localisation n'est nécessaire. La présence de GPS EXIF historique dans Telegram ne justifie pas une demande de géolocalisation mobile.

## 11. Esquisse d'API à formaliser en phase 2/3

**Cette section est une proposition d'audit, pas un contrat implémenté.** La source canonique future sera uniquement `docs/mobile-carnet-api.md` dans le dépôt web.

Une seule Edge Function `mobile-carnet` peut exposer plusieurs actions versionnées :

| Action proposée | Réponse / responsabilité |
|---|---|
| `capabilities` | Vérifie compte autorisé, version et limites; aucune clé IA ou service role |
| `prepare` | Enregistre ou retrouve le lot, contrôle son propriétaire et retourne les cibles d'upload |
| `finalize` | Vérifie tous les médias et déclenche/reprend la transformation Carnet |
| `status` | Retourne l'état durable et le résultat du même lot |

L'APK utilise la clé publique adaptée au projet et un bearer utilisateur. Le mode de vérification JWT à la passerelle doit être choisi selon la configuration Auth réellement déployée; la fonction vérifie toujours elle-même identité et autorisation. Ne pas copier le `verify_jwt = false` du webhook sans protection équivalente.

Le format proposé contient `api_version`, `batch_id`, `items[]` avec `item_id, type, position, mime_type, byte_size`, et éventuellement un texte. Le propriétaire, la source, le bucket et les chemins autorisés sont déterminés ou contrôlés par le backend.

Réponse de succès terminal proposée :

```json
{
  "success": true,
  "api_version": 1,
  "batch_id": "<uuid>",
  "carnet_entry_id": "<photos.id>",
  "status": "created"
}
```

Une réponse 202 avec `status: processing` confirme seulement une prise en charge. Le mobile interroge `status` et garde le lot. La reprise doit fonctionner après une interruption de worker grâce à l'état DB et au contrôle de tentative; `waitUntil` peut accélérer le traitement mais ne remplace pas cette reprise.

| État | Signification |
|---|---|
| `local` | État du téléphone, pas une entrée serveur |
| `uploading` | Lot enregistré; uploads incomplets |
| `uploaded` | Tous les objets ont été vérifiés |
| `processing` | Traitement pris en charge, succès non acquis |
| `created` | Commit final réussi, identifiant d'entrée disponible |
| `failed` | Erreur décrite; retry selon cause |
| État terminal après suppression | Lot déjà traité; aucune recréation sur retry |

Erreurs proposées : 401 session invalide, 403 autorisation/ownership, 400 payload invalide, 409 lot incompatible, 413 limite dépassée, 415 média non accepté, 429 quota, 502/503 traitement indisponible. Les messages client ne doivent pas contenir de secrets ni les diagnostics fournisseur complets.

**Limites proposées à valider, non présentes aujourd'hui :** 20 médias par lot, 10 MiB par image, 20 MiB par audio, 25 MiB par vidéo, 100 MiB cumulés. Le moteur continue d'analyser six images au maximum. Ajuster durée/résolution de capture et limites Storage au même contrat.

MIME proposés : JPEG/PNG, audio MP4/M4A ou AAC selon le format réellement produit et validé par la transcription, vidéo MP4. Tester les codecs et le type réel des fichiers sur Android. Ne pas annoncer un support universel de `audio/*` ou `video/*`.

Le téléphone conserve les fichiers dans un espace durable de l'application, pas uniquement un cache susceptible d'être purgé. Il restaure le lot après fermeture. Un upload déjà présent est vérifié avant d'être considéré comme terminé.

**Boucle utilisateur :** upload → traitement → réponse `created` avec `carnet_entry_id` → « ✓ Ajouté dans Le Carnet » → suppression locale du lot confirmé → retour caméra après environ une à deux secondes. Tout état non confirmé conserve les médias.

## 12. Liste des changements futurs et leur justification

Aucun élément ci-dessous n'est implémenté par cet audit.

| Changement futur | Pourquoi | Risque / garde-fou |
|---|---|---|
| `docs/mobile-carnet-api.md` | Contrat unique entre les dépôts | Version explicite, documentation app par lien |
| `_shared/carnetProcessor.ts` | Même métier pour Telegram et mobile | Extraction testée, prompts et replis préservés |
| `_shared/carnetTranscription.ts` | Audio brut Android sans dépendance à Telegram | Tests des vrais formats; erreurs explicites |
| `mobile-carnet/index.ts` | Entrée officielle mobile | Auth, autorisation, validation, quotas |
| Entrée correspondante dans `config.toml` | Configuration explicite de l'endpoint | Préserver la configuration des autres fonctions |
| Nouvelle migration des lots/médias + fonction de commit | Ownership, ordre, reprise et idempotence | Contraintes DB; RPC non exécutable par anon/authenticated |
| Nouveau bucket privé + politiques/permissions ciblées | Protection des médias bruts | Aucun accès client général; chemins et tokens contrôlés |
| Nouvelle migration de permissions `profiles/photos/photo_images` | Garantir réellement le droit Carnet et protéger les brouillons | Tests anon/client/admin/service role et site existant |
| Adaptation admin ciblée pour les médias privés | Affichage des images privées et publication compatible | Nécessité démontrée; conserver les URL historiques |
| Correction séparée `telegram-notify` et rotation du secret | Jeton exposé, incohérence README/code | Vérifier notifications après redéploiement |
| Protection séparée du webhook / réécriture | Contrôle de provenance et droit d'utiliser les API IA | Aucun changement global de JWT cassant les usages publics |

Il est possible de regrouper les ajouts techniques dans une nouvelle migration et le durcissement dans une autre, pour isoler les risques. Aucun fichier de migration historique ne doit être réécrit.

La branche d'implémentation demandée reste `feature/mobile-carnet-connector`. L'audit seul est conservé sur une branche documentaire distincte afin de ne pas confondre rapport et implémentation.

## 13. Vérifications réalisées et tests nécessaires ensuite

### 13.1 Réalisé pendant la phase 1

| Vérification | Résultat |
|---|---|
| Accès GitHub au dépôt et droits | Lecture et écriture disponibles; dépôt public |
| Lecture de l'arbre à la référence auditée | Non tronqué; commit identifié |
| Récupération des fichiers utiles | 55 fichiers, dont 32 migrations, 5 handlers et leur configuration associée |
| Intégrité des copies locales | SHA Git des 55 blobs comparés au contenu récupéré |
| Succession des politiques RLS | Les trois anciennes écritures `auth_*_photos`, `update_own_profile` et les lectures publiques ouvertes subsistent dans les migrations |
| Pipeline métier | Création de brouillon, transcription, paramètres, sorties IA et médias examinés |
| Contrat de confirmation | Absence de `carnet_entry_id` dans la réponse HTTP Telegram confirmée |
| Vidéo, moteur partagé, API mobile | Absents du pipeline Carnet audité |
| Tests présents dans Git | Six scénarios Playwright du robot Concierge; aucune suite Carnet/Telegram trouvée |

Ces contrôles sont statiques. **Aucun test réel de connexion, RLS en base, Telegram, IA ou Storage n'a été exécuté.** Aucun webhook réel n'a été appelé et aucune entrée n'a été créée en production.

Deno, Supabase CLI et PostgreSQL ne sont pas disponibles comme exécutables dans cet environnement. La récupération par GitHub ne fournit pas non plus un projet Supabase de test. Aucun build Android ne peut être revendiqué dans cette phase.

Un build/lint web n'a pas été exécuté : le seul changement livré est un document. Le README signale des problèmes de lint antérieurs; ce signalement n'a pas été revérifié.

### 13.2 À prévoir avant toute extraction ou déploiement

| Domaine | Tests requis |
|---|---|
| Référence Telegram | Photo seule, plusieurs photos, album, vocal, texte, légende + vocal, langues, provider/configuration, absence de clé, JSON invalide, échec transcription |
| Parité moteur | Mêmes contenus normalisés et mêmes réglages; comparer les champs hors provenance avec fournisseur IA simulé |
| Régression Telegram | Webhook, regroupement temporel, auteur/commune, notifications, brouillons et validation admin |
| Autorisation | Anon, client, admin, profil absent, rôle retiré, JWT expiré; impossibilité de s'attribuer le rôle |
| RLS/Storage | Écritures directes non admin refusées, brouillons privés, objets d'un autre compte refusés, absence de fuite audio/vidéo |
| Idempotence | Double clic, retry après commit sans réponse, deux finalisations concurrentes, reprise d'une tentative expirée, payload changé, suppression ultérieure |
| Intégrité médias | Upload absent/tronqué, MIME réel incorrect, taille/nombre/total excessifs, ordre mixte conservé, aucune confirmation partielle |
| Pannes | Coupure réseau, erreur IA, transcription, DB, Storage, worker interrompu; lot local préservé |
| Site et admin | Billets publiés, brouillons, couvertures, publication/dépublication, ancien Carnet, pièces jointes Concierge |
| Android ultérieur | Login, refresh/session, permissions, photo multiple, aperçu/suppression, vocal maintien/verrouillage, vidéo appui long, restauration après fermeture, changement de compte et retour caméra |
| APK | Build reproductible, installation appareil réel, aucun secret privilégié, aucun appel IA direct |

Les tests de comparaison doivent distinguer extraction à comportement constant et corrections d'anomalies. Ne pas modifier silencieusement les règles Telegram en même temps que leur déplacement.

## 14. Compte rendu de phase et suite

- **Branche source :** `main`.
- **Commit source audité :** `c765e8cc8312929d84ae9f440a9d38e87d46b683`.
- **Branche documentaire :** `docs/mobile-carnet-audit`.
- **Fichier créé :** `CURRENT_BACKEND_AUDIT.md`.
- **Fichiers backend/frontend/migrations modifiés :** aucun.
- **Modification métier :** aucune.
- **Vérifications :** intégrité des sources et inspection statique détaillée; aucun test de production.
- **Risques prioritaires :** permissions de rôle/écriture/lecture, jeton Telegram exposé, confirmation non atomique et reprise de traitement.
- **À confirmer en phase 2 :** état réel du Supabase déployé, comptes autorisés, option images privées/publication, limites médias, reprise serveur et périmètre de l'extraction.
- **Phases suivantes non commencées :** migrations, connecteur mobile, dépôt `CelecCarnetApp`, maquettes, Auth Android, capture, upload et APK.

**Point d'arrêt demandé : fin de la phase 1.** Le document livre la proposition minimale pour la phase 2; il ne vaut pas validation d'un backend modifié.

## Annexe — Sources figées et documentation primaire

### Code du dépôt

Toutes les sources de code ci-dessous utilisent le commit audité.

- **S1** — [Configuration des fonctions](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/config.toml).
- **S2** — [Client Supabase du site](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/src/lib/supabase.ts).
- **S3** — [LoginModal](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/src/components/LoginModal.tsx).
- **S4** — [App : session, Carnet et connexion admin](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/src/App.tsx).
- **S5** — [Administration Carnet](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/src/components/AdminDashboard.tsx).
- **S6** — [telegram-carnet : réception 72, regroupement 263, réconciliation 405, finalisation 459, IA 683, transcription 888](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/functions/telegram-carnet/index.ts).
- **S7** — [Tables Telegram](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260921001935_add_minimax_and_telegram_batching.sql) et [index unique pending](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260921002055_telegram_batches_unique_pending_group.sql).
- **S8** — [Réglages Carnet](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260920232553_create_carnet_settings_table.sql), complétés par les migrations MiniMax, langue et rewrite_model examinées.
- **S9** — [description-rewrite](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/functions/description-rewrite/index.ts).
- **S10** — [Colonnes IA](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260920230409_add_ai_analysis_columns_to_photos.sql), [images multiples](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260902233307_create_photo_images_table.sql) et [Storage/admin photos](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260902232459_add_author_image_url_to_photos_and_storage.sql).
- **S11** — [Type d'entrée](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20261005145346_add_entry_type_to_photos.sql) et [modèle de réécriture](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20261005151341_add_rewrite_model_to_carnet_settings.sql).
- **S12** — [is_admin et correction de la récursion RLS](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260902232027_fix_admin_profiles_policy.sql).
- **S13** — [Profils, politique update_own_profile et trigger utilisateur](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260902220757_create_profiles_and_link_requests.sql).
- **S14** — [Policies initiales photos, lignes 36–50](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260902101557_create_photos_table_with_demo_data.sql).
- **S15** — [Connaissances Carnet du Concierge](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/src/concierge/services/knowledge.ts) et [bucket Concierge](https://github.com/clamartcelec-bot/Celecweb00h16/blob/c765e8cc8312929d84ae9f440a9d38e87d46b683/supabase/migrations/20260921020456_create_concierge_uploads_bucket.sql).

Le constat du jeton concerne le fichier `supabase/functions/telegram-notify/index.ts` au même commit; la valeur sensible n'est pas copiée dans le livrable.

### Documentation primaire consultée le 5 octobre 2026

- **D1** — [PostgreSQL : combinaison des politiques RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- **D2** — [Supabase : limites des Edge Functions hébergées](https://supabase.com/docs/guides/functions/limits).
- **D3** — [Supabase : tâches en arrière-plan et limites de waitUntil](https://supabase.com/docs/guides/functions/background-tasks).
- **D4** — [Supabase : buckets publics et privés](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- **D5** — [Supabase : droits au niveau des colonnes](https://supabase.com/docs/guides/database/postgres/column-level-security).
