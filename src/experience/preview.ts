// Only used in an explicitly labelled, disconnected design preview. Never sent to Supabase.
export const DESIGN_PREVIEW = import.meta.env.VITE_CELEC_DESIGN_PREVIEW === 'true';
export const PREVIEW_PROJECTS = [
  { id: 'preview-light', title: 'La lumière, pensée pour les lieux.', city: 'Clamart', lat: 48.8005, lng: 2.2634, description: 'Exemple de présentation : éclairage et rénovation d’une maison. Les photos de cet aperçu sont des illustrations.', author: 'Aperçu visuel', image_url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200', detected_brands: ['Legrand'], created_at: '2026-10-01' },
  { id: 'preview-home', title: 'Repenser toute une installation.', city: 'Meudon', lat: 48.812, lng: 2.235, description: 'Exemple de carte pour raconter une rénovation électrique complète.', author: 'Aperçu visuel', image_url: 'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=900', detected_brands: ['Hager'], created_at: '2026-10-01' },
  { id: 'preview-network', title: 'Un réseau qui relie les usages.', city: 'Issy-les-Moulineaux', lat: 48.8247, lng: 2.2735, description: 'Exemple de carte pour un projet de réseau et de maison connectée.', author: 'Aperçu visuel', image_url: 'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=900', detected_brands: ['UniFi'], created_at: '2026-10-01' },
  { id: 'preview-detail', title: 'Le soin des détails.', city: 'Paris', lat: 48.839, lng: 2.32, description: 'Exemple de présentation du travail et des choix techniques.', author: 'Aperçu visuel', image_url: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=900', detected_brands: ['Legrand'], created_at: '2026-10-01' },
];
export const PREVIEW_PARTNERS = ['Legrand', 'Hager', 'UniFi'].map((name, position) => ({
  id: `preview-${name}`, name, logo_url: '', description: 'Fiche d’illustration. La présentation et les liens avec le Carnet seront ceux définis par CELEC.', position, published: true, created_at: '2026-10-01',
}));
