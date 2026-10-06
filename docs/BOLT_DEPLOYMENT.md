# Mise en test du connecteur Le Carnet CELEC

## Périmètre et responsabilités

Le code serveur et les adaptations de pages sont dans `clamartcelec-bot/Celecweb00h16`, branche `feature/mobile-carnet-connector`, basée sur le commit de sécurité Bolt `1835f6af906e74b57c5c1d91ca793eaaeeea1743`. La base et les comptes restent **dans le projet Bolt actuel**. L'assistant qui prépare ce code n'a effectué aucun accès à cette base. L'agent Bolt applique et vérifie les changements avec ses propres accès ; aucune clé serveur ne doit lui être recopiée dans ce dossier.

L'application Android est livrée séparément avec son code, package-lock.json, profil EAS `preview` et tests. Son code existe : les tables ci-dessous sont utilisées directement par `mobile-carnet` et `carnet-media`, appelées par Android et par `AdminDashboard.tsx`. Les anciens documents d'audit et d'architecture restent des instantanés ; ce dossier et les fichiers d'implémentation sont la référence de déploiement actuelle.

### Choix arrêtés

Admin uniquement dans cette version. Capture Android → même moteur Carnet que Telegram → brouillon dans `photos` → publication volontaire depuis l'administration. Photos ordonnées ; vocaux transcrits côté serveur ; vidéos privées conservées sans analyse. Reprise du même lot après coupure, aucune purge Android avant reçu de création. Pas de nouveau compte, de GPS, de carte ou de moteur vectoriel dans cette livraison. Les marques identifiées utilisent `detected_brands`, la colonne existante. Les futurs droits techniciens et la recherche sémantique seront ajoutés dans une autre étape.

## Ordre pour l'agent Bolt

1. Récupérer la branche complète et examiner sa différence avec main. Conserver le correctif de sécurité déjà appliqué ; conserver la configuration `TELEGRAM_NOTIFY_*` existante. Aucun changement de jeton n'est demandé ici.
2. Comparer le schéma réel aux dépendances : `profiles(id,full_name,email,role)`, `photos(id,title,description,author,city,lat,lng,published,image_url,source,voice_transcript,ai_summary,detected_brands,raw_data)`, `photo_images(id,photo_id,image_url,position)`, `auth.users`, les tables/colonnes Storage et `carnet_settings` lues dans `_shared/carnetProcessor.ts`. La colonne `source` doit accepter `mobile_app`, les URL de brouillon peuvent être `''`, et `lat/lng` restent les valeurs héritées 0 en absence de géolocalisation ; ne pas les interpréter comme coordonnées d'une future carte. Si une dépendance diffère, adapter la migration et le code ensemble et rendre compte du changement.
3. Pour le projet actuel, Bolt annonce les deux migrations déjà appliquées : **ne pas les rejouer**. Les fichiers canoniques conservés, dans cet ordre, sont : `supabase/migrations/20261006120757_20261006100000_mobile_carnet_ingestion.sql`, puis `supabase/migrations/20261006120815_20261006100100_mobile_carnet_media_admin.sql`. Elles créent deux tables techniques, les RPC, protections de modification et un bucket privé `carnet-ingest`. Aucun billet, profil ou image existant à modifier. Ne pas créer les tables manuellement à partir d'une ancienne description.
4. Vérifier les permissions effectives : pas de lecture/écriture directe client/anon sur les nouvelles tables ; RPC réservées à service_role ; aucun accès global client/anon sur `carnet-ingest`. Les autorisations signées de dépôt sont émises après authentification admin, et les objets restent immuables. Ne pas durcir le bucket public `photos` existant ni les flux Telegram/manuels.
5. Déployer `mobile-carnet` et `carnet-media` **avec `_shared`**, configuration `verify_jwt=false` conforme à `supabase/config.toml` : chaque handler vérifie explicitement Auth.getUser et le rôle admin. Déployer également le `telegram-carnet` refactorisé, avec `_shared`, et `description-rewrite` qui exige désormais le rôle admin. La logique IA Telegram est vérifiée contre le code audité par les tests de régression. Pas de modification de `telegram-notify` dans cette branche par rapport au correctif Bolt.
6. Vérifier dans la configuration serveur déjà en place les noms `SUPABASE_URL`, la clé publique et la clé serveur de son runtime (ou les objets `SUPABASE_PUBLISHABLE_KEYS.default` / `SUPABASE_SECRET_KEYS.default`), et les fournisseurs `OPENAI_API_KEY`, `MINIMAX_API_KEY` ou `MINIMAX_M3_API_KEY` selon les réglages. Pour les vocaux avec auto_transcribe actif, OpenAI/Whisper est nécessaire. Ne jamais exposer ces valeurs dans un compte rendu ou l'APK.
7. Publier une prévisualisation du frontend de cette branche et préparer l'application avec l'URL publique de **ce même projet** et sa clé anon/publishable. Ces valeurs sont du paramétrage public applicatif ; aucune clé service_role. Le paquet sans configuration propose une préparation initiale sur le téléphone. Le compte utilisé doit déjà être admin dans les profils ; aucune promotion de rôle automatique.
8. Exécuter la recette ci-dessous. Retourner les résultats avant de déclarer le connecteur opérationnel. L'APK peut ensuite être distribuée pour test interne ; fusion/déploiement du site doivent rester coordonnés avec la disponibilité des fonctions.

Le retour Bolt reçu le 6 octobre confirme les transactions en base et le déploiement. La prochaine étape est `NETWORK_RECIPE.md`, puis `ANDROID_TEST_GUIDE.md`. Les copies de migrations retirées et la configuration des deux fonctions sont expliquées dans ce nouveau dossier ; aucun nouveau changement de structure n’est demandé.

## Pages modifiées

`AdminDashboard.tsx` identifie les billets `source=mobile_app`, charge les aperçus privés signés, affiche la transcription à l'administrateur et conserve les champs éditables habituels. Ajouter/retirer une image, choisir une couverture, publier, dépublier ou supprimer un billet mobile passe par `carnet-media`. Les opérations existantes sur les billets manuels et Telegram continuent avec leur flux actuel. Les nouveaux brouillons n'apparaissent au public qu'après publication.

Les URL d'aperçu ne sont stockées qu'en mémoire. Les photos publiques sont des copies distinctes ; audio/vidéo et diagnostics restent dans le bucket ou les tables privés. Une file de nettoyage durable garde la trace des copies à retirer, y compris si le billet a été supprimé. Pour reprendre un nettoyage, l'admin appelle `carnet-media` avec `action=cleanup` et l'UUID `entry_id` original. Ne pas supprimer les tables techniques pour nettoyer : elles portent les reçus et les tombstones contre les doublons.

## Recette d'intégration à effectuer par Bolt et sur téléphone

| Essai | Résultat attendu |
| --- | --- |
| Capabilities sans session puis avec compte client | 401 puis 403 ; aucun lot créé |
| Admin : photo + vocal + photo + vidéo + second vocal | Un seul brouillon, ordre des médias conservé, images dans leur ordre relatif ; vidéo privée sans analyse |
| Upload partiel et reprise du même UUID | Seuls les objets non vérifiés à reprendre ; une entrée finale au maximum |
| Réponse de commit perdue, nouvel envoi | Même carnet_entry_id, reçu récupéré, aucun nouveau billet |
| IA indisponible | Erreur reprise possible ; pas de billet déclaré créé, copie locale conservée |
| Taille, type ou empreinte incompatibles | Refus ; tentative suivante change la génération de l'objet invalide |
| Deux finalisations du même lot / tentative périmée | Une seule tentative autorisée à écrire ; une seule entrée |
| Retrait du rôle admin pendant traitement | Plus de commit ni de mutation via cette identité ; fichiers locaux conservés |
| Brouillon : REST public + objet privé | Billet invisible, galerie invisible, origine privée non lisible sans autorisation |
| Publier, retirer image, changer couverture, dépublier | Références cohérentes ; copies publiques retirées ou cleanup_pending signalé et repris |
| Supprimer billet puis reprendre ancien lot | 410 entry_deleted ; aucune recréation ; cleanup encore possible |
| Ajout d'image admin puis réponse perdue | Objet validé/réutilisé, pas de galerie dupliquée |
| Téléphone fermé puis rouvert, compte changé | Journal retrouvé par le bon compte ; aucun mélange entre comptes |
| Photo / appui long vidéo / vocal verrouillé / interruption | Sauvegarde confirmée localement, arrêt et ordre corrects sur le matériel cible |
| Import Telegram et éditeur manuel | Même résultat Carnet qu'avant, aucun envoi bloqué par limites du nouveau bucket privé |

## Validation déjà effectuée et limites

Tests locaux sur Postgres embarqué PGlite (aucune base réelle), requêtes HTTP/Auth simulées sans accès réseau, régression moteur IA/Whisper, tests Android du protocole de reçu et de reprise. TypeScript frontend et Deno vérifiés, frontend Vite compilé ; typecheck/lint, tests et export Android vérifiés. Les résultats précis sont consignés dans `IMPLEMENTATION_STATUS.md`. Les migrations sont testées contre un schéma minimal fidèle au dépôt ; l'agent Bolt reste responsable de leur compatibilité avec son schéma réel et son Storage.

Storage et Postgres ne sont pas une transaction unique. Les copies de publication et la suppression d'objets doivent être testées dans son runtime réel, ainsi que les délais/cache de dépublication. Les limites de durée audio/vidéo sont imposées par la capture ; le serveur vérifie conteneurs/tailles/empreintes et ne décode pas les vidéos. Une fermeture normale est prise en charge ; une désinstallation, un effacement des données ou un arrêt brutal pendant un fichier encore en cours ne constitue pas une capture sauvegardée. Aucune mise en test réelle sur Bolt ni validation matérielle n'a été effectuée par l'assistant préparateur.
