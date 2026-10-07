import { motion } from 'motion/react';
import { BookOpen, CheckCircle2, Handshake, ListOrdered, Maximize2, MapPin, Phone, Sparkles } from 'lucide-react';
import type { ConciergeCard } from '../types';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function provenance(card: ConciergeCard) {
  if (card.kind === 'carnet') {
    return { icon: <BookOpen size={11} />, label: 'Carnet', detail: card.city || 'Chantier réel' };
  }
  if (card.kind === 'brand') {
    return { icon: <Handshake size={11} />, label: 'Partenaire', detail: 'Matériel posé par CELEC' };
  }
  return { icon: <Sparkles size={11} />, label: 'Repères', detail: 'Synthèse du concierge' };
}

export const INFO_ICONS = {
  info: <Sparkles size={14} />,
  steps: <ListOrdered size={14} />,
  checklist: <CheckCircle2 size={14} />,
  contact: <Phone size={14} />,
};

interface CardChipProps {
  card: ConciergeCard;
  index: number;
  focused: boolean;
  onOpen: () => void;
}

export function CardChip({ card, index, focused, onOpen }: CardChipProps) {
  const source = provenance(card);
  const label = `${source.label} : ${card.title}. Ouvrir en grand`;

  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onOpen}
      aria-label={label}
      className={`cc-card cc-card--${card.kind}`}
      data-focused={focused || undefined}
      initial={{ opacity: 0, x: 48, scale: 0.9, filter: 'blur(10px)' }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.94, filter: 'blur(6px)', transition: { duration: 0.25, ease: EASE } }}
      transition={{ type: 'spring', stiffness: 170, damping: 22 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="cc-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>

      {card.kind === 'info' ? (
        <span className="cc-info">
          <span className="cc-info-head">
            <span className="cc-info-icon">{INFO_ICONS[card.infoKind ?? 'info']}</span>
            <span className="cc-title">{card.title}</span>
          </span>
          <span className={`cc-points cc-points--${card.infoKind ?? 'info'}`}>
            {(card.points ?? []).slice(0, 3).map((point, pointIndex) => (
              <span key={point} className="cc-point">
                <span className="cc-point-mark">{card.infoKind === 'steps' ? pointIndex + 1 : ''}</span>
                <span>{point}</span>
              </span>
            ))}
            {(card.points?.length ?? 0) > 3 && <span className="cc-more">+{(card.points?.length ?? 0) - 3}</span>}
          </span>
        </span>
      ) : (
        <>
          <span className="cc-media">
            {card.imageUrl ? (
              <motion.img
                src={card.imageUrl}
                alt=""
                loading="lazy"
                initial={{ scale: 1.16 }}
                animate={{ scale: 1.02 }}
                transition={{ duration: 2.2, ease: EASE }}
              />
            ) : (
              <span className="cc-media-mark" aria-hidden="true"><span>{card.title.slice(0, 2)}</span></span>
            )}
            <span className="cc-sheen" aria-hidden="true" />
          </span>
          <span className="cc-body">
            <span className="cc-title">{card.title}</span>
            <span className="cc-meta">
              {card.city && <span className="cc-tag"><MapPin size={10} />{card.city}</span>}
              {card.kind === 'brand' && <span className="cc-tag">{card.subtitle}</span>}
            </span>
          </span>
        </>
      )}

      <span className="cc-foot">
        <span className="cc-source">{source.icon}{source.label}</span>
        <Maximize2 size={12} className="cc-expand" aria-hidden="true" />
      </span>
    </motion.button>
  );
}
