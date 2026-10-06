import { createElement, useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import '@/concierge/robot/controller.js';
import type { RobotElement } from '@/concierge/robot/controller.js';
import { GUIDE_CONTEXT_EVENT, type GuideContext } from './events';

export function GuideRobot({ className = '' }: { className?: string }) {
  const robot = useRef<RobotElement | null>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const node = robot.current;
    if (!node) return;
    const welcome = window.setTimeout(() => { if (!reducedMotion) void node.greet(); }, 900);
    const react = (event: Event) => {
      const { prompt } = (event as CustomEvent<GuideContext>).detail;
      if (document.activeElement instanceof HTMLElement) node.lookAtElement(document.activeElement);
      if (!reducedMotion) { if (prompt) void node.hands(); else void node.nod(); }
    };
    window.addEventListener(GUIDE_CONTEXT_EVENT, react);
    return () => { window.clearTimeout(welcome); window.removeEventListener(GUIDE_CONTEXT_EVENT, react); };
  }, [reducedMotion]);
  return createElement('robot-majordome', {
    ref: robot, class: `guide-robot ${className}`, label: 'Le concierge numérique CELEC',
    'auto-blink': '', 'follow-pointer': reducedMotion ? undefined : '',
    still: reducedMotion ? '' : undefined, 'no-toolbox': '', 'no-shadow': '', 'aria-hidden': true,
  });
}
