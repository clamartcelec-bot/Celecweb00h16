# Recette réseau après le déploiement Bolt

Le retour Bolt du 6 octobre confirme l'application des deux migrations et la recette des transactions en base. C'est un compte rendu de l'opérateur ; le préparateur n'a pas effectué de connexion à cette base. Les essais HTTP, Storage, Whisper, IA et Android n'ont pas encore été déclarés réussis dans cet environnement.

## Corrections du dépôt avant la recette

Le main `a994f3827390cb88d3d92eb0876e9ae96d3d1648` contient le même code serveur/pages que la livraison, mais `verify_jwt=true` pour les deux nouvelles fonctions. La branche remet `false` et conserve le contrôle obligatoire `Auth.getUser` puis profil admin dans `requireAdmin`. Ce choix permet au handler de produire les erreurs 401 structurées en version 1 attendues par l'APK, y compris pour renouveler une session expirée. Il ne supprime pas l'authentification. La vérification de plateforme peut répondre avant le handler : [documentation officielle](https://supabase.com/docs/guides/functions/auth-headers). Aucun autre flag de fonction n'est modifié.

Bolt a également versionné deux copies identiques de chaque migration. La branche garde uniquement les fichiers générés par Bolt :

- `20261006120757_20261006100000_mobile_carnet_ingestion.sql`
- `20261006120815_20261006100100_mobile_carnet_media_admin.sql`

Le contenu des copies a été comparé octet par octet. Les anciens chemins sont retirés et les références/tests adaptés. **Aucune nouvelle migration ni réexécution de CREATE TABLE n'est demandée.** Bolt doit vérifier que ces versions correspondent à son registre des migrations appliquées avant une future synchronisation. Si son registre contient les anciennes versions, il doit aligner les noms conservés sur ce registre sans rejouer le contenu. Le préparateur n'a pas inspecté ce registre.

Redéployer `mobile-carnet` et `carnet-media` avec cette configuration, puis vérifier les 401/403 et le POST admin réellement transmis via HTTPS. Les handlers, paramètres IA, rôles, comptes, bucket public et contrat Android ne changent pas. L'APK 0.1.0 existante reste celle à essayer.

## Outil à exécuter par Bolt

`scripts/carnet-network-check.ts` effectue les appels HTTP réels uniquement avec le drapeau explicite `--live`. Sans ce drapeau, il affiche son mode d'emploi sans requête ni modification de fichier. Aucun SQL, aucune clé serveur, aucune création de compte, aucun changement de rôle ou de réglage IA.

Préparer dans un dossier local ignoré par Git, par exemple `carnet-recipe-local/`, deux photos JPEG/PNG, deux courts vocaux **réels et intelligibles** M4A/AAC, et une vidéo MP4. Utiliser des contenus de test sans données clients. Les faux en-têtes, audio silencieux et simulations de fournisseur ne valident pas cette recette réelle. Créer `fixtures.json` :

```json
{
  "text": "RECETTE CELEC — contenu fictif de validation, à supprimer. Test du connecteur Carnet.",
  "files": [
    { "path": "photo-1.jpg", "type": "image", "mime_type": "image/jpeg" },
    { "path": "vocal-1.m4a", "type": "audio", "mime_type": "audio/mp4" },
    { "path": "photo-2.jpg", "type": "image", "mime_type": "image/jpeg" },
    { "path": "video.mp4", "type": "video", "mime_type": "video/mp4" },
    { "path": "vocal-2.m4a", "type": "audio", "mime_type": "audio/mp4" }
  ]
}
```

L'opérateur prépare uniquement dans son environnement local :

| Variable | Valeur à utiliser |
| --- | --- |
| `CARNET_PROJECT_URL` | URL HTTPS publique du projet Bolt actuel |
| `CARNET_PUBLIC_KEY` | Clé anon ou publishable de ce même projet |
| `CARNET_ADMIN_TOKEN` | Session utilisateur actuelle d'un administrateur de test |
| `CARNET_CLIENT_TOKEN` | Session utilisateur actuelle d'un compte client de test |

Les sessions utilisateur sont obtenues avec les comptes déjà disponibles chez Bolt. Ne pas remplacer un token utilisateur par la clé publique ou une clé serveur. Ne pas recopier ces valeurs dans une réponse, un ticket, les arguments de commande ou le dépôt. Le préparateur ne demande aucun de ces identifiants. L'absence de session client est signalée comme contrôle non exécuté.

```sh
npm ci
npm run check:carnet-network -- --live \
  --fixtures carnet-recipe-local/fixtures.json \
  --journal carnet-recipe-local/journal.json \
  --report carnet-recipe-local/rapport.json
```

Ce premier passage reste privé. Il crée puis supprime seulement son nouveau billet de test. Pour tester aussi la copie entre buckets et les URL publiques, ajouter `--publication` et utiliser un **nouveau chemin de journal** pour ce nouvel essai. Ce mode publie brièvement le billet fictif créé par la recette ; si le site de production partage la même base, ce billet peut y apparaître durant l'essai. L'opérateur doit choisir son environnement de test en conséquence.

Si un envoi ou le traitement échoue, réutiliser **le même journal et les mêmes fichiers**. Le UUID et le manifeste sont conservés ; les fichiers locaux ne sont jamais supprimés par l'outil. Un nettoyage interrompu après suppression peut être repris avec le journal sauvegardé et le même identifiant d'origine. Aucun nouvel UUID n'est attribué automatiquement à une reprise.

## Preuves vérifiées et compte rendu

- CORS, refus sans session ou avec session invalide, refus client, capacités admin.
- SHA-256 et conteneurs locaux, ordre mixte, autorisations signées et uploads binaires PUT.
- Réponses intermédiaires 202, création avec reçu strict et récupération/répétition du même reçu par le même UUID. L'outil ignore volontairement une réponse finale puis la récupère ; la coupure physique du réseau reste à essayer sur téléphone.
- Brouillon réellement privé en lecture visiteur/client, transcriptions des deux vocaux côté privé, fournisseur IA et résumé présents. L'opérateur doit également lire le résultat pour vérifier la qualité de transcription et d'analyse ; les métadonnées seules ne prouvent pas leur exactitude.
- Téléchargement signé des deux images avec comparaison d'empreinte ; chaque chemin d'original est refusé par l'URL publique du bucket privé.
- Avec `--publication` : copie publique téléchargée et comparée, couverture, retrait d'image, dépublication, suppression des URL publiques avec une requête fraîche.
- Suppression du seul billet de recette, nettoyage public et refus de recréation du UUID supprimé.

Le rapport contient les étapes, codes sûrs, UUID et état de nettoyage, **aucun mot de passe, clé, session, URL signée, transcript ou diagnostic fournisseur brut**. `success=true` signifie que les contrôles exécutés ont réussi ; les contrôles `skipped` et `pending` empêchent de conclure que l'ensemble du produit est opérationnel. Si une ancienne URL publique reste accessible, `public_cleanup_or_cache_pending` est un échec à investiguer côté Storage/cache, sans le masquer.

La suppression de billet ne purge actuellement pas les originaux du bucket privé. Le rapport l'indique toujours. Après une recette terminée, **Bolt peut retirer uniquement les originaux fictifs listés par le journal**, avec ses propres accès Storage ; conserver les lignes techniques et le tombstone. Après un échec avant création, reprendre le même journal ou faire inspecter par Bolt ce UUID précis ; ne pas effacer indistinctement les lots en cours.

Retour attendu : rapport JSON sans secrets, état effectif des flags de déploiement, correspondance du registre des migrations, URL de prévisualisation si disponible, résultats de la vérification humaine des textes, puis recette Android. Une impossibilité réseau doit être annoncée ; une vérification SQL ne doit pas être présentée comme ce test HTTP.

## Validation locale du préparateur

L'outil a été essayé sur un serveur HTTP de boucle locale avec Auth/Storage/IA simulés : parcours complet, coupure après stockage avant réponse, reprise UUID, réponse 202, URL externe refusée, reçu d'un autre lot refusé, transcript absent, échec de nettoyage et reprise après tombstone. Aucun fournisseur ni projet Bolt contacté par ces essais. Ces tests valident l'outil de recette, pas le déploiement réel.
