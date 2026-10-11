import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView } from 'motion/react';
import { ArrowRight, Handshake } from 'lucide-react';
import type { Copy } from '@/site/content';
import { FAMILIES } from '@/site/taxonomy';
import { EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SectionHead } from '@/site/components/SectionHead';
import { EntryCard } from '@/site/components/EntryCard';
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
  const words = [...FAMILIES.map((f) => f.name), 'Entretien', t.navCarnet];
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
        index="02"
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
