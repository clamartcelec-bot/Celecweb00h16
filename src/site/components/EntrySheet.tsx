import { motion } from 'motion/react';
import { ArrowLeft, Calendar, MapPin, Tag, UserRound } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_SOFT } from '@/site/motion';
import { Sheet } from '@/site/components/Sheet';
import { Reviews } from '@/site/components/Reviews';
import { coverOf, fmtDate, type Photo } from '@/site/types';

export function EntrySheet({
  t,
  entry,
  userEmail,
  brandReturn,
  showConciergeReturn,
  isLinkedBrand,
  onBrand,
  onBackToBrand,
  onClose,
}: {
  t: Copy;
  entry: Photo;
  userEmail: string | null;
  brandReturn: string | null;
  showConciergeReturn: boolean;
  isLinkedBrand: (name: string) => boolean;
  onBrand: (name: string) => void;
  onBackToBrand: () => void;
  onClose: () => void;
}) {
  const cover = coverOf(entry);
  const gallery = [...(entry.photo_images ?? [])].sort((a, b) => a.position - b.position);

  return (
    <Sheet onClose={onClose} label={entry.title} closeLabel={t.close}>
      {cover && (
        <div className="s-sheet-hero">
          <motion.img src={cover} alt={entry.title} initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 1.4, ease: EASE_SOFT }} />
          <span />
        </div>
      )}
      <div className="s-sheet-body">
        <div className="s-sheet-backs">
          {brandReturn && (
            <button className="s-chip-btn" onClick={onBackToBrand}><ArrowLeft size={14} /> {brandReturn}</button>
          )}
          {showConciergeReturn && (
            <a className="s-chip-btn s-chip-btn--accent" href="/concierge"><ArrowLeft size={14} /> {t.backToConversation}</a>
          )}
        </div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7, ease: EASE_SOFT }}>
          <div className="s-sheet-meta">
            <span><UserRound size={13} /> {entry.author || 'CELEC'}</span>
            <span><Calendar size={13} /> {fmtDate(entry.created_at)}</span>
            {entry.city && <span><MapPin size={13} /> {entry.city}</span>}
          </div>
          <h2 className="s-sheet-title">{entry.title}</h2>
          {entry.description && <p className="s-sheet-text">{entry.description}</p>}
        </motion.div>

        {(entry.detected_brands?.length ?? 0) > 0 && (
          <div className="s-sheet-block">
            <h3 className="s-sheet-h3"><Tag size={15} /> {t.detectedBrands}</h3>
            <div className="s-tags">
              {entry.detected_brands!.map((b) => (
                <button key={b} className={`s-tag ${isLinkedBrand(b) ? 'is-linked' : ''}`} onClick={() => onBrand(b)}>{b}</button>
              ))}
            </div>
          </div>
        )}

        {gallery.length > 1 && (
          <div className="s-sheet-block">
            <h3 className="s-sheet-h3">{t.gallery}</h3>
            <div className="s-gallery">
              {gallery.map((img, i) => (
                <motion.figure
                  key={img.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.06, duration: 0.6, ease: EASE_SOFT }}
                >
                  <img src={img.image_url} alt={img.caption || ''} loading="lazy" />
                  {img.caption && <figcaption>{img.caption}</figcaption>}
                </motion.figure>
              ))}
            </div>
          </div>
        )}

        <Reviews t={t} targetType="photo" targetId={entry.id} userEmail={userEmail} autoLoad={false} />
      </div>
    </Sheet>
  );
}
