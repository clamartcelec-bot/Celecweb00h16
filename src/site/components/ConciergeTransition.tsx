import { createElement, useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import '@/concierge/robot/controller.js';
import { EASE_SOFT } from '@/site/motion';

const ROBOT_RATIO = 458 / 552;
const DURATION_MS = 2150;

interface ConciergeTransitionProps {
  origin: { x: number; y: number };
  label: string;
  cancelLabel: string;
  onDone: () => void;
  onCancel: () => void;
}

/** Lays a light grey veil over the site, then glides the robot to its seat at the top-left. */
export function ConciergeTransition({ origin, label, cancelLabel, onDone, onCancel }: ConciergeTransitionProps) {
  const reduce = useReducedMotion();

  const path = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw <= 600;
    const startW = Math.min(vw * 0.46, 240);
    const endW = mobile ? 92 : 132;
    return {
      start: { left: vw / 2 - startW / 2, top: vh / 2 - (startW * ROBOT_RATIO) / 2 - 36, width: startW },
      end: { left: mobile ? 10 : 18, top: mobile ? 8 : 12, width: endW },
    };
  }, []);

  const callbacks = useRef({ onDone, onCancel });
  callbacks.current = { onDone, onCancel };

  useEffect(() => {
    const timer = window.setTimeout(() => callbacks.current.onDone(), reduce ? 400 : DURATION_MS);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') callbacks.current.onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [reduce]);

  const { start, end } = path;

  return (
    <motion.div
      className="s-portal"
      initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }}
      animate={{ clipPath: `circle(150vmax at ${origin.x}px ${origin.y}px)` }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0.2 : 0.7, ease: EASE_SOFT } }}
      transition={{ duration: reduce ? 0 : 0.9, ease: EASE_SOFT }}
      aria-live="polite"
      onClick={onCancel}
    >
      <span className="s-portal-aura s-portal-aura--rose" aria-hidden="true" />

      <motion.button
        type="button"
        className="s-portal-cancel"
        onClick={(event) => { event.stopPropagation(); onCancel(); }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.25, duration: 0.4, ease: EASE_SOFT }}
        whileTap={{ scale: 0.94 }}
      >
        <X size={15} />
        {cancelLabel}
      </motion.button>

      <motion.div
        className="s-portal-robot"
        initial={{ opacity: 0, left: start.left, top: start.top + 30, width: start.width, scale: 0.85 }}
        animate={{
          opacity: [0, 1, 1],
          left: [start.left, start.left, end.left],
          top: [start.top + 30, start.top, end.top],
          width: [start.width, start.width, end.width],
          scale: [0.85, 1, 1],
        }}
        transition={{ duration: reduce ? 0 : 1.75, delay: reduce ? 0 : 0.2, times: [0, 0.42, 1], ease: [EASE_SOFT, EASE_SOFT] }}
      >
        <span className="s-portal-halo" aria-hidden="true" />
        {createElement('robot-majordome', { class: 's-portal-robot-el', state: 'thinking', 'auto-blink': '', 'no-toolbox': '', 'no-shadow': '', 'aria-hidden': true })}
      </motion.div>

      <motion.p
        className="s-portal-label"
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -8], filter: ['blur(6px)', 'blur(0px)', 'blur(0px)', 'blur(6px)'] }}
        transition={{ duration: reduce ? 0 : 1.6, delay: reduce ? 0 : 0.4, times: [0, 0.3, 0.7, 1] }}
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
