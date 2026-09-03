/*
# Create french_cities reference table

1. New Tables
  - `french_cities`
    - `id` (serial, primary key)
    - `name` (text, not null) - City display name
    - `postal_code` (text, not null) - French postal code (5 digits)
    - `department` (text) - Department name
    - `lat` (double precision) - Latitude
    - `lng` (double precision) - Longitude
2. Security
  - Enable RLS on `french_cities`
  - Public read for anon + authenticated
  - Write restricted to authenticated (admin manages via service key)
3. Notes
  - Seeded with ~80 major Ile-de-France cities plus major French metros
  - Used as autocomplete source for photo city assignment
  - Unique constraint on (name, postal_code) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS french_cities (
  id serial PRIMARY KEY,
  name text NOT NULL,
  postal_code text NOT NULL,
  department text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  UNIQUE(name, postal_code)
);

ALTER TABLE french_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cities" ON french_cities;
CREATE POLICY "anon_select_cities" ON french_cities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_cities" ON french_cities;
CREATE POLICY "auth_insert_cities" ON french_cities FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_cities" ON french_cities;
CREATE POLICY "auth_update_cities" ON french_cities FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_cities" ON french_cities;
CREATE POLICY "auth_delete_cities" ON french_cities FOR DELETE
  TO authenticated USING (true);

INSERT INTO french_cities (name, postal_code, department, lat, lng) VALUES
  ('Paris', '75001', 'Paris', 48.8566, 2.3522),
  ('Paris 11e', '75011', 'Paris', 48.8590, 2.3780),
  ('Paris 12e', '75012', 'Paris', 48.8412, 2.3876),
  ('Paris 13e', '75013', 'Paris', 48.8322, 2.3561),
  ('Paris 14e', '75014', 'Paris', 48.8283, 2.3267),
  ('Paris 15e', '75015', 'Paris', 48.8422, 2.2945),
  ('Paris 16e', '75016', 'Paris', 48.8637, 2.2769),
  ('Paris 17e', '75017', 'Paris', 48.8867, 2.3117),
  ('Paris 18e', '75018', 'Paris', 48.8925, 2.3444),
  ('Paris 19e', '75019', 'Paris', 48.8871, 2.3824),
  ('Paris 20e', '75020', 'Paris', 48.8638, 2.3985),
  ('Boulogne-Billancourt', '92100', 'Hauts-de-Seine', 48.8397, 2.2399),
  ('Issy-les-Moulineaux', '92130', 'Hauts-de-Seine', 48.8247, 2.2735),
  ('Vanves', '92170', 'Hauts-de-Seine', 48.8204, 2.2906),
  ('Malakoff', '92240', 'Hauts-de-Seine', 48.8186, 2.2983),
  ('Montrouge', '92120', 'Hauts-de-Seine', 48.8163, 2.3211),
  ('Clamart', '92140', 'Hauts-de-Seine', 48.8005, 2.2634),
  ('Meudon', '92190', 'Hauts-de-Seine', 48.8122, 2.2350),
  ('Sevres', '92310', 'Hauts-de-Seine', 48.8235, 2.2102),
  ('Saint-Cloud', '92210', 'Hauts-de-Seine', 48.8444, 2.2186),
  ('Suresnes', '92150', 'Hauts-de-Seine', 48.8693, 2.2292),
  ('Puteaux', '92800', 'Hauts-de-Seine', 48.8847, 2.2389),
  ('Courbevoie', '92400', 'Hauts-de-Seine', 48.8966, 2.2522),
  ('Neuilly-sur-Seine', '92200', 'Hauts-de-Seine', 48.8848, 2.2681),
  ('Levallois-Perret', '92300', 'Hauts-de-Seine', 48.8936, 2.2874),
  ('Nanterre', '92000', 'Hauts-de-Seine', 48.8924, 2.2066),
  ('Rueil-Malmaison', '92500', 'Hauts-de-Seine', 48.8769, 2.1894),
  ('Colombes', '92700', 'Hauts-de-Seine', 48.9226, 2.2526),
  ('Asnieres-sur-Seine', '92600', 'Hauts-de-Seine', 48.9121, 2.2852),
  ('Clichy', '92110', 'Hauts-de-Seine', 48.9045, 2.3056),
  ('Gennevilliers', '92230', 'Hauts-de-Seine', 48.9326, 2.2970),
  ('Villeneuve-la-Garenne', '92390', 'Hauts-de-Seine', 48.9380, 2.3266),
  ('Chatillon', '92320', 'Hauts-de-Seine', 48.8038, 2.2884),
  ('Le Plessis-Robinson', '92350', 'Hauts-de-Seine', 48.7812, 2.2632),
  ('Chatenay-Malabry', '92290', 'Hauts-de-Seine', 48.7654, 2.2664),
  ('Antony', '92160', 'Hauts-de-Seine', 48.7539, 2.2984),
  ('Bourg-la-Reine', '92340', 'Hauts-de-Seine', 48.7803, 2.3155),
  ('Sceaux', '92330', 'Hauts-de-Seine', 48.7772, 2.2900),
  ('Fontenay-aux-Roses', '92260', 'Hauts-de-Seine', 48.7882, 2.2917),
  ('Chaville', '92370', 'Hauts-de-Seine', 48.8066, 2.1887),
  ('Garches', '92380', 'Hauts-de-Seine', 48.8441, 2.1854),
  ('Vaucresson', '92420', 'Hauts-de-Seine', 48.8371, 2.1599),
  ('Ville-d''Avray', '92410', 'Hauts-de-Seine', 48.8259, 2.1906),
  ('Montreuil', '93100', 'Seine-Saint-Denis', 48.8637, 2.4433),
  ('Saint-Denis', '93200', 'Seine-Saint-Denis', 48.9362, 2.3575),
  ('Aubervilliers', '93300', 'Seine-Saint-Denis', 48.9139, 2.3830),
  ('Pantin', '93500', 'Seine-Saint-Denis', 48.8952, 2.4031),
  ('Bobigny', '93000', 'Seine-Saint-Denis', 48.9064, 2.4402),
  ('Bondy', '93140', 'Seine-Saint-Denis', 48.9021, 2.4839),
  ('Noisy-le-Grand', '93160', 'Seine-Saint-Denis', 48.8489, 2.5631),
  ('Vincennes', '94300', 'Val-de-Marne', 48.8473, 2.4367),
  ('Saint-Mande', '94160', 'Val-de-Marne', 48.8463, 2.4198),
  ('Charenton-le-Pont', '94220', 'Val-de-Marne', 48.8233, 2.4141),
  ('Ivry-sur-Seine', '94200', 'Val-de-Marne', 48.8127, 2.3876),
  ('Vitry-sur-Seine', '94400', 'Val-de-Marne', 48.7876, 2.3929),
  ('Kremlin-Bicetre', '94270', 'Val-de-Marne', 48.8105, 2.3592),
  ('Cachan', '94230', 'Val-de-Marne', 48.7943, 2.3377),
  ('Arcueil', '94110', 'Val-de-Marne', 48.8011, 2.3342),
  ('Gentilly', '94250', 'Val-de-Marne', 48.8139, 2.3444),
  ('Villejuif', '94800', 'Val-de-Marne', 48.7917, 2.3624),
  ('Maisons-Alfort', '94700', 'Val-de-Marne', 48.8076, 2.4377),
  ('Creteil', '94000', 'Val-de-Marne', 48.7905, 2.4553),
  ('Versailles', '78000', 'Yvelines', 48.8049, 2.1203),
  ('Saint-Germain-en-Laye', '78100', 'Yvelines', 48.8986, 2.0938),
  ('Argenteuil', '95100', 'Val-d''Oise', 48.9472, 2.2466),
  ('Cergy', '95000', 'Val-d''Oise', 49.0363, 2.0638),
  ('Evry-Courcouronnes', '91000', 'Essonne', 48.6243, 2.4294),
  ('Massy', '91300', 'Essonne', 48.7306, 2.2711),
  ('Lyon', '69001', 'Rhone', 45.7640, 4.8357),
  ('Marseille', '13001', 'Bouches-du-Rhone', 43.2965, 5.3698),
  ('Toulouse', '31000', 'Haute-Garonne', 43.6047, 1.4442),
  ('Nice', '06000', 'Alpes-Maritimes', 43.7102, 7.2620),
  ('Nantes', '44000', 'Loire-Atlantique', 47.2184, -1.5536),
  ('Strasbourg', '67000', 'Bas-Rhin', 48.5734, 7.7521),
  ('Montpellier', '34000', 'Herault', 43.6108, 3.8767),
  ('Bordeaux', '33000', 'Gironde', 44.8378, -0.5792),
  ('Lille', '59000', 'Nord', 50.6292, 3.0573),
  ('Rennes', '35000', 'Ille-et-Vilaine', 48.1173, -1.6778)
ON CONFLICT (name, postal_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_french_cities_name_btree ON french_cities (name);
CREATE INDEX IF NOT EXISTS idx_french_cities_postal ON french_cities (postal_code);
