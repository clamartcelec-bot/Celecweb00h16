import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { ArrowUpRight, Camera, MapPin } from 'lucide-react';
import { fadeUp } from '@/site/motion';
import { coverOf, type Photo } from '@/site/types';

/** Photo card with a soft pointer spotlight and parallax image. */
export function EntryCard({
  entry,
  className = '',
  cta,
  onOpen,
  showDescription = false,
  meta,
}: {
  entry: Photo;
  className?: string;
  cta: string;
  onOpen: (entry: Photo) => void;
  showDescription?: boolean;
  meta?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const ix = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 });
  const iy = useSpring(useMotionValue(0), { stiffness: 120, damping: 20 });
  const glow = useMotionTemplate`radial-gradient(420px circle at ${mx}% ${my}%, rgba(255,255,255,.22), transparent 60%)`;
  const cover = coverOf(entry);
  const desc = entry.description ?? '';

  const move = (e: React.PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px * 100);
    my.set(py * 100);
    ix.set((px - 0.5) * -14);
    iy.set((py - 0.5) * -14);
  };

  const leave = () => { ix.set(0); iy.set(0); };

  return (
    <motion.article
      ref={ref}
      className={`s-entry ${className}`}
      variants={fadeUp}
      onPointerMove={move}
      onPointerLeave={leave}
      whileHover="hover"
    >
      <button className="s-entry-hit" aria-label={entry.title} onClick={() => onOpen(entry)} />
      {cover ? (
        <motion.img
          src={cover}
          alt=""
          loading="lazy"
          style={{ x: ix, y: iy }}
          variants={{ hover: { scale: 1.08 } }}
          initial={{ scale: 1.02 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : (
        <span className="s-entry-ph"><Camera size={28} /></span>
      )}
      <motion.span className="s-entry-glow" style={{ background: glow }} />
      <span className="s-entry-shade" />
      <div className="s-entry-body">
        {entry.city && <span className="s-entry-kicker"><MapPin size={11} /> {entry.city}</span>}
        <h3>{entry.title}</h3>
        {showDescription && desc && <p className="s-entry-desc">{desc.length > 110 ? `${desc.slice(0, 110)}…` : desc}</p>}
        {meta && <span className="s-entry-meta">{meta}</span>}
        <span className="s-entry-cta">
          {cta}
          <motion.span className="s-entry-cta-icon" variants={{ hover: { rotate: 45 } }}>
            <ArrowUpRight size={14} />
          </motion.span>
        </span>
      </div>
    </motion.article>
  );
}
