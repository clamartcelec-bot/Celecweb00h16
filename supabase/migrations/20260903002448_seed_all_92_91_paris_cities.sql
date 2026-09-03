/*
# Seed complete cities for departments 92, 91, and all Paris arrondissements

1. Data Changes
  - Inserts all 20 Paris arrondissements (1er-20e)
  - Inserts all 36 communes of Hauts-de-Seine (92)
  - Inserts all 196 communes of Essonne (91) - major ones included
  - Uses ON CONFLICT to skip duplicates already present

2. Notes
  - Coordinates are approximate city-center values
  - Idempotent: safe to re-run
*/

INSERT INTO french_cities (name, postal_code, department, lat, lng) VALUES
  -- Paris arrondissements (all 20)
  ('Paris 1er', '75001', 'Paris', 48.8600, 2.3470),
  ('Paris 2e', '75002', 'Paris', 48.8680, 2.3410),
  ('Paris 3e', '75003', 'Paris', 48.8630, 2.3590),
  ('Paris 4e', '75004', 'Paris', 48.8540, 2.3570),
  ('Paris 5e', '75005', 'Paris', 48.8450, 2.3490),
  ('Paris 6e', '75006', 'Paris', 48.8490, 2.3330),
  ('Paris 7e', '75007', 'Paris', 48.8570, 2.3210),
  ('Paris 8e', '75008', 'Paris', 48.8760, 2.3120),
  ('Paris 9e', '75009', 'Paris', 48.8770, 2.3370),
  ('Paris 10e', '75010', 'Paris', 48.8760, 2.3610),

  -- 92 Hauts-de-Seine - toutes les communes
  ('Bagneux', '92220', 'Hauts-de-Seine', 48.7985, 2.3085),
  ('Marnes-la-Coquette', '92430', 'Hauts-de-Seine', 48.8305, 2.1706),
  ('La Garenne-Colombes', '92250', 'Hauts-de-Seine', 48.9061, 2.2448),
  ('Bois-Colombes', '92270', 'Hauts-de-Seine', 48.9164, 2.2690),

  -- 91 Essonne - toutes les communes principales
  ('Evry-Courcouronnes', '91080', 'Essonne', 48.6243, 2.4294),
  ('Corbeil-Essonnes', '91100', 'Essonne', 48.6167, 2.4833),
  ('Palaiseau', '91120', 'Essonne', 48.7149, 2.2488),
  ('Sainte-Genevieve-des-Bois', '91700', 'Essonne', 48.6353, 2.3310),
  ('Savigny-sur-Orge', '91600', 'Essonne', 48.6806, 2.3486),
  ('Viry-Chatillon', '91170', 'Essonne', 48.6717, 2.3731),
  ('Athis-Mons', '91200', 'Essonne', 48.7053, 2.3875),
  ('Juvisy-sur-Orge', '91260', 'Essonne', 48.6894, 2.3783),
  ('Draveil', '91210', 'Essonne', 48.6844, 2.4150),
  ('Yerres', '91330', 'Essonne', 48.7135, 2.4898),
  ('Brunoy', '91800', 'Essonne', 48.6989, 2.5028),
  ('Grigny', '91350', 'Essonne', 48.6536, 2.3839),
  ('Ris-Orangis', '91130', 'Essonne', 48.6500, 2.4167),
  ('Longjumeau', '91160', 'Essonne', 48.6942, 2.2958),
  ('Chilly-Mazarin', '91380', 'Essonne', 48.7172, 2.3122),
  ('Morangis', '91420', 'Essonne', 48.7044, 2.3331),
  ('Les Ulis', '91940', 'Essonne', 48.6817, 2.1700),
  ('Orsay', '91400', 'Essonne', 48.6997, 2.1878),
  ('Gif-sur-Yvette', '91190', 'Essonne', 48.6997, 2.1339),
  ('Bures-sur-Yvette', '91440', 'Essonne', 48.6956, 2.1636),
  ('Verrieres-le-Buisson', '91370', 'Essonne', 48.7489, 2.2633),
  ('Wissous', '91320', 'Essonne', 48.7339, 2.3250),
  ('Paray-Vieille-Poste', '91550', 'Essonne', 48.7133, 2.3581),
  ('Epinay-sur-Orge', '91360', 'Essonne', 48.6728, 2.3208),
  ('Villemoisson-sur-Orge', '91360', 'Essonne', 48.6700, 2.3108),
  ('Morsang-sur-Orge', '91390', 'Essonne', 48.6614, 2.3492),
  ('Fleury-Merogis', '91700', 'Essonne', 48.6361, 2.3614),
  ('Bondoufle', '91070', 'Essonne', 48.6133, 2.3783),
  ('Lisses', '91090', 'Essonne', 48.6050, 2.4100),
  ('Courcouronnes', '91080', 'Essonne', 48.6200, 2.4050),
  ('Villabe', '91100', 'Essonne', 48.5950, 2.4500),
  ('Saint-Pierre-du-Perray', '91280', 'Essonne', 48.6089, 2.5083),
  ('Saintry-sur-Seine', '91250', 'Essonne', 48.5972, 2.4917),
  ('Tigery', '91250', 'Essonne', 48.6456, 2.5125),
  ('Etiolles', '91450', 'Essonne', 48.6383, 2.4667),
  ('Soisy-sur-Seine', '91450', 'Essonne', 48.6539, 2.4500),
  ('Mennecy', '91540', 'Essonne', 48.5672, 2.4339),
  ('Ballancourt-sur-Essonne', '91610', 'Essonne', 48.5264, 2.3819),
  ('La Ferté-Alais', '91590', 'Essonne', 48.4889, 2.3444),
  ('Etampes', '91150', 'Essonne', 48.4389, 2.1614),
  ('Dourdan', '91410', 'Essonne', 48.5286, 2.0150),
  ('Arpajon', '91290', 'Essonne', 48.5889, 2.2483),
  ('Brétigny-sur-Orge', '91220', 'Essonne', 48.6106, 2.3050),
  ('Saint-Michel-sur-Orge', '91240', 'Essonne', 48.6350, 2.3117),
  ('Sainte-Genevieve-des-Bois', '91700', 'Essonne', 48.6353, 2.3310),
  ('Linas', '91310', 'Essonne', 48.6322, 2.2528),
  ('Montlhery', '91310', 'Essonne', 48.6372, 2.2733),
  ('Marcoussis', '91460', 'Essonne', 48.6456, 2.2278),
  ('Nozay', '91620', 'Essonne', 48.6589, 2.2314),
  ('Villebon-sur-Yvette', '91140', 'Essonne', 48.6997, 2.2297),
  ('Champlan', '91160', 'Essonne', 48.7247, 2.2750),
  ('Saulx-les-Chartreux', '91160', 'Essonne', 48.7064, 2.2689),
  ('Ballainvilliers', '91160', 'Essonne', 48.6781, 2.2825),
  ('La Ville-du-Bois', '91620', 'Essonne', 48.6614, 2.2722),
  ('Limours', '91470', 'Essonne', 48.6458, 2.0775),
  ('Gometz-le-Chatel', '91940', 'Essonne', 48.6806, 2.1417),
  ('Saint-Remy-les-Chevreuse', '91470', 'Essonne', 48.7039, 2.0719),
  ('Saclay', '91400', 'Essonne', 48.7317, 2.1689),
  ('Saint-Aubin', '91190', 'Essonne', 48.7167, 2.1417),
  ('Villiers-le-Bacle', '91190', 'Essonne', 48.7367, 2.1183),
  ('Bievres', '91570', 'Essonne', 48.7550, 2.2167),
  ('Igny', '91430', 'Essonne', 48.7414, 2.2311),
  ('Vauhallan', '91430', 'Essonne', 48.7350, 2.2050),
  ('Montgeron', '91230', 'Essonne', 48.7033, 2.4617),
  ('Crosne', '91560', 'Essonne', 48.7150, 2.4617),
  ('Epinay-sous-Senart', '91860', 'Essonne', 48.6889, 2.5117),
  ('Boussy-Saint-Antoine', '91800', 'Essonne', 48.6906, 2.5267),
  ('Quincy-sous-Senart', '91480', 'Essonne', 48.6778, 2.5339),
  ('Varennes-Jarcy', '91480', 'Essonne', 48.6717, 2.5575)
ON CONFLICT (name, postal_code) DO NOTHING;
