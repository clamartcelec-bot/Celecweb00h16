import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MapPin, MessageCircle, X } from 'lucide-react';
import type { ConciergeCard } from '../types';
import type { BrandKnowledge, CarnetEntry } from '../services/knowledge';
import { INFO_ICONS, provenance } from './CardChip';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export interface LensDetail {
  card: ConciergeCard;
  entry?: CarnetEntry;
  brand?: BrandKnowledge;
  related: CarnetEntry[];
}

interface ConciergeLensProps {
  detail: LensDetail | null;
  onClose: () => void;
  onAsk: (card: ConciergeCard) => void;
  onOpenEntry: (entry: CarnetEntry) => void;
}

/** In-call viewer: the card opens over the conversation, the concierge keeps talking behind it. */
export function ConciergeLens({ detail, onClose, onAsk, onOpenEntry }: ConciergeLensProps) {
  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, onClose]);

  return (
    <AnimatePresence>
      {detail && (
        <>
          <motion.div
            key="lens-scrim"
            className="cl-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
          <motion.aside
            key="lens-panel"
            className="cl-panel"
            role="dialog"
            aria-modal="true"
            aria-label={detail.card.title}
            initial={{ opacity: 0, x: 40, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.25, ease: EASE } }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <LensBody key={detail.card.id} detail={detail} onClose={onClose} onAsk={onAsk} onOpenEntry={onOpenEntry} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function LensBody({ detail, onClose, onAsk, onOpenEntry }: { detail: LensDetail } & Omit<ConciergeLensProps, 'detail'>) {
  const { card, entry, brand, related } = detail;
  const source = provenance(card);
  const images = entry?.images.length ? entry.images : card.imageUrl ? [card.imageUrl] : [];
  const [imageIndex, setImageIndex] = useState(0);
  const description = entry?.description || brand?.description || card.excerpt || '';

  return (
    <div className="cl-inner">
      <header className="cl-head">
        <span className="cl-source">{source.icon}{source.label}<em>{source.detail}</em></span>
        <button type="button" className="cl-close" onClick={onClose} aria-label="Fermer l’aperçu">
          <X size={16} />
        </button>
      </header>

      {images.length > 0 && (
        <div className="cl-gallery">
          <div className="cl-stage">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={images[imageIndex]}
                src={images[imageIndex]}
                alt={card.title}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              />
            </AnimatePresence>
          </div>
          {images.length > 1 && (
            <div className="cl-thumbs">
              {images.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  className="cl-thumb"
                  data-active={index === imageIndex || undefined}
                  onClick={() => setImageIndex(index)}
                  aria-label={`Photo ${index + 1}`}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cl-body">
        {card.kind === 'info' && <span className="cl-info-icon">{INFO_ICONS[card.infoKind ?? 'info']}</span>}
        <h2 className="cl-title">{card.title}</h2>
        {(card.city || entry?.city) && (
          <p className="cl-place"><MapPin size={13} />{entry?.city || card.city}</p>
        )}
        {description && <p className="cl-text">{description}</p>}

        {card.kind === 'info' && (
          <ol className={`cl-points cl-points--${card.infoKind ?? 'info'}`}>
            {(card.points ?? []).map((point, index) => (
              <motion.li
                key={point}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.07, duration: 0.4, ease: EASE }}
              >
                <span className="cl-point-mark">{card.infoKind === 'steps' ? index + 1 : ''}</span>
                {point}
              </motion.li>
            ))}
          </ol>
        )}
        {card.note && <p className="cl-note">{card.note}</p>}

        {(entry?.brands.length ?? 0) > 0 && (
          <div className="cl-tags">
            {entry?.brands.map((name) => <span key={name} className="cl-tag">{name}</span>)}
          </div>
        )}
        {brand && (
          <p className="cl-stat">
            <strong>{brand.count}</strong> chantier{brand.count > 1 ? 's' : ''} du carnet avec ce matériel
          </p>
        )}

        {related.length > 0 && (
          <div className="cl-related">
            <span className="cl-related-label">Dans le carnet</span>
            <div className="cl-related-row">
              {related.map((item) => (
                <button key={item.id} type="button" className="cl-related-item" onClick={() => onOpenEntry(item)}>
                  {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="cl-related-ph" />}
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="cl-foot">
        <button type="button" className="cl-ask" onClick={() => onAsk(card)}>
          <MessageCircle size={15} />
          En parler avec le concierge
        </button>
      </footer>
    </div>
  );
}
