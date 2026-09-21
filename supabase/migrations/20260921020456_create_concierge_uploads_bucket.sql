/*
# Compartiment de stockage pour les pièces jointes du concierge

1. Nouveau compartiment
- `concierge-uploads` : stockage public des photos et vidéos jointes par un visiteur
  pendant un appel avec le concierge. Les fichiers sont nommés avec un identifiant
  aléatoire, donc leurs adresses ne sont pas devinables.

2. Sécurité (RLS storage)
- Lecture publique autorisée pour ce compartiment uniquement (les liens sont envoyés
  à l'équipe CELEC dans la notification de demande).
- Dépôt autorisé sans compte, car le concierge est utilisé par des visiteurs non
  connectés. Le nom de fichier aléatoire empêche d'écraser un fichier d'un autre.

3. Notes
- Aucune table n'est créée : les fichiers sont référencés par leur adresse dans la
  description de la demande transmise à l'équipe.
*/

insert into storage.buckets (id, name, public)
values ('concierge-uploads', 'concierge-uploads', true)
on conflict (id) do nothing;

drop policy if exists "concierge_uploads_select" on storage.objects;
create policy "concierge_uploads_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'concierge-uploads');

drop policy if exists "concierge_uploads_insert" on storage.objects;
create policy "concierge_uploads_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'concierge-uploads');
