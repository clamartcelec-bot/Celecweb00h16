/*
# Ajout du drapeau d'affichage concierge sur les billets

## Résumé
Permet de marquer un billet du carnet comme « mis en avant par le concierge ».
Les visiteurs qui arrivent sur le carnet depuis une conversation avec le
concierge voient ce billet ouvert automatiquement, avec un retour vers
l'espace concierge pour continuer l'échange.

## 1. Modification de la table : photos
- `concierge_session` (text, nullable) : identifiant de la conversation
  pendant laquelle ce billet a été présenté par le concierge. Vide par défaut.

## 2. Sécurité
Aucune politique n'est modifiée. La colonne est couverte par les politiques
existantes de la table `photos`.

## 3. Notes
- Colonne additive : aucune donnée existante n'est touchée.
- La valeur reste vide quand le billet est présenté depuis le carnet classique.
*/

ALTER TABLE photos ADD COLUMN IF NOT EXISTS concierge_session text;

CREATE INDEX IF NOT EXISTS photos_concierge_session_idx ON photos (concierge_session);
