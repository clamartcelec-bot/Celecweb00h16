import { createElement, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Mic } from 'lucide-react';
import '@/concierge/robot/controller.js';
import type { RobotElement } from '@/concierge/robot/controller.js';
import { EASE_SOFT } from '@/site/motion';

/** The concierge robot greeting visitors: it "speaks" its lines in a bubble and invites a click. */
export function HomeRobot({
  lines,
  cta,
  hint,
  onEnter,
}: {
  lines: string[];
  cta: string;
  hint: string;
  onEnter: (origin: { x: number; y: number }) => void;
}) {
  const robotRef = useRef<RobotElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const reduce = useReducedMotion();
  const line = lines[lineIndex % lines.length];

  useEffect(() => {
    const robot = robotRef.current;
    if (reduce) { setTyped(line); return; }
    let i = 0;
    let mouth = 0;
    setTyped('');
    robot?.setState('speaking');
    const typer = window.setInterval(() => {
      i += 1;
      setTyped(line.slice(0, i));
      mouth = (mouth + 1) % 4;
      robot?.setAmplitude(line[i - 1] === ' ' ? 0.1 : [0.55, 0.85, 0.35, 0.7][mouth]);
      if (i >= line.length) {
        window.clearInterval(typer);
        robot?.setAmplitude(0);
        robot?.setState('idle');
      }
    }, 42);
    const next = window.setTimeout(() => setLineIndex((n) => n + 1), line.length * 42 + 3200);
    return () => {
      window.clearInterval(typer);
      window.clearTimeout(next);
    };
  }, [line, reduce]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void robotRef.current?.greet(); }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const enter = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    void robotRef.current?.tipHat();
    onEnter(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  return (
    <div className="s-robot">
      <motion.div
        className="s-bubble"
        initial={{ opacity: 0, y: 14, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.1, duration: 0.8, ease: EASE_SOFT }}
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={lineIndex % lines.length}
            className="s-bubble-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            aria-live="polite"
          >
            {renderBrand(typed)}
            <span className="s-caret" aria-hidden="true" />
          </motion.p>
        </AnimatePresence>
        <button className="s-bubble-cta" onClick={enter}>
          <Mic size={14} />
          {cta}
          <ArrowRight size={14} />
        </button>
      </motion.div>

      <motion.div
        ref={wrapRef}
        className="s-robot-stage"
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.6, duration: 1.1, ease: EASE_SOFT }}
      >
        <span className="s-robot-halo" aria-hidden="true" />
        <span className="s-robot-ring" aria-hidden="true" />
        <span className="s-robot-ring s-robot-ring--late" aria-hidden="true" />
        <motion.button
          className="s-robot-btn"
          onClick={enter}
          aria-label={cta}
          whileHover={reduce ? undefined : { scale: 1.04, rotate: -1.5 }}
          whileTap={{ scale: 0.97 }}
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={{ y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' }, default: { type: 'spring', stiffness: 260, damping: 18 } }}
        >
          {createElement('robot-majordome', {
            ref: robotRef,
            class: 's-robot-el',
            label: 'Le concierge CELEC',
            'auto-blink': '',
            'follow-pointer': '',
            'no-toolbox': '',
            'no-shadow': '',
          })}
        </motion.button>
        <span className="s-robot-floor" aria-hidden="true" />
      </motion.div>

      <motion.p
        className="s-robot-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
      >
        <span className="s-live-dot" /> {hint}
      </motion.p>
    </div>
  );
}

function renderBrand(text: string) {
  const at = text.indexOf('CELEC');
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong>CELEC</strong>
      {text.slice(at + 5)}
    </>
  );
}
