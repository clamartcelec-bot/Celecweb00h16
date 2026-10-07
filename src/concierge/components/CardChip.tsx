import { motion, type Variants } from 'motion/react';
import { ArrowUpRight, BookOpen, CheckCircle2, Handshake, ListOrdered, MapPin, Phone, Sparkles } from 'lucide-react';
import type { ConciergeCard } from '../types';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 36, scale: 0.94, rotateX: 10, filter: 'blur(14px)' },
  visible: {
    opacity: 1, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 120, damping: 20, mass: 0.9 },
  },
  exit: { opacity: 0, scale: 0.96, filter: 'blur(8px)', transition: { duration: 0.3, ease: EASE } },
};

const pointVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: (index: number) => ({ opacity: 1, x: 0, transition: { delay: 0.35 + index * 0.09, duration: 0.5, ease: EASE } }),
};

function provenance(card: ConciergeCard) {
  if (card.kind === 'carnet') {
    return { icon: <BookOpen size={12} />, label: 'Carnet d’interventions', detail: card.city || 'Chantier réel' };
  }
  if (card.kind === 'brand') {
    return { icon: <Handshake size={12} />, label: 'Marques & partenaires', detail: 'Matériel posé par CELEC' };
  }
  return { icon: <Sparkles size={12} />, label: 'Repères CELEC', detail: 'Synthèse du concierge' };
}

const INFO_ICONS = {
  info: <Sparkles size={16} />,
  steps: <ListOrdered size={16} />,
  checklist: <CheckCircle2 size={16} />,
  contact: <Phone size={16} />,
};

interface CardChipProps {
  card: ConciergeCard;
  lead: boolean;
  detailHref: string;
}

export function CardChip({ card, lead, detailHref }: CardChipProps) {
  const source = provenance(card);

  if (card.kind === 'info') {
    return (
      <motion.article variants={cardVariants} className="cc-card cc-card--info" data-lead={lead || undefined}>
        <header className="cc-info-head">
          <span className="cc-info-icon">{INFO_ICONS[card.infoKind ?? 'info']}</span>
          <h3 className="cc-title">{card.title}</h3>
        </header>
        <ol className={`cc-points cc-points--${card.infoKind ?? 'info'}`}>
          {(card.points ?? []).map((point, index) => (
            <motion.li key={point} custom={index} variants={pointVariants}>
              <span className="cc-point-mark">{card.infoKind === 'steps' ? String(index + 1).padStart(2, '0') : ''}</span>
              <span>{point}</span>
            </motion.li>
          ))}
        </ol>
        {card.note && <p className="cc-note">{card.note}</p>}
        <footer className="cc-source">{source.icon}<span>{source.label}</span><em>{source.detail}</em></footer>
      </motion.article>
    );
  }

  return (
    <motion.a
      href={detailHref}
      target="_blank"
      rel="noreferrer"
      variants={cardVariants}
      whileHover={{ y: -4 }}
      className={`cc-card cc-card--${card.kind}`}
      data-lead={lead || undefined}
    >
      <div className="cc-media">
        {card.imageUrl ? (
          <motion.img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            initial={{ scale: 1.18 }}
            animate={{ scale: 1.02 }}
            transition={{ duration: 2.4, ease: EASE }}
          />
        ) : (
          <div className="cc-media-mark" aria-hidden="true">
            <span>{card.title.slice(0, 2)}</span>
          </div>
        )}
        <span className="cc-sheen" aria-hidden="true" />
        <span className="cc-source cc-source--float">{source.icon}<span>{source.label}</span></span>
      </div>

      <div className="cc-body">
        <h3 className="cc-title">{card.title}</h3>
        {card.excerpt && <p className="cc-excerpt">{card.excerpt}</p>}
        <div className="cc-meta">
          {card.city && <span className="cc-tag"><MapPin size={11} />{card.city}</span>}
          {card.brands?.map((brand) => <span key={brand} className="cc-tag cc-tag--brand">{brand}</span>)}
          {card.kind === 'brand' && !card.excerpt && <span className="cc-tag">{card.subtitle}</span>}
        </div>
        <span className="cc-open">
          {card.kind === 'carnet' ? 'Voir le billet' : 'Voir la fiche'}
          <ArrowUpRight size={14} />
        </span>
      </div>
    </motion.a>
  );
}
