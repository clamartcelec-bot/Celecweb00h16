import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';

export function SectionHead({ index, title, lead, action }: { index?: string; title: string; lead?: string; action?: ReactNode }) {
  return (
    <div className="s-sec-head">
      <div>
        {index && (
          <motion.span className="s-sec-index" initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={viewportOnce} transition={{ duration: 0.7 }}>
            {index}
          </motion.span>
        )}
        <SplitTitle className="s-sec-title" text={title} accent="." />
        {lead && (
          <motion.p className="s-sec-lead" variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
            {lead}
          </motion.p>
        )}
      </div>
      {action && (
        <motion.div variants={stagger(0, 0.3)} initial="hidden" whileInView="show" viewport={viewportOnce}>
          <motion.div variants={fadeUp}>{action}</motion.div>
        </motion.div>
      )}
    </div>
  );
}
