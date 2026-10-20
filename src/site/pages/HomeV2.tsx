import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useInView } from 'motion/react';
import { ArrowRight, ArrowUpRight, Handshake, MapPin } from 'lucide-react';
import { type Copy } from '@/site/content';
import { EASE_OUT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';
import { FAMILIES, familiesOf, topicsOfFamily } from '@/site/taxonomy';
import { FAMILY_ICONS } from '@/site/components/familyIcons';
import { coverOf, fmtDate, type CityGroup, type Partner, type Photo } from '@/site/types';

interface Props {
  t: Copy;
  photos: Photo[];
  cityGroups: CityGroup[];
  partners: Partner[];
  onCallback: () => void;
  onSeeCarnet: () => void;
  onFamily: (id: string) => void;
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  onSeePartners: () => void;
}

const CORE = ['electricite', 'confort', 'securite'];

function Counter({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 1.6, ease: EASE_OUT, onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [inView, value]);
  return (
    <div className="s-v2-stat" ref={ref}>
      <strong>{n}</strong>
      <em>{label}</em>
    </div>
  );
}

const HERO_IMGS = [
  'https://images.pexels.com/photos/2255975/pexels-photo-2255975.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/8005358/pexels-photo-8005358.jpeg?auto=compress&cs=tinysrgb&w=1200',
];
const HERO_LABELS = ['Tableau électrique', 'Chantier en cours'];
const DOTS = [
  { x: '12%', y: '18%', c: '#e84a7f' },
  { x: '68%', y: '60%', c: '#2d6cdf' },
];

export function HomeV2({ photos, cityGroups, partners, onCallback, onSeeCarnet, onFamily, onOpenEntry, onOpenPartner, onSeePartners }: Omit<Props, 't'>) {
  const [hero, setHero] = useState(0);
  useEffect(() => {
    const cycle = window.setInterval(() => setHero((n) => (n + 1) % HERO_IMGS.length), 5000);
    return () => window.clearInterval(cycle);
  }, []);

  const entry = photos[0];
  const families = FAMILIES.filter((f) => CORE.includes(f.id));
  const brandPartners = partners.filter((p) => p.kind !== 'pro');

  return (
    <div className="s-v2">
      {/* ——— Bloc titre ——— */}
      <section className="s-v2-hero">
        <motion.div className="s-v2-hero-copy" variants={stagger(0.09)} initial="hidden" animate="show">
          <motion.span className="s-v2-eyebrow" variants={fadeUp}>
            <span className="s-v2-eyebrow-dot" /> Clamart · Hauts-de-Seine
          </motion.span>
          <SplitTitle className="s-v2-title" text="Électricien du bassin" accent="sud parisien." immediate />
          <motion.p className="s-v2-sub" variants={fadeUp}>
            Électricité, confort, sécurité — à Clamart et dans tout le sud parisien.
          </motion.p>
          <motion.div className="s-v2-ctas" variants={fadeUp}>
            <button className="s-btn s-btn--primary" onClick={onCallback}>Demander une intervention <ArrowRight size={15} /></button>
            <button className="s-btn s-btn--ghost" onClick={onSeeCarnet}>Voir le Carnet</button>
          </motion.div>
          <motion.div className="s-v2-stats" variants={fadeUp}>
            <Counter value={cityGroups.length} label="Communes couvertes" />
            <Counter value={photos.length} label="Réalisations au Carnet" />
            <Counter value={partners.length} label="Partenaires" />
          </motion.div>
        </motion.div>
        <motion.div
          className="s-v2-hero-visual"
          initial={{ clipPath: 'inset(8% 8% 8% 8% round 24px)', opacity: 0 }}
          animate={{ clipPath: 'inset(0% 0% 0% 0% round 24px)', opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }}
        >
          <AnimatePresence mode="sync">
            <motion.img
              key={hero}
              src={HERO_IMGS[hero]}
              alt={HERO_LABELS[hero]}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
            />
          </AnimatePresence>
          {DOTS.map((d, i) => (
            <motion.span
              key={i}
              className="s-v2-hero-dot"
              style={{ left: d.x, top: d.y, background: d.c }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.7 + i * 0.25, type: 'spring', stiffness: 300, damping: 18 }}
            />
          ))}
        </motion.div>
      </section>

      {/* ——— Trois familles ——— */}
      <section className="s-v2-sec" id="familles">
        <div className="s-v2-sec-head">
          <span className="s-v2-index">01</span>
          <h2>Nos trois métiers</h2>
        </div>
        <div className="s-v2-fams">
          {families.map((f, i) => {
            const Icon = FAMILY_ICONS[f.id];
            const count = photos.filter((p) => familiesOf(p).includes(f.id as never)).length;
            return (
              <motion.button
                key={f.id}
                className="s-v2-fam"
                style={{ ['--fam' as string]: f.accent }}
                onClick={() => onFamily(f.id)}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.12, duration: 0.7, ease: EASE_OUT }}
                data-robot-target={`family-${f.id}`}
              >
                <span className="s-v2-fam-icon"><Icon size={22} /></span>
                <strong>{f.name}</strong>
                <em>{f.tagline}</em>
                <span className="s-v2-fam-topics">
                  {topicsOfFamily(f.id).filter((tp) => !tp.pending).slice(0, 4).map((tp) => tp.name).join(' · ')}
                </span>
                <span className="s-v2-fam-go">{count} réalisations <ArrowUpRight size={14} /></span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ——— Dernier billet : la photo d'abord ——— */}
      <section className="s-v2-sec">
        <div className="s-v2-sec-head">
          <span className="s-v2-index">02</span>
          <h2>Le Carnet</h2>
          <button className="s-link" onClick={onSeeCarnet}>Voir tout <ArrowUpRight size={13} /></button>
        </div>
        {entry && (
          <motion.button
            className="s-v2-entry"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            onClick={() => onOpenEntry(entry)}
          >
            <span className="s-v2-entry-img">
              {coverOf(entry) && <img src={coverOf(entry)} alt={entry.title} loading="lazy" />}
            </span>
            <span className="s-v2-entry-cap">
              <em><MapPin size={12} /> {entry.city} · {fmtDate(entry.created_at)}</em>
              <strong>{entry.title}</strong>
              {(entry.description || entry.ai_summary) && (
                <small>{(entry.description || entry.ai_summary || '').slice(0, 110)}</small>
              )}
              <span className="s-v2-fam-go">Ouvrir <ArrowUpRight size={14} /></span>
            </span>
          </motion.button>
        )}
      </section>

      {/* ——— Partenaires : bandeau animé, logos cliquables ——— */}
      <section className="s-v2-sec" id="partenaires">
        <div className="s-v2-sec-head">
          <span className="s-v2-index">03</span>
          <h2>Nos partenaires</h2>
          <button className="s-link" onClick={onSeePartners}>Pourquoi eux <ArrowUpRight size={13} /></button>
        </div>
        <p className="s-v2-partners-lead">
          Ce ne sont pas juste des logos : chaque partenaire est choisi pour une raison. Cliquez pour la savoir.
        </p>
        <div className="s-v2-logos">
          <div className="s-v2-logo-track">
            {[...brandPartners, ...brandPartners].map((p, i) => (
              <button
                key={`${p.id}-${i}`}
                className="s-v2-logo-tile"
                onClick={() => onOpenPartner(p)}
                data-robot-target={`partner-${p.id}`}
                aria-label={p.name}
              >
                {p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : <Handshake size={22} />}
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
