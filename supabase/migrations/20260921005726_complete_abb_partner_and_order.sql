/*
# Complete the ABB partner sheet and order the partners

1. Problem
  - An "ABB" partner row already existed, so the new ABB presentation text was skipped and
    the entry kept its very short old description. Display positions also collided, since
    the pre-existing "BLOCK" row already sat at position 1.

2. Fix
  - The ABB sheet receives its full presentation text, its image and position 1.
  - The ten other brand sheets are renumbered 2 to 11 in the intended reading order.
  - The pre-existing "BLOCK" sheet is moved to position 12, after the brand sheets.

3. Notes
  - Descriptions and ordering only. ABB's row id is preserved, so nothing already linked
    to it is broken.
*/

UPDATE partners SET
  description = 'La reference technique pour la domotique et le pilotage du batiment. Chez ABB on aime la rigueur du KNX, la tenue des modules dans le temps et une documentation qui ne laisse jamais l''installateur seul. C''est la marque qu''on choisit quand une maison doit rester pilotable et maintenable dans vingt ans : eclairage, volets, chauffage, scenarios de presence, supervision.',
  logo_url = 'https://images.pexels.com/photos/33706880/pexels-photo-33706880.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  position = 1
WHERE lower(name) = 'abb';

UPDATE partners SET position = 2 WHERE lower(name) = 'hager';
UPDATE partners SET position = 3 WHERE lower(name) = 'schneider electric';
UPDATE partners SET position = 4 WHERE lower(name) = 'legrand';
UPDATE partners SET position = 5 WHERE lower(name) = 'somfy';
UPDATE partners SET position = 6 WHERE lower(name) = 'delta dore';
UPDATE partners SET position = 7 WHERE lower(name) = 'ajax systems';
UPDATE partners SET position = 8 WHERE lower(name) = 'basalte';
UPDATE partners SET position = 9 WHERE lower(name) = 'artemide';
UPDATE partners SET position = 10 WHERE lower(name) = 'denon';
UPDATE partners SET position = 11 WHERE lower(name) = 'bowers & wilkins';
UPDATE partners SET position = 12 WHERE lower(name) = 'block';
