import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Handshake, Lightbulb, Wrench, Zap } from 'lucide-react';
import { IMAGES, type Copy } from '@/site/content';
import { EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SectionHead } from '@/site/components/SectionHead';
import { EntryCard } from '@/site/components/EntryCard';
import { MapExplorer } from '@/site/map/MapExplorer';
import { coverOf, fmtDate, type Partner, type Photo } from '@/site/types';

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 1.6, ease: EASE_SOFT, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{shown}</span>;
}

export function StatsBand({ t, entries, cities, partners }: { t: Copy; entries: number; cities: number; partners: number }) {
  const stats = [
    { value: entries, label: t.statEntries },
    { value: cities, label: t.statCities },
    { value: partners, label: t.statPartners },
  ];
  const words = [...t.services.map((s) => s.title), t.navCarnet, 'BlockTech'];
  return (
    <section className="s-band">
      <motion.div className="s-stats" variants={stagger(0.12)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        {stats.map((s) => (
          <motion.div className="s-stat" key={s.label} variants={fadeUp}>
            <strong><Counter value={s.value} /></strong>
            <span>{s.label}</span>
          </motion.div>
        ))}
      </motion.div>
      <div className="s-marquee" aria-hidden="true">
        <div className="s-marquee-track">
          {[...words, ...words, ...words].map((w, i) => (
            <span key={i}>{w}<em>✦</em></span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CarnetShowcase({ t, photos, onOpen, onSeeAll }: { t: Copy; photos: Photo[]; onOpen: (p: Photo) => void; onSeeAll: () => void }) {
  const entries = photos.filter((p) => coverOf(p)).slice(0, 5);
  if (entries.length === 0) return null;
  return (
    <section className="s-sec" id="carnet-apercu">
      <SectionHead
        index="01"
        title={t.carnetTitle}
        lead={t.carnetLead}
        action={<button className="s-btn s-btn--outline" onClick={onSeeAll}>{t.seeAllCarnet}<ArrowRight size={15} className="s-btn-arrow" /></button>}
      />
      <motion.div className="s-showcase" variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        {entries.map((p, i) => (
          <EntryCard key={p.id} entry={p} className={`s-showcase-${i}`} cta={t.readEntry} onOpen={onOpen} meta={i === 0 ? fmtDate(p.created_at) : undefined} />
        ))}
      </motion.div>
    </section>
  );
}

const SERVICE_ICONS = [Zap, Wrench, Lightbulb];

export function ServicesSection({ t, onBlockTech }: { t: Copy; onBlockTech: () => void }) {
  const methodRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: methodRef, offset: ['start 85%', 'end 55%'] });
  const lineScale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0, 1]);

  return (
    <section className="s-sec s-sec--tint" id="savoir-faire">
      <SectionHead index="02" title={t.servicesTitle} lead={t.servicesLead} />
      <motion.div className="s-services" variants={stagger(0.12)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        {t.services.map((s, i) => {
          const Icon = SERVICE_ICONS[i];
          return (
            <motion.article key={s.title} className="s-service" variants={fadeUp} whileHover="hover">
              <motion.img src={IMAGES.services[i]} alt="" loading="lazy" variants={{ hover: { scale: 1.06 } }} transition={{ duration: 1, ease: EASE_SOFT }} />
              <span className="s-service-shade" />
              <span className="s-service-num">0{i + 1}</span>
              <div className="s-service-body">
                <span className="s-service-icon"><Icon size={18} /></span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </motion.article>
          );
        })}
      </motion.div>

      <div className="s-method" ref={methodRef}>
        <motion.div className="s-method-intro" variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
          <h3>{t.methodTitle}</h3>
          <p>{t.methodText}</p>
        </motion.div>
        <div className="s-method-steps">
          <div className="s-method-rail"><motion.span style={{ scaleX: lineScale }} /></div>
          {t.methodSteps.map((step, i) => (
            <motion.div
              key={step.title}
              className="s-step"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ delay: i * 0.12, duration: 0.8, ease: EASE_SOFT }}
            >
              <span className="s-step-dot">{i + 1}</span>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div className="s-bt-line" variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <p>{t.blocktechNote}</p>
        <button className="s-link" onClick={onBlockTech}>BlockTech <ArrowRight size={14} /></button>
      </motion.div>
    </section>
  );
}

export function MapSection({ t, photos, onOpen, onExpand }: { t: Copy; photos: Photo[]; onOpen: (p: Photo) => void; onExpand: () => void }) {
  return (
    <section className="s-sec s-sec--map" id="carte">
      <SectionHead index="03" title={t.mapTitle} lead={t.mapLead} />
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <MapExplorer t={t} photos={photos} variant="home" onOpen={onOpen} onExpand={onExpand} />
      </motion.div>
    </section>
  );
}

export function PartnersStrip({ t, partners, onOpen, onSeeAll }: { t: Copy; partners: Partner[]; onOpen: (p: Partner) => void; onSeeAll: () => void }) {
  if (partners.length === 0) return null;
  const loop = partners.length < 8 ? [...partners, ...partners, ...partners] : [...partners, ...partners];
  return (
    <section className="s-sec s-sec--partners">
      <SectionHead
        index="04"
        title={t.partnersTitle}
        lead={t.partnersLead}
        action={<button className="s-btn s-btn--outline" onClick={onSeeAll}>{t.seePartners}<ArrowRight size={15} className="s-btn-arrow" /></button>}
      />
      <div className="s-logo-marquee">
        <div className="s-logo-track">
          {loop.map((p, i) => (
            <button key={`${p.id}-${i}`} className="s-logo-tile" onClick={() => onOpen(p)} aria-label={p.name} tabIndex={i < partners.length ? 0 : -1}>
              {p.logo_url ? <img src={p.logo_url} alt="" loading="lazy" /> : <Handshake size={22} />}
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TeamSection({ t }: { t: Copy }) {
  return (
    <section className="s-sec">
      <SectionHead index="05" title={t.teamTitle} lead={t.teamLead} />
      <motion.div className="s-team" variants={stagger(0.12)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        {t.team.map((m) => (
          <motion.article key={m.name} className="s-member" variants={fadeUp} whileHover={{ y: -6 }}>
            <span className="s-member-avatar">{m.name.charAt(0)}</span>
            <h3>{m.name}</h3>
            <span className="s-member-role">{m.role}</span>
            <p>{m.bio}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
