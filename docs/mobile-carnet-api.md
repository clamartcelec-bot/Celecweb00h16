# API mobile Carnet — version 1

Statut : code implémenté et testé localement sur `feature/mobile-carnet-connector`. La base reste chez Bolt : seul son agent autorisé applique les migrations et déploie les fonctions. Aucune connexion à la base réelle n'a été effectuée depuis cette préparation. Ce fichier est le contrat canonique ; `BOLT_DEPLOYMENT.md` précise l'ordre de mise en test.

## Authentification

Même Supabase Auth que le site. Chaque appel à `mobile-carnet` et `carnet-media` exige `Authorization: Bearer <JWT utilisateur>` et la clé publique dans `apikey`. La fonction vérifie l'utilisateur auprès d'Auth et le profil `admin`. Aucun secret serveur dans l'APK. `verify_jwt = false` des nouvelles fonctions ne remplace pas ce contrôle obligatoire.

MVP : accès admin uniquement. Futur : droit technicien de capture distinct du droit admin de publication. Pas d'inscription dans l'APK.

## Endpoint mobile

`POST /functions/v1/mobile-carnet`, JSON limité à 64 KiB, `api_version: 1` et une action parmi `capabilities`, `prepare`, `finalize`, `status`.

| Action | Champs | Effet |
|---|---|---|
| capabilities | api_version, action | Identité autorisée, limites et formats |
| prepare | api_version, action, batch_id, text, items | Réserve un lot / retrouve le même manifest, fournit les uploads manquants |
| finalize | api_version, action, batch_id | Vérifie les objets, transcrit / analyse côté serveur et crée le brouillon atomiquement |
| status | api_version, action, batch_id | Lit l'état durable du lot du propriétaire |

Un item : `item_id` UUID, `type` image/audio/video, `position` entière 0..N−1, `mime_type`, `byte_size` et `sha256` hexadécimal de 64 caractères ; `duration_ms` facultative. L'ordre est global. Le serveur impose propriétaire, source et chemins. Le manifest est figé au premier `prepare`; le même UUID avec un autre manifest est refusé.

Formats : image/jpeg, image/png, audio/mp4 (M4A/AAC), video/mp4. Limites : vingt médias, 10 MiB par image, 20 MiB par vocal, 25 MiB par vidéo, 100 MiB par lot. Texte facultatif : 4 000 caractères ; minimum un média. Six images au maximum transmises à l'IA, toutes conservées. Vidéo conservée privée et non analysée ; aucune transcription de sa piste sonore.

Les uploads utilisent les autorisations signées retournées par `prepare`, `upsert = false`. Aucun upload global autorisé par RLS. Après coupure, le fichier courant peut être retransmis intégralement. Les objets sont vérifiés côté serveur avant confirmation.

## Réponses et reprise

États : uploading, uploaded, processing, failed, created, deleted. Pendant processing, `stage` précise verify/transcribe/analyze/commit. `retry_after_seconds` indique l'attente. Une réponse 202 ne confirme jamais la création. Les étapes validées sont mémorisées et une tentative périmée peut être reprise par `finalize`.

Seul le reçu suivant autorise la purge locale, après sauvegarde du reçu dans le journal Android :

```json
{"success":true,"api_version":1,"batch_id":"d7a85540-6748-4c32-bbb6-82b2a69c22dc","status":"created","carnet_entry_id":"8b429c35-a387-478b-8d02-1fe3dc1d5066"}
```

Le UUID reste identique après timeout, fermeture, reconnexion ou erreur IA. `status` résout une réponse perdue après commit. Une répétition retourne le même identifiant. Une suppression admin laisse un tombstone, renvoie 410 et ne recrée pas l'entrée.

Erreurs structurées : `success:false`, `code`, `message`, `retryable` et version. 400 payload/action/version ; 401 Auth ; 403 rôle ; 404 lot inaccessible ; 409 manifest / média ; 410 entrée supprimée ; 413 taille ; 415 type ; 429 quota ; 502/503 fournisseur / service. Aucun diagnostic fournisseur brut dans la réponse client.

## Administration et confidentialité

`POST /functions/v1/carnet-media` est réservé aux admins. Actions : preview, set_cover, publish, unpublish, remove_image, prepare_image, attach_image, delete_entry, cleanup. Identifiants d'entrée et média résolus côté serveur. Les transcriptions, diagnostics et originaux mobiles restent privés. Les aperçus signés expirent après cinq minutes ; ces URL ne sont jamais persistées dans les colonnes d'article.

Un brouillon mobile est dans `photos`, source mobile_app, published=false. Ses images sont liées dans photo_images mais leurs URL permanentes restent vides jusqu'à publication. Le backend copie uniquement les images validées dans le bucket public photos après l'action Publier, puis met à jour les références et published en transaction. Les échecs de nettoyage sont signalés ; un drapeau published=false seul ne retire pas un objet public. Les originaux audio/vidéo restent privés.

L'éditeur mobile conserve titre/description/marques ; les opérations médias et publication passent par carnet-media. Une image ajoutée dans l'admin ne change pas le manifest de capture initial.

## Extensions explicitement différées

Carte des photos de la société ; localisation fiable avec permission explicite et source/précision ; recherche par marques, produits et chantier ; indexation sémantique / vectorielle ; droit technicien. GPS absent n'est pas GPS=0 : le futur contrat devra représenter absence et provenance. Le MVP ne demande pas la localisation et ne garantit pas des coordonnées dans chaque photo.

La galerie interne pourra contenir les médias privés ; le site et sa future recherche ne doivent exposer que les éléments validés pour publication. La vectorisation n'est pas active dans cette version et ne constitue pas une preuve d'une marque ou d'une référence produit.

## Déploiement de test

Bolt annonce les migrations déjà appliquées sur son projet ; ne pas les rejouer. Les fichiers de référence sont `20261006120757_20261006100000_mobile_carnet_ingestion.sql`, puis `20261006120815_20261006100100_mobile_carnet_media_admin.sql`. Le correctif de sécurité `20261006093935_20261006_harden_photos_profiles_photo_images.sql` est déjà sur main et ne doit pas être rejoué aveuglément. Déployer les fonctions et le frontend de branche, puis exécuter la recette dans `BOLT_DEPLOYMENT.md`. Ne pas modifier les limites du bucket public existant `photos`. Aucun déplacement de base, aucune nouvelle Auth, aucun secret à transmettre dans un document ou une discussion.

Postgres et Storage ne partagent pas de transaction : la publication suit une copie, puis une transaction de références ; une file durable `cleanup_paths` permet de reprendre un nettoyage. `cleanup` fonctionne aussi après suppression du billet via `original_entry_id`. Une copie publique créée pour publication peut exister pendant cette opération ; la dépublication ne révoque ni les copies déjà téléchargées ni un cache CDN externe. Les essais dans l'environnement Bolt doivent vérifier les appels Storage et la propagation des suppressions. La durée audio/vidéo déclarée dans le manifest n'est pas une mesure serveur : les limites serveur opposables sont les formats/conteneurs, octets et empreintes.
