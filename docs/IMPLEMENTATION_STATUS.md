# État vérifié de la livraison — 6 octobre 2026

Base de code : main Bolt `1835f6af906e74b57c5c1d91ca793eaaeeea1743`. La préparation n'a accédé à aucune base réelle ni récupéré ses identifiants. Les correctifs de sécurité Bolt sont conservés, et aucune opération sur les jetons Telegram n'est demandée.

## Code serveur et pages

Implémentés : processeur Carnet partagé avec régression Telegram, transcription commune, mobile-carnet, carnet-media, migrations d'ingestion privée et de publication, protections de rôles/manifest/tentatives, tombstones, copies publiques avec file de nettoyage, adaptation ciblée d'AdminDashboard et contrôle admin de description-rewrite. Main n'est pas modifiée par la préparation ; livraison sur branche dédiée.

Vérifications locales réussies :

- `npm run typecheck` et `npm run build` du site ; avertissement Vite existant sur la taille du bundle.
- Douze tests Node : permissions/drafts, lot unique/manifest immuable, tentatives périmées/rôle révoqué, publication/dépublication/suppression/nettoyage, rollback atomique de création, quota et reprise d'ajout admin, formats/empreinte/ordre, régression prompt/payload/provider/champs de sortie et Whisper.
- Deno check des fonctions mobile-carnet, carnet-media, telegram-carnet et description-rewrite.
- Un test HTTP Deno : sans session 401, client 403 sur ingestion et preview, admin accepté, version/manifest invalide refusés. HTTP simulé, aucun accès réseau à une base.

PGlite est un Postgres embarqué local avec un schéma minimal issu du dépôt : ces essais ne valident pas les politiques effectives, migrations antérieures ou fonctionnalités Storage du projet Bolt réel.

## Application Android

Code capture, vocal verrouillable, journal SQLite et fichiers privés, Auth/SecureStore, lots par compte/projet, transmission signée, reprise par UUID, reçu strict et purge différée. Caméra/microphone uniquement en permissions demandées. SDK Expo 57, Android généré par prebuild, profil EAS preview prévu pour APK.

Vérifications réussies : TypeScript, ESLint, cinq tests du protocole Android/reprise/purge, export Android/Hermes via Metro. Compilation native et état du paquet : voir le README de l'archive de livraison. Les gestes, prises de son/vidéo, stockage natif et interruptions restent à essayer sur le téléphone cible.

## Mise en test réelle

L'agent Bolt doit vérifier le schéma, appliquer les deux migrations livrées, déployer les fonctions avec _shared et le frontend de test, configurer les valeurs publiques Android, puis effectuer `BOLT_DEPLOYMENT.md`. Aucun test de bout en bout sur Bolt, aucune publication du site de production et aucune validation matérielle ne sont annoncés comme réalisés ici. Les fonctions et le frontend doivent être livrés ensemble avant d'activer le connecteur auprès des testeurs.

Les fonctions Storage ne partagent pas la transaction Postgres : nettoyer/reprendre `cleanup_paths` si nécessaire et vérifier les caches lors d'une dépublication. L'application ne résiste pas à une désinstallation/effacement des données Android et ne garantit pas une prise encore en cours lors d'un arrêt brutal. La vidéo n'est pas décodée ni analysée par le serveur.
