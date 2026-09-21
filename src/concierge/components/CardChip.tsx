import { ArrowUpRight, Camera, ChevronDown, Handshake } from 'lucide-react';
import type { ConciergeCard } from '../types';

interface CardChipProps {
  card: ConciergeCard;
  expanded: boolean;
  detailHref: string;
  onToggle: () => void;
}

export function CardChip({ card, expanded, detailHref, onToggle }: CardChipProps) {
  const isCarnet = card.kind === 'carnet';

  return (
    <article className={`cc-card ${expanded ? 'cc-card--open' : ''}`}>
      <button className="cc-card-btn" onClick={onToggle} aria-expanded={expanded}>
        <span className="cc-media">
          {card.imageUrl
            ? <img src={card.imageUrl} alt="" loading="lazy" />
            : isCarnet
              ? <span className="cc-media-fallback"><Camera size={18} /></span>
              : <span className="cc-media-fallback cc-media-fallback--brand"><Handshake size={18} /></span>}
        </span>
        <span className="cc-body">
          <span className="cc-badge">{isCarnet ? 'Carnet' : 'Marque'}</span>
          <strong>{card.title}</strong>
          {card.subtitle && <em>{card.subtitle}</em>}
        </span>
        <ChevronDown size={16} className={`cc-chevron ${expanded ? 'cc-chevron--up' : ''}`} />
      </button>

      {expanded && (
        <div className="cc-detail">
          <p>
            {isCarnet
              ? 'Ce billet du carnet CELEC a été présenté pendant la conversation.'
              : 'Cette marque fait partie des références que nous installons et dépannons.'}
          </p>
          <a className="cc-link" href={detailHref} target="_blank" rel="noreferrer">
            {isCarnet ? 'Ouvrir le billet' : 'Ouvrir la fiche'}
            <ArrowUpRight size={14} />
          </a>
        </div>
      )}
    </article>
  );
}
