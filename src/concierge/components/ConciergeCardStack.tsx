import { useMemo, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { ConciergeCard } from '../types';
import { CardChip } from './CardChip';

interface ConciergeCardStackProps {
  cards: ConciergeCard[];
  ended: boolean;
  detailHrefFor: (card: ConciergeCard) => string;
}

interface Moment {
  key: string;
  cards: ConciergeCard[];
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const momentVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.12 } },
};

const MOMENT_INTRO: Record<ConciergeCard['kind'], string> = {
  carnet: 'Des chantiers réels, tirés de notre carnet d’interventions',
  brand: 'Le matériel et les partenaires avec qui nous travaillons',
  info: 'L’essentiel de ce que je viens de vous expliquer',
};

function groupMoments(cards: ConciergeCard[]): Moment[] {
  const moments: Moment[] = [];
  cards.forEach((card) => {
    const key = String(card.shownAt ?? card.id);
    const last = moments[moments.length - 1];
    if (last && last.key === key) last.cards.push(card);
    else moments.push({ key, cards: [card] });
  });
  return moments;
}

function introFor(moment: Moment) {
  const kinds = new Set(moment.cards.map((card) => card.kind));
  if (kinds.size > 1) return 'Plusieurs éléments pour illustrer votre question';
  return MOMENT_INTRO[moment.cards[0].kind];
}

export function ConciergeCardStack({ cards, ended, detailHrefFor }: ConciergeCardStackProps) {
  const [pastOpen, setPastOpen] = useState(false);
  const moments = useMemo(() => groupMoments(cards), [cards]);
  const [current, ...past] = moments;
  const pastCount = past.reduce((sum, moment) => sum + moment.cards.length, 0);

  if (!current) return null;

  return (
    <section className="concierge-flow" aria-label="Ce que le concierge vous montre">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.key}
          className="cc-moment"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -12, filter: 'blur(6px)', transition: { duration: 0.3 } }}
        >
          <motion.header
            className="cc-moment-head"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="cc-moment-kicker">
              <span className="cc-moment-dot" />
              Je vous montre
            </span>
            <p className="cc-moment-intro">{introFor(current)}</p>
          </motion.header>

          <motion.div
            className={`cc-grid cc-grid--${Math.min(current.cards.length, 3)}`}
            variants={momentVariants}
            initial="hidden"
            animate="visible"
          >
            {current.cards.map((card, index) => (
              <CardChip key={card.id} card={card} lead={index === 0} detailHref={detailHrefFor(card)} />
            ))}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {pastCount > 0 && (
        <div className="cc-past">
          <button className="cc-past-toggle" onClick={() => setPastOpen((open) => !open)} aria-expanded={pastOpen}>
            Déjà montré pendant l’échange ({pastCount})
            <ChevronDown size={15} className={`cc-chevron ${pastOpen ? 'cc-chevron--up' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {pastOpen && (
              <motion.div
                className="cc-past-grid"
                variants={momentVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, height: 0 }}
              >
                {past.flatMap((moment) => moment.cards).map((card) => (
                  <CardChip key={card.id} card={card} lead={false} detailHref={detailHrefFor(card)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {ended && (
        <p className="concierge-flow-note">
          L’appel est terminé. Les billets présentés restent marqués dans le carnet jusqu’à votre prochaine visite.
        </p>
      )}
    </section>
  );
}
