import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import type { Photo } from '@/site/types';
import { MapExplorer } from '@/site/map/MapExplorer';

export function MapPage({ t, photos, onOpen, onBack }: { t: Copy; photos: Photo[]; onOpen: (p: Photo) => void; onBack: () => void }) {
  return (
    <section className="mx-page">
      <motion.header
        className="mx-page-head"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        <button className="s-icon-btn" onClick={onBack} aria-label={t.mapBack} title={t.mapBack}><ArrowLeft size={16} /></button>
        <div>
          <span className="mx-eyebrow">{t.mapEyebrow}</span>
          <h1>{t.mapTitle}</h1>
        </div>
      </motion.header>
      <MapExplorer t={t} photos={photos} variant="page" onOpen={onOpen} />
    </section>
  );
}
