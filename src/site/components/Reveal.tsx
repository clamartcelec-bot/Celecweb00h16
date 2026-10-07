import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, fadeUp, stagger, viewportOnce } from '@/site/motion';

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      variants={stagger(0.09, delay)}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={fadeUp}>{children}</motion.div>;
}

/** Display heading whose words rise from a mask, one after the other. */
export function SplitTitle({
  text,
  accent,
  className,
  as = 'h2',
  delay = 0,
  immediate = false,
}: {
  text: string;
  accent?: string;
  className?: string;
  as?: 'h1' | 'h2';
  delay?: number;
  immediate?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = as === 'h1' ? motion.h1 : motion.h2;
  const words = text.split(' ');
  const trigger = immediate
    ? { initial: 'hidden', animate: 'show' }
    : { initial: 'hidden', whileInView: 'show', viewport: viewportOnce };

  return (
    <Tag className={className} variants={stagger(0.06, delay)} {...trigger} aria-label={accent ? `${text} ${accent}` : text}>
      {words.map((word, i) => (
        <span className="s-word" key={`${word}-${i}`} aria-hidden="true">
          <motion.span
            className="s-word-in"
            variants={{
              hidden: reduce ? { opacity: 0 } : { y: '110%', rotate: 4 },
              show: { y: '0%', rotate: 0, opacity: 1, transition: { duration: 1, ease: EASE_OUT } },
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
      {accent && (
        <span className={`s-word ${/^[.,!?]/.test(accent) ? 's-word--tight' : ''}`} aria-hidden="true">
          <motion.span
            className="s-word-in s-accent"
            variants={{
              hidden: reduce ? { opacity: 0 } : { y: '110%', rotate: 4 },
              show: { y: '0%', rotate: 0, opacity: 1, transition: { duration: 1, ease: EASE_OUT } },
            }}
          >
            {accent}
          </motion.span>
        </span>
      )}
    </Tag>
  );
}
