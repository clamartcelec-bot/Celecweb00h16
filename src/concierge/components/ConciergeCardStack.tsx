import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ConciergeCard } from '../types';
import { CardChip } from './CardChip';

interface ConciergeCardStackProps {
  cards: ConciergeCard[];
  ended: boolean;
  detailHrefFor: (card: ConciergeCard) => string;
}

const cardSizeClass = (index: number, total: number): string => {
  if (index === 0) return 'cc-card--featured';
  if (index === 1) return 'cc-card--wide';
  if (index === 2) return 'cc-card--tall';
  if (total === 4 && index === 3) return 'cc-card--wide';
  return '';
};

export function ConciergeCardStack({ cards, ended, detailHrefFor }: ConciergeCardStackProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Sur mobile la liste est un carrousel horizontal : on repère la carte
  // la plus centrée pour allumer le point de repère correspondant.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const handleScroll = () => {
      let closest = 0;
      let smallest = Number.POSITIVE_INFINITY;
      Array.from(node.children).forEach((child, index) => {
        const distance = Math.abs((child as HTMLElement).offsetLeft - node.scrollLeft);
        if (distance < smallest) {
          smallest = distance;
          closest = index;
        }
      });
      setActiveIndex(closest);
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [cards.length]);

  return (
    <div className="concierge-flow">
      <div className="concierge-flow-head">
        <span className="concierge-flow-label">Ce que je vous montre</span>
      </div>

      <div className="concierge-card-list" ref={listRef}>
        <AnimatePresence mode="popLayout" initial={false}>
          {cards.map((card, index) => (
            <CardChip
              key={card.id}
              card={card}
              index={index}
              featured={index === 0}
              sizeClass={cardSizeClass(index, cards.length)}
              detailHref={detailHrefFor(card)}
            />
          ))}
        </AnimatePresence>
      </div>

      {cards.length > 1 && (
        <div className="cc-dots" aria-hidden="true">
          {cards.map((card, index) => (
            <span key={card.id} className={`cc-dot ${index === activeIndex ? 'cc-dot--active' : ''}`} />
          ))}
        </div>
      )}

      {ended && (
        <p className="concierge-flow-note">
          L’appel est terminé. Les billets présentés restent marqués dans le carnet jusqu’à votre prochaine visite.
        </p>
      )}
    </div>
  );
}
