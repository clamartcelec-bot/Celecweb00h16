import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, MapPin, Phone } from 'lucide-react';
import { IMAGES, type Copy } from '@/site/content';
import { EASE_SOFT, fadeUp, stagger } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';
import { HomeRobot } from '@/site/components/HomeRobot';
import { coverOf, type ContactCategory, type Photo } from '@/site/types';

interface Props {
  t: Copy;
  photos: Photo[];
  onCallback: () => void;
  onSeeWork: () => void;
  onCategory: (category: ContactCategory) => void;
  onMap: () => void;
  onOpenEntry: (entry: Photo) => void;
  onConcierge: (origin: { x: number; y: number }) => void;
}

export function Hero({ t, photos, onCallback, onSeeWork, onCategory, onMap, onOpenEntry, onConcierge }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '14%']);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.04, reduce ? 1.04 : 1.14]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const thumbs = photos.filter((p) => coverOf(p)).slice(0, 3);

  const quick: { label: string; cat: ContactCategory }[] = [
    { label: t.catDepannage, cat: 'depannage' },
    { label: t.catChantier, cat: 'chantier' },
    { label: t.catProjet, cat: 'projet' },
  ];

  return (
    <section className="s-hero" ref={ref}>
      <div className="s-hero-aura" aria-hidden="true">
        <span className="s-aura s-aura--rose" />
        <span className="s-aura s-aura--ion" />
        <span className="s-aura s-aura--sand" />
      </div>

      <motion.div className="s-hero-copy" style={{ y: copyY }} variants={stagger(0.1, 0.25)} initial="hidden" animate="show">
        <motion.span className="s-eyebrow" variants={fadeUp}>
          <span className="s-eyebrow-dot" />
          {t.heroEyebrow}
        </motion.span>
        <SplitTitle as="h1" className="s-hero-title" text={t.heroTitle} accent="CELEC." immediate delay={0.35} />
        <motion.p className="s-hero-sub" variants={fadeUp}>{t.heroSub}</motion.p>
        <motion.div className="s-hero-ctas" variants={fadeUp}>
          <motion.button className="s-btn s-btn--primary" onClick={onCallback} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <span className="s-btn-icon"><Phone size={16} /></span>
            {t.ctaCallback}
            <ArrowRight size={16} className="s-btn-arrow" />
          </motion.button>
          <motion.button className="s-btn s-btn--ghost" onClick={onSeeWork} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            {t.ctaWork}
            <ArrowRight size={16} className="s-btn-arrow" />
          </motion.button>
        </motion.div>
        <motion.div className="s-hero-quick" variants={fadeUp}>
          {quick.map((q) => (
            <button key={q.cat} className="s-quick" onClick={() => onCategory(q.cat)}>
              {q.label}
              <ArrowRight size={13} />
            </button>
          ))}
        </motion.div>
      </motion.div>

      <div className="s-hero-visual">
        <motion.div
          className="s-hero-frame"
          initial={{ clipPath: 'inset(12% 8% 12% 8% round 40px)', opacity: 0 }}
          animate={{ clipPath: 'inset(0% 0% 0% 0% round 40px)', opacity: 1 }}
          transition={{ duration: 1.5, ease: EASE_SOFT, delay: 0.15 }}
        >
          <motion.img src={IMAGES.hero} alt="" style={{ y: imageY, scale: imageScale }} />
          <span className="s-hero-frame-shade" />
        </motion.div>

        <motion.button
          className="s-float-chip s-float-chip--map"
          onClick={onMap}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.3, duration: 0.8, ease: EASE_SOFT }}
          whileHover={{ y: -3 }}
        >
          <span className="s-float-chip-icon"><MapPin size={14} /></span>
          {t.mapChip}
          <ArrowRight size={13} />
        </motion.button>

        {thumbs.length > 0 && (
          <div className="s-hero-thumbs">
            <svg className="s-hero-thread" viewBox="0 0 120 300" preserveAspectRatio="none" aria-hidden="true">
              <motion.path
                d="M10 0 C 90 60, 20 120, 90 160 S 30 260, 100 300"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.6, duration: 1.8, ease: 'easeInOut' }}
              />
            </svg>
            {thumbs.map((p, i) => (
              <motion.button
                key={p.id}
                className="s-hero-thumb"
                onClick={() => onOpenEntry(p)}
                initial={{ opacity: 0, scale: 0.6, rotate: i % 2 ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 3 : -3 }}
                transition={{ delay: 1.7 + i * 0.18, type: 'spring', stiffness: 200, damping: 16 }}
                whileHover={{ scale: 1.08, rotate: 0, zIndex: 3 }}
                aria-label={p.title}
              >
                <img src={coverOf(p)} alt="" loading="lazy" />
                <ArrowUpRight size={12} className="s-hero-thumb-go" />
              </motion.button>
            ))}
          </div>
        )}

        <HomeRobot lines={t.robotLines} cta={t.robotCta} hint={t.robotHint} onEnter={onConcierge} />
      </div>

      <motion.div
        className="s-scroll-cue"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 }}
      >
        <span />
      </motion.div>
    </section>
  );
}
