import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { presentToGuide } from '@/experience/events';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import { ArrowUpRight, Camera, ChevronDown, Handshake } from 'lucide-react';
import type { ConciergeCard } from '../types';

interface CardChipProps {
  card: ConciergeCard;
  index: number;
  featured?: boolean;
  sizeClass?: string;
  detailHref: string;
}

const ENTRANCE_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const TILT_SPRING = { stiffness: 190, damping: 18 } as const;

export function CardChip({ card, index, featured = false, sizeClass = '', detailHref }: CardChipProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isCarnet = card.kind === 'carnet';
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLElement | null>(null);

  const tiltXTarget = useMotionValue(0);
  const tiltYTarget = useMotionValue(0);
  const rotateX = useSpring(tiltXTarget, TILT_SPRING);
  const rotateY = useSpring(tiltYTarget, TILT_SPRING);

  const spotlightX = useMotionValue(0);
  const spotlightY = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(260px circle at ${spotlightX}px ${spotlightY}px, rgba(232, 51, 106, 0.16), transparent 70%)`;

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (reduceMotion || event.pointerType !== 'mouse') return;
      const node = cardRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;
      tiltYTarget.set((ratioX - 0.5) * 5);
      tiltXTarget.set((0.5 - ratioY) * 5);
      spotlightX.set(event.clientX - rect.left);
      spotlightY.set(event.clientY - rect.top);
    },
    [reduceMotion, tiltXTarget, tiltYTarget, spotlightX, spotlightY],
  );

  const handlePointerLeave = useCallback(() => {
    tiltXTarget.set(0);
    tiltYTarget.set(0);
    setHovered(false);
  }, [tiltXTarget, tiltYTarget]);

  const delay = reduceMotion ? 0 : Math.min(index, 5) * 0.07;

  return (
    <motion.article
      ref={cardRef}
      layout={!reduceMotion}
      className={`cc-card ${!isCarnet ? 'cc-card--brand' : ''} ${featured ? 'cc-card--featured' : ''} ${sizeClass} ${expanded ? 'cc-card--open' : ''}`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: ENTRANCE_EASE, delay }}
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={handlePointerLeave}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
    >
      <motion.span
        className="cc-spotlight"
        aria-hidden="true"
        style={{ background: spotlight }}
        animate={{ opacity: hovered && !reduceMotion ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />

      <button className="cc-card-btn" onClick={() => { setExpanded((value) => !value); presentToGuide({ title: card.title, description: card.description }); }} aria-expanded={expanded}>
        <span className="cc-media">
          {card.imageUrl
            ? <img src={card.imageUrl} alt="" loading="lazy" />
            : isCarnet
              ? <span className="cc-media-fallback"><Camera size={26} /></span>
              : <span className="cc-media-fallback cc-media-fallback--brand"><Handshake size={26} /></span>}
          <span className="cc-overlay">
            <span className="cc-badge">{isCarnet ? 'Carnet de projets' : 'Notre expérience'}</span>
            <strong>{card.title}</strong>
            {card.subtitle && <em>{card.subtitle}</em>}
          </span>
        </span>
        <span className="cc-foot">
          <span className="cc-foot-hint">{expanded ? 'Refermer' : 'Voir le détail'}</span>
          <ChevronDown size={16} className={`cc-chevron ${expanded ? 'cc-chevron--up' : ''}`} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            className="cc-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion
              ? { duration: 0 }
              : { height: { type: 'spring', stiffness: 320, damping: 32 }, opacity: { duration: 0.2 } }}
          >
            <div className="cc-detail-inner">
              <p>
                {card.description || (isCarnet ? 'Retrouvez le récit et les photos de ce projet dans le Carnet.' : 'Découvrez notre expérience et les projets liés à cette référence.')}
              </p>
              <Link className="cc-link" to={detailHref}>
                {isCarnet ? 'Découvrir le projet' : 'Découvrir la fiche'}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
