import type { Transition, Variants } from 'motion/react';

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_SOFT: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE_OUT } },
};

export const stagger = (step = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const viewportOnce = { once: true, margin: '0px 0px -12% 0px' } as const;
