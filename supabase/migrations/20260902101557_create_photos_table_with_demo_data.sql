/*
# Create photos table with 30 demo geolocated photos

1. New Tables
- `photos`
  - `id` (uuid, primary key)
  - `title` (text)
  - `city` (text, the commune/city name)
  - `lat` (double precision, latitude)
  - `lng` (double precision, longitude)
  - `description` (text, optional)
  - `published` (boolean, default true)
  - `created_at` (timestamp)
2. Security
- Enable RLS on `photos`.
- Allow anon + authenticated read. Only authenticated can insert/update/delete.
3. Demo Data
- 30 photos across: Clamart, Le Plessis-Robinson, Issy-les-Moulineaux,
  Neuilly-sur-Seine (4), Sceaux (2), Verrieres-le-Buisson, Alfortville,
  Paris 15e (1), Paris 9e (8), Antony (3), Bourg-la-Reine (2), Chatillon (2)
*/

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL DEFAULT 0,
  lng double precision NOT NULL DEFAULT 0,
  description text,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_photos" ON photos;
CREATE POLICY "anon_select_photos" ON photos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_photos" ON photos;
CREATE POLICY "auth_insert_photos" ON photos FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_photos" ON photos;
CREATE POLICY "auth_update_photos" ON photos FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_photos" ON photos;
CREATE POLICY "auth_delete_photos" ON photos FOR DELETE
  TO authenticated USING (true);

-- Insert 30 demo photos
INSERT INTO photos (title, city, lat, lng, description) VALUES
-- Clamart (3)
('Tableau remis en conformite', 'Clamart', 48.8005, 2.2641, 'Remise aux normes complete du tableau principal'),
('Eclairage exterieur jardin', 'Clamart', 48.8032, 2.2589, 'Installation eclairage LED basse tension'),
('Depannage interrupteur differentiel', 'Clamart', 48.7988, 2.2712, 'Remplacement differentiel defectueux'),
-- Le Plessis-Robinson (2)
('Renovation complete appartement', 'Le Plessis-Robinson', 48.7812, 2.2617, 'Refection totale installation electrique'),
('Pose tableau divisionnaire', 'Le Plessis-Robinson', 48.7845, 2.2580, 'Ajout tableau pour extension'),
-- Issy-les-Moulineaux (2)
('Mise en securite cuisine pro', 'Issy-les-Moulineaux', 48.8244, 2.2700, 'Installation circuits dedies restaurant'),
('Depannage urgence bureau', 'Issy-les-Moulineaux', 48.8219, 2.2654, 'Court-circuit identifie et repare'),
-- Neuilly-sur-Seine (4)
('Domotique salon', 'Neuilly-sur-Seine', 48.8848, 2.2686, 'Variateurs connectes et scenes lumineuses'),
('Tableau triphasé', 'Neuilly-sur-Seine', 48.8871, 2.2714, 'Passage triphase pour cuisine pro'),
('Eclairage architectural', 'Neuilly-sur-Seine', 48.8833, 2.2651, 'Mise en lumiere facade'),
('Reprise installation ancienne', 'Neuilly-sur-Seine', 48.8855, 2.2695, 'Documentation et remise en securite'),
-- Sceaux (2)
('Colonne montante copropriete', 'Sceaux', 48.7781, 2.2941, 'Verification et reperage complet'),
('Prise recharge vehicule', 'Sceaux', 48.7765, 2.2889, 'Installation borne de recharge'),
-- Verrieres-le-Buisson (1)
('Renovation maison annees 70', 'Verrieres-le-Buisson', 48.7480, 2.2673, 'Mise aux normes complete'),
-- Alfortville (1)
('Depannage tableau vetuste', 'Alfortville', 48.8049, 2.4203, 'Remplacement fusibles par disjoncteurs'),
-- Paris 15e (1)
('Renovation studio', 'Paris 15e', 48.8421, 2.2945, 'Installation complete petit espace'),
-- Paris 9e (8)
('Eclairage boutique', 'Paris 9e', 48.8767, 2.3378, 'Rails et spots LED commerce'),
('Mise en conformite immeuble', 'Paris 9e', 48.8751, 2.3412, 'Parties communes et caves'),
('Bureau coworking', 'Paris 9e', 48.8743, 2.3356, 'Circuits et prises reseau'),
('Renovation appartement haussmannien', 'Paris 9e', 48.8779, 2.3389, 'Passage encastre sans degradation'),
('Depannage chauffe-eau', 'Paris 9e', 48.8734, 2.3401, 'Diagnostic et remplacement resistance'),
('Installation interphone', 'Paris 9e', 48.8761, 2.3367, 'Remplacement systeme obsolete'),
('Tableau secondaire cuisine', 'Paris 9e', 48.8771, 2.3345, 'Ajout protection circuits dedies'),
('Eclairage cage escalier', 'Paris 9e', 48.8758, 2.3423, 'Minuterie et detecteurs presence'),
-- Antony (3)
('Renovation pavillon', 'Antony', 48.7532, 2.2985, 'Installation complete maison individuelle'),
('Eclairage terrasse', 'Antony', 48.7558, 2.3012, 'Spots encastres et guirlandes'),
('Diagnostic avant vente', 'Antony', 48.7545, 2.2967, 'Rapport complet installation'),
-- Bourg-la-Reine (2)
('Remplacement tableau principal', 'Bourg-la-Reine', 48.7801, 2.3146, 'Modernisation avec reperage'),
('Prises cuisine', 'Bourg-la-Reine', 48.7789, 2.3121, 'Ajout circuits specialises'),
-- Chatillon (2)
('Depannage copropriete', 'Chatillon', 48.8103, 2.2877, 'Identification panne eclairage communs'),
('Installation VMC', 'Chatillon', 48.8089, 2.2901, 'Ventilation mecanique controlee');
