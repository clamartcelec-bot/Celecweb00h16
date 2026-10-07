import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';

export function PageIntro({ eyebrow, title, lead }: { eyebrow: ReactNode; title: string; lead?: string }) {
  return (
    <header className="s-page-intro">
      <div className="s-aura s-aura--page" aria-hidden="true" />
      <motion.span className="s-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_OUT }}>
        {eyebrow}
      </motion.span>
      <SplitTitle as="h1" className="s-page-title" text={title} accent="." immediate delay={0.1} />
      {lead && (
        <motion.p className="s-page-lead" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.35 }}>
          {lead}
        </motion.p>
      )}
    </header>
  );
}
