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

Vérifications réussies : TypeScript, ESLint, cinq tests du protocole Android/reprise/purge, export Android/Hermes via Metro. APK locale autonome produite : `Le-Carnet-CELEC-0.1.0-test-arm64.apk`, 54 626 775 octets, `fr.celec.carnet`, version 0.1.0, minSdk 24 / targetSdk 36, ARM64. Signature APK v2 valide ; bundle Hermes embarqué et présence du dernier contrôle d'intégrité du journal vérifiés. Empreinte SHA-256 : `ca3b436ac52ed757fae8d4386cd74f11d84b5ffc0da1aabdc7dcc50a531a9208`. Signée pour le test avec le certificat de développement ; configuration publique du projet à renseigner avant connexion réelle. Les gestes, prises de son/vidéo, stockage natif et interruptions restent à essayer sur le téléphone cible.

## Mise en test réelle

L'agent Bolt doit vérifier le schéma, appliquer les deux migrations livrées, déployer les fonctions avec _shared et le frontend de test, configurer les valeurs publiques Android, puis effectuer `BOLT_DEPLOYMENT.md`. Aucun test de bout en bout sur Bolt, aucune publication du site de production et aucune validation matérielle ne sont annoncés comme réalisés ici. Les fonctions et le frontend doivent être livrés ensemble avant d'activer le connecteur auprès des testeurs.

Les fonctions Storage ne partagent pas la transaction Postgres : nettoyer/reprendre `cleanup_paths` si nécessaire et vérifier les caches lors d'une dépublication. L'application ne résiste pas à une désinstallation/effacement des données Android et ne garantit pas une prise encore en cours lors d'un arrêt brutal. La vidéo n'est pas décodée ni analysée par le serveur.

Le dépôt GitHub Android distinct `clamartcelec-bot/CelecCarnetApp` n'est pas accessible via la connexion actuelle (404). Sources livrées séparément dans `CelecCarnetApp-0.1.0-sources.zip`, prêtes à importer dans ce dépôt ; le connecteur serveur et les pages sont versionnés dans cette PR.

## Retour Bolt et passage à la recette réseau

Selon le compte rendu fourni par l’utilisateur, Bolt a appliqué les deux migrations, déployé les fonctions/pages et validé les transactions, protections, lots mixtes, reprise, publication et tombstones au niveau de la base. Les essais réseau/Storage/fournisseurs et matériels restent non exécutés dans ce compte rendu. Ce sont des résultats rapportés par l’opérateur, pas une connexion ou vérification directe du préparateur.

Main Bolt `a994f3827390cb88d3d92eb0876e9ae96d3d1648` récupérée : même code serveur et pages que la livraison, deux versions identiques de chaque migration, et verify_jwt=true pour les deux nouvelles fonctions. La branche synchronise main, retire uniquement les anciennes copies de migration, actualise les références et garde une seule section par fonction avec verify_jwt=false ; les vérifications Auth.getUser + profil admin restent obligatoires. Aucun changement aux autres fonctions, aucun SQL supplémentaire à exécuter. Bolt doit rapprocher les noms conservés de son registre avant synchronisation.

Livrés : recette HTTP exécutable par l’opérateur (`scripts/carnet-network-check.ts`), journal de reprise sans jeton, rapports sans secrets, guide de test Android et instructions réseau. Neuf tests de recette/déploiement supplémentaires réussis sur serveur HTTP local simulé, avec interruption d’upload, reprise, publication/nettoyage et refus des mauvaises réponses. Les douze tests précédents ont également réussi sur les chemins canoniques. TypeScript du site et compilation Vite réussis. L’APK 0.1.0 n’a pas été modifiée ; protocole Android inchangé. Aucune connexion à Auth/Storage/IA ou à la base Bolt réelle par le préparateur.
