import { motion } from 'motion/react';
import { EASE_SOFT } from '@/site/motion';

/** Landing spot for the site robot in the hero: the robot itself lives in RobotDock and flies here. */
export function HomeRobot({ hint }: { hint: string }) {
  return (
    <div className="s-robot">
      <motion.div
        className="s-robot-stage"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 1.1, ease: EASE_SOFT }}
      >
        <span className="s-robot-halo" aria-hidden="true" />
        <span className="s-robot-ring" aria-hidden="true" />
        <span className="s-robot-ring s-robot-ring--late" aria-hidden="true" />
        <div className="s-robot-anchor" data-robot-anchor="hero" aria-hidden="true" />
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
