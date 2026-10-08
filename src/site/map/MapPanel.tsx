import { motion, useDragControls, type PanInfo } from 'motion/react';
import { ArrowRight, MapPin, X } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { coverOf, fmtDate } from '@/site/types';
import { KindMark } from '@/site/map/MapFilters';
import type { MapPoint } from '@/site/map/mapData';

export function MapPanel({
  t,
  point,
  sheet,
  onClose,
  onOpen,
}: {
  t: Copy;
  point: MapPoint;
  sheet: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { entry } = point;
  const controls = useDragControls();
  const images = [...new Set([coverOf(entry), ...(entry.photo_images ?? []).map((i) => i.image_url)].filter(Boolean))];
  const endDrag = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose();
  };

  return (
    <motion.aside
      className="mx-panel"
      data-sheet={sheet || undefined}
      initial={sheet ? { y: '100%' } : { opacity: 0, x: 24, scale: 0.98 }}
      animate={sheet ? { y: 0 } : { opacity: 1, x: 0, scale: 1 }}
      exit={sheet ? { y: '100%' } : { opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      drag={sheet ? 'y' : false}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.7 }}
      onDragEnd={endDrag}
      aria-label={entry.title}
    >
      {sheet && <span className="mx-grab" aria-hidden onPointerDown={(e) => controls.start(e)}><i /></span>}
      <div className="mx-gallery" data-single={images.length < 2 || undefined}>
        {images.length === 0 && <div className="mx-gallery-empty"><KindMark kind={point.kind} /></div>}
        {images.map((src, i) => (
          <motion.img
            key={src}
            src={src}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            draggable={false}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.08 * i, ease: EASE_OUT }}
          />
        ))}
      </div>
      <button className="mx-panel-close" onClick={onClose} aria-label={t.close}><X size={16} /></button>

      <div className="mx-panel-body">
        <div className="mx-tags">
          <span className="mx-tag mx-tag--kind"><KindMark kind={point.kind} /> {t.mapKinds[point.kind]}</span>
          {point.themes.slice(0, 3).map((th) => <span key={th} className="mx-tag">{t.mapThemes[th]}</span>)}
        </div>
        <h3>{entry.title}</h3>
        <p className="mx-meta"><MapPin size={13} /> {entry.city} <i /> {fmtDate(entry.created_at)}</p>
        {entry.description && <p className="mx-desc">{entry.description}</p>}
        {!!entry.detected_brands?.length && (
          <p className="mx-brands">{entry.detected_brands.slice(0, 5).join(' · ')}</p>
        )}
        <button className="s-btn s-btn--primary s-btn--block" onClick={onOpen}>
          {t.mapRead} <ArrowRight size={16} />
        </button>
      </div>
    </motion.aside>
  );
}
