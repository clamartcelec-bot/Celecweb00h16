import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ConciergeCard } from '../types';
import { CardChip } from './CardChip';

interface ConciergeCardStackProps {
  cards: ConciergeCard[];
  onOpen: (card: ConciergeCard) => void;
}

interface Slide {
  key: string;
  cards: ConciergeCard[];
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const FIRST_REVEAL_MS = 260;
const NEXT_REVEAL_MS = 900;

const SLIDE_INTRO: Record<ConciergeCard['kind'], string> = {
  carnet: 'Chantiers réels du carnet',
  brand: 'Matériel & partenaires',
  info: 'L’essentiel à retenir',
};

function groupSlides(cards: ConciergeCard[]): Slide[] {
  const slides: Slide[] = [];
  cards.forEach((card) => {
    const key = String(card.shownAt ?? card.id);
    const last = slides[slides.length - 1];
    if (last && last.key === key) last.cards.push(card);
    else slides.push({ key, cards: [card] });
  });
  return slides;
}

function introFor(slide: Slide) {
  const kinds = new Set(slide.cards.map((card) => card.kind));
  return kinds.size > 1 ? 'Pour illustrer votre question' : SLIDE_INTRO[slide.cards[0].kind];
}

/** Presentation deck: one slide per thing the concierge shows, cards revealed one by one under a red focus frame. */
export function ConciergeCardStack({ cards, onOpen }: ConciergeCardStackProps) {
  const slides = useMemo(() => groupSlides(cards), [cards]);
  const latest = slides.length - 1;
  const [viewed, setViewed] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<{ key: string; count: number }>({ key: '', count: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);

  const latestSlide = slides[latest];
  const latestKey = latestSlide?.key ?? '';

  useEffect(() => { setViewed(null); }, [latestKey]);

  useEffect(() => {
    if (!latestSlide) return;
    const current = revealed.key === latestKey ? revealed.count : 0;
    if (current >= latestSlide.cards.length) return;
    const timer = window.setTimeout(() => {
      setRevealed({ key: latestKey, count: current + 1 });
      setFocusId(latestSlide.cards[current].id);
    }, current === 0 ? FIRST_REVEAL_MS : NEXT_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [latestKey, latestSlide, revealed]);

  if (!latestSlide) return null;

  const index = viewed ?? latest;
  const slide = slides[index];
  const isLatest = index === latest;
  const visibleCards = isLatest
    ? slide.cards.slice(0, revealed.key === latestKey ? revealed.count : 0)
    : slide.cards;
  const focused = visibleCards.find((card) => card.id === focusId)?.id ?? visibleCards[visibleCards.length - 1]?.id;

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(latest, next));
    setViewed(clamped === latest ? null : clamped);
    setFocusId(null);
  };

  return (
    <section className="cc-deck" aria-label="Ce que le concierge vous montre">
      <header className="cc-deck-head">
        <span className="cc-deck-count">
          <span className="cc-deck-dot" />
          {String(index + 1).padStart(2, '0')}<em>/{String(slides.length).padStart(2, '0')}</em>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={slide.key}
            className="cc-deck-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {introFor(slide)}
          </motion.p>
        </AnimatePresence>
        {slides.length > 1 && (
          <div className="cc-deck-nav">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Diapositive précédente">
              <ChevronLeft size={15} />
            </button>
            <div className="cc-deck-dots" role="tablist" aria-label="Diapositives">
              {slides.map((item, dotIndex) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={dotIndex === index}
                  aria-label={`Diapositive ${dotIndex + 1}`}
                  className="cc-deck-pip"
                  data-active={dotIndex === index || undefined}
                  onClick={() => go(dotIndex)}
                />
              ))}
            </div>
            <button type="button" onClick={() => go(index + 1)} disabled={index === latest} aria-label="Diapositive suivante">
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </header>

      <LayoutGroup id="cc-deck">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slide.key}
            className="cc-row"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <AnimatePresence initial={false}>
              {visibleCards.map((card, cardIndex) => (
                <div key={card.id} className={`cc-slot cc-slot--${card.kind}`}>
                  <CardChip
                    card={card}
                    index={cardIndex}
                    focused={card.id === focused}
                    onOpen={() => { setFocusId(card.id); onOpen(card); }}
                  />
                  {card.id === focused && (
                    <motion.span
                      layoutId="cc-focus"
                      className="cc-focus"
                      aria-hidden="true"
                      initial={{ opacity: 0, scale: 1.14 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                    >
                      <span className="cc-focus-corner cc-focus-corner--tl" />
                      <span className="cc-focus-corner cc-focus-corner--br" />
                    </motion.span>
                  )}
                </div>
              ))}
            </AnimatePresence>
            {isLatest && visibleCards.length < slide.cards.length && (
              <span className="cc-slot cc-slot--ghost" aria-hidden="true" />
            )}
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </section>
  );
}
