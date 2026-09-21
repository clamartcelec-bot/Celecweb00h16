/*
# Seed 40 published carnet entries with photos

1. Content added
  - 40 realistic, published entries in the `photos` table covering the trades of the
    company: moved sockets, panel upgrades, video intercoms, ABB/Somfy home automation,
    EV charging, lighting, diagnostics and urgent repairs.
  - Each entry has a title, a 2-4 sentence description, a real commune with its real
    coordinates, a technician name, and detected brands.
  - One coordinated photo per entry (Pexels, free licence) is stored both in
    `photos.image_url` and in `photo_images` (position 0), so the carnet gallery behaves
    exactly like a Telegram import.

2. Purpose
  - Provide a realistic corpus for testing the RAG / search behaviour of the carnet.

3. Notes
  - Additive only. No existing column or row is modified.
  - Idempotent: a row is skipped when an entry with the same title AND city already exists,
    so re-running this migration will not duplicate the corpus.
  - Entries are marked `source = 'manual'` and `published = true` so they show up directly
    in the public carnet grid.
*/

WITH data(title, city, lat, lng, description, author, image_url, brands, created_at) AS (
  VALUES
  ('Prise de cuisine deplacee', 'Clamart', 48.8005, 2.2634,
   'La prise du plan de travail se trouvait derriere le refrigerateur, inaccessible. Saignee realisee dans le placoplatre, gaine repassee et deux socles 2P+T poses a hauteur reglementaire. Controle de la terre et test du differentiel valides en fin de chantier.',
   'Karim B.', 'https://images.pexels.com/photos/4981794/pexels-photo-4981794.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2026-09-18T09:20:00+02:00'),

  ('Remplacement differentiel defaillant', 'Boulogne-Billancourt', 48.8397, 2.2399,
   'Le disjoncteur differentiel 30 mA declenchait de facon aleatoire depuis une semaine. Mesure d’isolement sur les circuits suspectes et identification de l’humidite dans la prise de la salle de bain. Remplacement du differentiel et reprise de l’etancheite du socle.',
   'Damien L.', 'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric'], '2026-09-15T14:05:00+02:00'),

  ('Videophone remplace en copropriete', 'Issy-les-Moulineaux', 48.8247, 2.2735,
   'Le combine du hall ne sonnait plus et l’ecran restait noir. Diagnostic du bus puis remplacement de la platine d’immeuble par un modele compatible avec les postes existants. Reparametrage des 14 appartements et test de la gache.',
   'Sofiane M.', 'https://images.pexels.com/photos/13007861/pexels-photo-13007861.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Urmet', 'ABB'], '2026-09-11T10:40:00+02:00'),

  ('Installation domotique KNX sur mesure', 'Neuilly-sur-Seine', 48.8848, 2.2681,
   'Mise en place d’un bus KNX ABB pour piloter l’eclairage, les volets et le chauffage de la maison. Armoire domotique creee au sous-sol avec alimentation separee et module de supervision. Scenarios de presence et d’absence programmes avec le client en fin d’intervention.',
   'Julien P.', 'https://images.pexels.com/photos/17536106/pexels-photo-17536106.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['ABB', 'Hager'], '2026-09-08T16:30:00+02:00'),

  ('Remise aux normes du tableau principal', 'Levallois-Perret', 48.8936, 2.2874,
   'Tableau des annees 80 sans differentiel sur plusieurs circuits. Remplacement complet par un tableau trois rangees avec parafoudre et reperage de tous les departs. Reprise des liaisons en 16 mm2 et pose d’un interrupteur sectionneur accessible.',
   'Thomas R.', 'https://images.pexels.com/photos/27928762/pexels-photo-27928762.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric', 'Hager'], '2026-09-04T08:15:00+02:00'),

  ('Borne de recharge posee en garage', 'Sceaux', 48.7772, 2.29,
   'Installation d’une borne 7,4 kW sur le mur mitoyen du garage. Alimentation dediee depuis le tableau avec cable 10 mm2 et protection differentielle adaptee. Mise en service, controle de la terre et explication de l’application de pilotage au proprietaire.',
   'Yann D.', 'https://images.pexels.com/photos/5391509/pexels-photo-5391509.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Wallbox', 'Schneider Electric'], '2026-08-29T11:00:00+02:00'),

  ('Eclairage LED d un plateau de bureaux', 'Courbevoie', 48.8966, 2.2522,
   'Remplacement de 34 dalles fluorescentes par des panneaux LED gradables. Pose de deux detecteurs de presence et d’une horloge astronomique sur le tableau d’eclairage. Gain de consommation estime a 40 pour cent et uniformite lumineuse recontrolee au luxmetre.',
   'Mehdi A.', 'https://images.pexels.com/photos/35139106/pexels-photo-35139106.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Philips', 'Legrand'], '2026-08-25T13:45:00+02:00'),

  ('Interphone d immeuble remis en service', 'Puteaux', 48.8847, 2.2389,
   'Interphone hors service depuis l’orage, platine de rue oxydee. Remplacement de la platine et des deux postes de gardien puis reprise des connexions sur la colonne. Test de tous les appartements realise avec le syndic.',
   'Nicolas V.', 'https://images.pexels.com/photos/30753240/pexels-photo-30753240.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Bticino', 'Legrand'], '2026-08-21T09:50:00+02:00'),

  ('Ajout d une prise dediee pour four', 'Suresnes', 48.8693, 2.2292,
   'Le four neuf demandait un circuit specialise en 20 A. Tirage d’une ligne dediee depuis le tableau avec disjoncteur 20 A et prise 2P+T a encastrement profond. Verification de l’equipotentialite de la cuisine apres pose.',
   'Antoine G.', 'https://images.pexels.com/photos/5691494/pexels-photo-5691494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2026-08-18T15:20:00+02:00'),

  ('Passage en triphase pour atelier', 'Nanterre', 48.8924, 2.2066,
   'Un atelier de menuiserie avait besoin de triphase pour ses machines. Demande de modification aupres du gestionnaire, remplacement du tableau et creation de quatre departs triphases proteges. Equilibrage des phases mesure au pince amperemetrique.',
   'Rachid Z.', 'https://images.pexels.com/photos/28942196/pexels-photo-28942196.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric', 'Siemens'], '2026-08-13T07:40:00+02:00'),

  ('Domotique volets roulants', 'Rueil-Malmaison', 48.8769, 2.1894,
   'Motorisation de six volets roulants existants avec des moteurs Somfy. Alimentation des moteurs depuis une ligne dediee et raccordement du module de pilotage central. Le client gere desormais les volets depuis son telephone ou une telecommande unique.',
   'Pierre-Yves C.', 'https://images.pexels.com/photos/17828661/pexels-photo-17828661.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Somfy', 'Delta Dore'], '2026-08-07T11:35:00+02:00'),

  ('Depannage court-circuit sur prise', 'Colombes', 48.9226, 2.2526,
   'Une prise de chambre coupait tout le circuit des que l’on branchait un appareil. Ouverture du socle et conducteur neutre deserre qui touchait la phase. Reprise des connexions, remplacement du socle et controle du serrage sur les prises du meme circuit.',
   'Ludovic F.', 'https://images.pexels.com/photos/8488029/pexels-photo-8488029.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric'], '2026-08-03T17:10:00+02:00'),

  ('Verification de colonne montante', 'Bagneux', 48.7985, 2.3085,
   'Controle de la colonne montante et des coffrets de palier dans un immeuble de six etages. Reperage des circuits, serrage de toutes les bornes et remplacement de deux porte-fusibles fissures. Rapport remis au syndic avec photos des points a surveiller.',
   'Bruno T.', 'https://images.pexels.com/photos/10065200/pexels-photo-10065200.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand', 'Hager'], '2026-07-28T09:05:00+02:00'),

  ('Prises reseau RJ45 en bureau', 'Chatillon', 48.8038, 2.2884,
   'Creation de six postes de travail informatique avec prises RJ45 categorie 6. Tirage des cables dans les plinthes et goulottes puis pose d’un panneau de brassage au local technique. Tests de continuite et certification des liens au testeur.',
   'Christophe N.', 'https://images.pexels.com/photos/5691633/pexels-photo-5691633.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Cablofil', 'Legrand'], '2026-07-22T14:25:00+02:00'),

  ('Videophone de copropriete renouvele', 'Montrouge', 48.8163, 2.3211,
   'Systeme de videophone devenu obsolete avec des pieces introuvables. Remplacement complet par un ensemble compatible avec les 22 logements. Reparametrage des postes et formation du gardien au depot d’appel.',
   'Sebastien H.', 'https://images.pexels.com/photos/36129007/pexels-photo-36129007.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Bticino'], '2026-07-16T10:15:00+02:00'),

  ('Tableau vetuste remplace', 'Malakoff', 48.8186, 2.2983,
   'Tableau en bois des annees 60 avec fusibles a cartouches. Remplacement par un tableau moderne, creation de trois circuits specialises et pose d’un differentiel 30 mA par rangee. Mise en securite des anciens fils volants dans les combles.',
   'Franck D.', 'https://images.pexels.com/photos/19841115/pexels-photo-19841115.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Hager'], '2026-07-09T08:30:00+02:00'),

  ('Spots encastres dans un sejour', 'Vanves', 48.8204, 2.2906,
   'Pose de huit spots LED encastres dans un faux plafond neuf. Saignees realisees avant peinture et alimentation depuis un point lumineux existant. Reglage de la temperature de couleur a 3000 K pour rester coherent avec l’ambiance du sejour.',
   'Yacine K.', 'https://images.pexels.com/photos/675968/pexels-photo-675968.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Philips', 'Legrand'], '2026-07-02T15:50:00+02:00'),

  ('Thermostat connecte installe', 'Antony', 48.7539, 2.2984,
   'Remplacement d’un thermostat mecanique par un modele connecte pilotable a distance. Reprise du fil pilote, configuration des plages horaires et des zones avec le client. Explication de l’application et du suivi de consommation.',
   'Eric M.', 'https://images.pexels.com/photos/36077581/pexels-photo-36077581.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Netatmo', 'Delta Dore'], '2026-06-24T11:20:00+02:00'),

  ('Refection complete de l installation', 'Bourg-la-Reine', 48.7803, 2.3155,
   'Appartement des annees 70 dont toute l’installation etait a reprendre. Remplacement des cables, creation de 42 points lumineux et prises, nouveau tableau et mise a la terre generale. Chantier realise en deux phases pour permettre au client de rester loger.',
   'Olivier S.', 'https://images.pexels.com/photos/5493661/pexels-photo-5493661.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand', 'Schneider Electric'], '2026-06-15T08:00:00+02:00'),

  ('Prise renforcee pour recharge hybride', 'Chatenay-Malabry', 48.7654, 2.2664,
   'Installation d’une prise renforcee 16 A pour la recharge d’un vehicule hybride. Circuit dedie en 2,5 mm2 avec protection differentielle et compteur d’energie. Verification que la prise est bien sur un circuit exclusif comme l’exige la norme.',
   'Vincent B.', 'https://images.pexels.com/photos/27355826/pexels-photo-27355826.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand', 'Wallbox'], '2026-06-05T13:10:00+02:00'),

  ('Detection de presence en cage d escalier', 'Fontenay-aux-Roses', 48.7882, 2.2917,
   'Eclairage des communs reste allume en permanence. Remplacement des minuteries par des detecteurs de presence infrarouges et passage en LED. Releve du compteur avant et apres pour chiffrer l’economie aupres du syndic.',
   'Karim B.', 'https://images.pexels.com/photos/1253128/pexels-photo-1253128.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand', 'Hager'], '2026-05-26T09:35:00+02:00'),

  ('Interphone avec gache electrique', 'Le Kremlin-Bicetre', 48.8106, 2.3626,
   'Portail et portillon a ouvrir depuis les appartements. Pose d’un interphone avec commande de gache, alimentation dediee et securisation du transformateur. Tests d’ouverture repetes avec le bailleur.',
   'Damien L.', 'https://images.pexels.com/photos/9593267/pexels-photo-9593267.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Urmet'], '2026-05-14T16:00:00+02:00'),

  ('Renovation electrique d un T3', 'Villejuif', 48.7917, 2.3624,
   'Renovation complete avant mise en location avec remise en conformite du tableau et creation des circuits obligatoires. Pose de prises dans chaque piece, eclairage en LED et detecteurs de fumee reglementaires. Attestation de conformite fournie au proprietaire.',
   'Sofiane M.', 'https://images.pexels.com/photos/442160/pexels-photo-442160.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric'], '2026-05-06T07:55:00+02:00'),

  ('Raccordement photovoltaique en autoconsommation', 'Massy', 48.7306, 2.2711,
   'Raccordement de 12 panneaux en autoconsommation sur le tableau existant. Pose de l’onduleur, protection cote continu et cote alternatif puis mise en place du compteur de production. Controle des chaines au multimetre avant mise en service.',
   'Julien P.', 'https://images.pexels.com/photos/28851165/pexels-photo-28851165.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['SMA', 'Schneider Electric'], '2026-04-28T10:45:00+02:00'),

  ('Eclairage d atelier en LED haute baie', 'Palaiseau', 48.7149, 2.2488,
   'Atelier de 300 m2 eclaire par des luminaires a vapeur de mercure. Remplacement par 18 luminaires LED haute baie avec detecteurs de niveau d’eclairement. Mesure avant et apres : 180 lux portes a 400 lux pour la moitie de la puissance.',
   'Thomas R.', 'https://images.pexels.com/photos/26843107/pexels-photo-26843107.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Philips', 'Siemens'], '2026-04-17T08:20:00+02:00'),

  ('Deux prises deplacees apres travaux', 'Orsay', 48.6997, 2.1878,
   'Apres la pose d’un nouveau plan de travail, les prises se retrouvaient masquees par les meubles. Deplacement des deux socles, rebouchage des anciens emplacements et reprise du carrelage. Circuits reidentifies sur le tableau pour le prochain intervenant.',
   'Mehdi A.', 'https://images.pexels.com/photos/6473982/pexels-photo-6473982.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2026-04-09T14:40:00+02:00'),

  ('Tableau divisionnaire pour extension', 'Evry-Courcouronnes', 48.6243, 2.4294,
   'Extension de 40 m2 a alimenter depuis le logement existant. Creation d’un tableau divisionnaire avec differentiel et quatre circuits dedies, relie au tableau principal en 16 mm2. Mise en place de la liaison equipotentielle de la nouvelle piece d’eau.',
   'Nicolas V.', 'https://images.pexels.com/photos/28265032/pexels-photo-28265032.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Hager', 'Schneider Electric'], '2026-03-31T09:10:00+02:00'),

  ('Eclairage de jardin pilote', 'Savigny-sur-Orge', 48.6806, 2.3486,
   'Installation de sept bornes et projecteurs LED basse tension dans le jardin. Alimentation depuis un transformateur etanche et pilotage par application avec scenarios horaires. Raccordement de la pompe du bassin sur un depart protege.',
   'Antoine G.', 'https://images.pexels.com/photos/16423103/pexels-photo-16423103.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Somfy', 'Legrand'], '2026-03-20T15:05:00+02:00'),

  ('Diagnostic chauffage electrique', 'Athis-Mons', 48.7053, 2.3875,
   'Deux radiateurs ne chauffaient plus et un disjoncteur declenchait en pointe. Controle des resistances, mesures de puissance et verification du fil pilote. Remplacement d’un thermostat interne et reequilibrage de la puissance souscrite.',
   'Rachid Z.', 'https://images.pexels.com/photos/31701039/pexels-photo-31701039.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Atlantic', 'Legrand'], '2026-03-11T11:30:00+02:00'),

  ('Mise en securite d un logement', 'Draveil', 48.6844, 2.415,
   'Logement presente a la location avec plusieurs anomalies signalees par le diagnostic. Suppression des prises devenues inaccessibles, protection de tous les circuits et remise en place de la terre. Constitution du dossier de conformite pour le bailleur.',
   'Pierre-Yves C.', 'https://images.pexels.com/photos/15798782/pexels-photo-15798782.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric'], '2026-02-27T08:45:00+02:00'),

  ('Prises de cuisine repositionnees', 'Asnieres-sur-Seine', 48.9121, 2.2852,
   'Cuisine entierement refaite, les prises ne correspondaient plus au nouveau plan. Repositionnement de cinq socles et creation d’un circuit dedie pour le lave-vaisselle. Saignees rebouchees proprement avant la pose du credence.',
   'Ludovic F.', 'https://images.pexels.com/photos/7937305/pexels-photo-7937305.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2026-02-18T13:20:00+02:00'),

  ('Mise en conformite de deux appartements', 'Clichy', 48.9045, 2.3056,
   'Deux lots d’un immeuble ancien a remettre aux normes avant vente. Remplacement des tableaux, suppression des fils tissus et creation des circuits specialises. Chaque intervention photographiee pour constituer le dossier de conformite.',
   'Bruno T.', 'https://images.pexels.com/photos/28950842/pexels-photo-28950842.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Hager'], '2026-02-06T10:10:00+02:00'),

  ('Interphone de villa remplace', 'Garches', 48.8441, 2.1854,
   'Interphone audio devenu inaudible et bouton d’ouverture capricieux. Remplacement par un modele video avec vision nocturne et commande du portail. Reprise de l’alimentation depuis le tableau et tests d’ouverture depuis l’interieur.',
   'Yann D.', 'https://images.pexels.com/photos/32268533/pexels-photo-32268533.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Comelit', 'Bticino'], '2026-01-28T14:55:00+02:00'),

  ('Eclairage de terrasse en applique', 'Saint-Cloud', 48.8444, 2.2186,
   'Terrasse non eclairee et dangereuse le soir. Pose de six appliques etanches commandees par deux interrupteurs depuis le sejour. Passage des cables en gaine apparente soignee le long de la structure bois.',
   'Sebastien H.', 'https://images.pexels.com/photos/12083848/pexels-photo-12083848.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Philips', 'Legrand'], '2026-01-19T16:35:00+02:00'),

  ('Point de recharge pour vehicule electrique', 'Meudon', 48.8122, 2.235,
   'Le client venait de recevoir son vehicule et voulait une recharge a domicile. Installation d’un point de charge 11 kW en facade du garage avec protection adaptee et compteur dedie. Explication des plages creuses pour optimiser le cout.',
   'Christophe N.', 'https://images.pexels.com/photos/34800671/pexels-photo-34800671.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Wallbox', 'Hager'], '2026-01-09T09:25:00+02:00'),

  ('Luminaire suspendu sur mesure', 'Bois-Colombes', 48.9164, 2.269,
   'Pose d’un luminaire suspendu au-dessus d’un ilot de cuisine, dans une hauteur sous plafond genereuse. Renfort d’une boite de derivation adaptee au poids et cablage des trois points. Reglage de la hauteur de suspension avec la cliente.',
   'Vincent B.', 'https://images.pexels.com/photos/4792521/pexels-photo-4792521.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2025-12-18T15:45:00+01:00'),

  ('Armoire electrique de local technique', 'Gennevilliers', 48.9326, 2.297,
   'Armoire de local technique a reorganiser apres plusieurs ajouts non documentes. Reperage complet, remplacement des protections vetustes et plan de l’armoire affiche a l’interieur de la porte. Controle des serrages sur toute l’armoire.',
   'Franck D.', 'https://images.pexels.com/photos/32497160/pexels-photo-32497160.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric', 'Wago'], '2025-12-09T08:50:00+01:00'),

  ('Prises exterieures etanches pour jardin', 'Villeneuve-la-Garenne', 48.938, 2.3266,
   'Ajout de deux prises etanches en facade pour les outils de jardin et la tondeuse. Depart protege par un differentiel 30 mA et passage en gaine dans la vegetation. Verification de l’etancheite des boitiers apres pose.',
   'Eric M.', 'https://images.pexels.com/photos/3615721/pexels-photo-3615721.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Legrand'], '2025-11-27T11:15:00+01:00'),

  ('Installation a jour pour location', 'Chaville', 48.8066, 2.1887,
   'Preparation d’un logement avant mise en location, avec reprise des points signales comme vetustes. Remplacement des socles fatigues, pose de detecteurs de fumee et verification du tableau. Remise au proprietaire d’un compte rendu detaille.',
   'Olivier S.', 'https://images.pexels.com/photos/5767957/pexels-photo-5767957.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['Schneider Electric'], '2025-11-14T10:05:00+01:00'),

  ('Videophone et portail automatises', 'Le Plessis-Robinson', 48.7812, 2.2632,
   'Le client voulait voir et ouvrir depuis son telephone. Installation d’un videophone connecte et raccordement de la commande du portail sur le module de domotique. Programmation des acces et demonstration des deux applications en fin de chantier.',
   'Julien P.', 'https://images.pexels.com/photos/13007854/pexels-photo-13007854.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   ARRAY['ABB', 'Somfy', 'Comelit'], '2025-10-30T14:20:00+01:00')
),
inserted AS (
  INSERT INTO photos (title, city, lat, lng, description, author, image_url, published, source, detected_brands, created_at)
  SELECT d.title, d.city, d.lat::double precision, d.lng::double precision, d.description, d.author,
         d.image_url, true, 'manual', d.brands::text[], d.created_at::timestamptz
  FROM data d
  WHERE NOT EXISTS (
    SELECT 1 FROM photos p WHERE p.title = d.title AND p.city = d.city
  )
  RETURNING id, image_url, description
)
INSERT INTO photo_images (photo_id, image_url, caption, position)
SELECT id, image_url, description, 0 FROM inserted;
