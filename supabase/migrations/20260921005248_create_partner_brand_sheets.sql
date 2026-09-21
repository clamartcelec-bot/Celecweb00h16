/*
# Create the partner brand sheets

1. Content added
  - 11 published `partners` rows describing the brands CELEC works with:
    ABB, Hager, Schneider Electric, Legrand, Somfy, Delta Dore, Ajax Systems,
    Basalte, Artemide, Denon, Bowers & Wilkins.
  - Each has a presentation text (what the brand does, why we like working with it,
    what we use it for) and a photo used as the card image.
  - `position` sets the display order.

2. Purpose
  - Give the Partners page real content, and give a reference list the detected brands
    of the carnet can be matched against.

3. Notes
  - Additive only, no existing row is modified.
  - Idempotent: a brand is skipped when a partner with the same name already exists.
*/

WITH data(name, description, logo_url, position) AS (
  VALUES
  ('ABB',
   'La reference technique pour la domotique et le pilotage du batiment. Chez ABB on aime la rigueur du KNX, la tenue des modules dans le temps et une documentation qui ne laisse jamais l''installateur seul. C''est la marque qu''on choisit quand une maison doit rester pilotable et maintenable dans vingt ans : eclairage, volets, chauffage, scenarios de presence, supervision.',
   'https://images.pexels.com/photos/33706880/pexels-photo-33706880.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 1),

  ('Hager',
   'Un materiel de tableau sobre, bien pense et facile a mettre en oeuvre. Hager nous convient pour les tableaux de logement et les petites installations tertiaires, avec des appareils modulaires lisibles et un reperage qui reste clair. On apprecie particulierement leurs coffrets et leurs protections differentielles, qui vieillissent bien.',
   'https://images.pexels.com/photos/38217230/pexels-photo-38217230.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 2),

  ('Schneider Electric',
   'Le couteau suisse de l''electricite du quotidien. Schneider couvre tout, du disjoncteur de tableau a la prise connectee, avec une disponibilite en fournisseur qui nous evite les ruptures de chantier. C''est notre base pour les mises aux normes, les tableaux divisionnaires et les departs specialises cuisine et recharge.',
   'https://images.pexels.com/photos/19841119/pexels-photo-19841119.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 3),

  ('Legrand',
   'La finition francaise par excellence sur l''appareillage. Les mecanismes tiennent, les plaques se declinent dans beaucoup de matieres et le rendu reste propre meme apres des annees d''usage. On pose du Legrand dans les renovations ou le client fait attention au detail, et sur toute l''appareillerie classique : prises, interrupteurs, RJ45, goulottes.',
   'https://images.pexels.com/photos/18471565/pexels-photo-18471565.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 4),

  ('Somfy',
   'Le motoriste historique des volets, stores et portails. Somfy reste notre valeur sure pour la motorisation, avec un parc de moteurs que l''on retrouve dans presque toutes les maisons et des modules de pilotage simples a integrer. On l''utilise pour motoriser de l''existant sans tout casser, et pour raccorder volets et portails a une commande unique.',
   'https://images.pexels.com/photos/33427061/pexels-photo-33427061.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 5),

  ('Delta Dore',
   'Specialiste du chauffage, du fil pilote et de la gestion d''energie. Delta Dore parle bien l''electricite francaise : thermostats, planchers chauffants, gestionnaires de chauffage. On y va quand un client veut maitriser sa consommation piece par piece ou piloter un chauffage electrique depuis son telephone.',
   'https://images.pexels.com/photos/18471536/pexels-photo-18471536.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 6),

  ('Ajax Systems',
   'La securite sans fil qui se pose proprement. Les alarmes Ajax sont rapides a installer, discretes, et couvrent intrusion, incendie et fuite d''eau depuis une seule application. On les installe en maison individuelle comme en local professionnel, souvent en complement d''un chantier electrique.',
   'https://images.pexels.com/photos/1990764/pexels-photo-1990764.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 7),

  ('Basalte',
   'Le bel interrupteur belge. Basalte pousse l''appareillage domotique vers un objet design, avec des boutons en verre ou en aluminium qui remplacent la collection de commandes murales. On le reserve aux projets haut de gamme ou l''eclairage et les scenarios doivent se commande d''un geste, sans effort de lecture.',
   'https://images.pexels.com/photos/775907/pexels-photo-775907.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 8),

  ('Artemide',
   'Le luminaire comme objet d''architecture. Artemide signe des pieces qui structurent un espace autant qu''elles l''eclairent, avec une qualite de lumiere tres soignee. On les croise sur les projets ou la lumiere est un choix de decoration, et on prend le temps de calculer l''implantation pour que le rendu soit a la hauteur de la piece.',
   'https://images.pexels.com/photos/12092231/pexels-photo-12092231.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 9),

  ('Denon',
   'Une valeur sure pour le son et les amplifications multiroom. Les amplis et recepteurs Denon se comportent bien sur la duree, se pilotent facilement et rendent les installations audio domestiques simples a exploiter au quotidien. On les integre volontiers a un projet de renovation quand le client veut du son dans plusieurs pieces.',
   'https://images.pexels.com/photos/13378811/pexels-photo-13378811.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 10),

  ('Bowers & Wilkins',
   'L''enceinte anglaise que l''on installe quand le client ecoute vraiment de la musique. Bowers & Wilkins soigne autant le rendu acoustique que la finition, et les modeles encastrables permettent de garder un interieur net sans sacrifier la qualite d''ecoute. On les associe volontiers a un reseau audio pilote depuis une seule commande.',
   'https://images.pexels.com/photos/373632/pexels-photo-373632.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 11)
)
INSERT INTO partners (name, description, logo_url, position, published)
SELECT d.name, d.description, d.logo_url, d.position, true
FROM data d
WHERE NOT EXISTS (
  SELECT 1 FROM partners p WHERE lower(p.name) = lower(d.name)
);
