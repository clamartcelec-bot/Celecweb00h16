# Installer et essayer Le Carnet CELEC

Paquet : `Le-Carnet-CELEC-0.1.0-test-arm64.apk`, Android 7 ou ultérieur, processeur ARM64. Application autonome, signée pour test interne. La recette de transactions Bolt est annoncée réussie ; le parcours réel téléphone → réseau → stockage → IA reste à valider.

## Préparation avec Bolt

Faire terminer la recette HTTP décrite dans `NETWORK_RECIPE.md`. Bolt fournit ensuite à l'administrateur l'URL HTTPS publique du projet et sa clé anon/publishable, ainsi que l'accès à la prévisualisation du site depuis Bolt. Il conserve ses clés serveur. Le compte utilisé sur téléphone doit déjà être administrateur sur ce même projet.

## Première ouverture

1. Télécharger le fichier APK sur le téléphone et ouvrir le fichier. Si Android le demande, autoriser l'installation depuis l'application utilisée pour ouvrir ce fichier, puis installer.
2. Ouvrir **Le Carnet**. L'écran **Préparer ce téléphone** demande l'URL HTTPS et la clé publique du projet, fournies par Bolt. Appuyer sur **Enregistrer la configuration**.
3. Sur **Votre compte CELEC**, utiliser l'adresse e-mail et le mot de passe du compte administrateur existant. Appuyer sur **Se connecter**. Une erreur doit laisser les captures locales intactes.
4. Autoriser la caméra. Le microphone est demandé à la première utilisation du vocal ou de la vidéo. Aucune localisation à activer.

Ne pas envoyer de mot de passe, token utilisateur ou clé serveur à l'assistant. Une configuration incorrecte reste à corriger sur le téléphone ou avec l'administrateur du projet. L'application n'est pas liée au téléphone Android d'un autre compte.

## Premier lot, dans cet ordre

| Geste | Résultat attendu |
| --- | --- |
| Appui court sur le bouton de capture | Photo 1, miniature numéro 1 |
| Maintenir le bouton Vocal, parler puis relâcher | Vocal 1, numéro 2 |
| Nouvel appui court photo | Photo 2, numéro 3 |
| Maintenir le bouton de capture pendant quelques secondes, relâcher | Vidéo, numéro 4 ; arrêt au relâchement |
| Maintenir Vocal, glisser vers le haut, parler puis **Arrêter** | Vocal 2 verrouillé, numéro 5 |

Avant envoi, fermer puis rouvrir l'application et vérifier les cinq éléments dans le même ordre. Utiliser uniquement des contenus de test pour les premiers essais. Exporter un élément si nécessaire avant de le retirer ; un retrait demande confirmation. Les médias sont regroupés dans un seul lot.

Appuyer sur **Envoyer le lot**. Le message de confirmation doit apparaître après création, puis le lot doit être vide pour la prochaine capture. L'envoi ne publie pas le billet. Dans le site : Administration → Carnet, vérifier un seul brouillon **Mobile**, les deux photos dans l'ordre et les deux vocaux transcrits ; la vidéo est conservée sans analyse. L'APK n'offre pas encore la consultation du Carnet complet.

## Coupure et reprise

Créer un autre lot de test. Couper le réseau avant ou pendant l'envoi. Le lot et ses cinq médias doivent rester présents. Fermer l'application, rouvrir, rétablir le réseau et utiliser **Reprendre l'envoi**. Un seul brouillon doit être créé ; la confirmation doit vider le lot seulement après le reçu de création. Bolt peut corréler le test par le UUID du lot, sans transmettre les sessions.

Tester aussi passage en arrière-plan pendant l'envoi, session expirée puis reconnexion, déconnexion/reconnexion au même compte et changement de compte. Le mauvais compte ne doit pas afficher le lot d'un autre. Ne pas désinstaller l'application ou effacer ses données pour simuler une fermeture : cela détruirait le stockage local.

## Vérification côté pages

L'administrateur ouvre le brouillon, modifie son texte si nécessaire, choisit la couverture, puis publie volontairement. Vérifier la galerie publique dans une fenêtre visiteur. Retirer une image, dépublier puis vérifier la disparition du billet et des copies publiques. Enfin supprimer le billet de test ; son ancien UUID ne doit pas recréer une entrée. Faire reprendre tout nettoyage signalé par le serveur.

## Compte rendu à renvoyer sans identifiants

```json
{
  "telephone": "marque et modèle",
  "android": "version",
  "connexion_admin": "a_tester",
  "connexion_client_refusee": "a_tester",
  "photo": "a_tester",
  "vocal_et_verrouillage": "a_tester",
  "video_et_arret": "a_tester",
  "ordre_et_reouverture": "a_tester",
  "confirmation_et_brouillon_unique": "a_tester",
  "coupure_et_reprise": "a_tester",
  "changement_de_compte": "a_tester",
  "publication_et_nettoyage": "a_tester",
  "message_erreur_sans_secret": ""
}
```

Remplacer `a_tester` par `reussi`, `echec` ou `non_effectue`. Le connecteur est déclaré prêt pour le test interne une fois la recette HTTP réelle et ce premier parcours Android réussis. Les essais locaux et la compilation de l'APK ne remplacent pas ces validations.
