/*
# Use a verified photo for the Artemide partner card

1. Modified data
  - The Artemide partner card image is replaced by a verified pendant-lighting photo.

2. Notes
  - Single row update, matched by name.
*/

UPDATE partners
SET logo_url = 'https://images.pexels.com/photos/1955549/pexels-photo-1955549.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
WHERE lower(name) = 'artemide';
