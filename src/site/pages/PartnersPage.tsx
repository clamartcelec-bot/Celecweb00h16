import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Handshake, MapPin, Quote, Users } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';
import type { Partner } from '@/site/types';

interface Props {
  t: Copy;
  partners: Partner[];
  onOpen: (partner: Partner) => void;
  onBlockTech: () => void;
}

function PartnerCard({ p, i, onOpen }: { p: Partner; i: number; onOpen: (p: Partner) => void }) {
  const story = p.why_story?.trim();
  const meta = [p.trade, p.locality].filter(Boolean).join(' · ');
  return (
    <motion.button
      className="s-partner-card"
      onClick={() => onOpen(p)}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay: (i % 4) * 0.07 }}
      whileHover={{ y: -6 }}
    >
      <span className="s-partner-logo">
        {p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : p.kind === 'pro' ? <Users size={30} /> : <Handshake size={30} />}
      </span>
      <span className="s-partner-body">
        <strong>{p.name}</strong>
        {meta && <span className="s-partner-meta"><MapPin size={12} /> {meta}</span>}
        {story ? (
          <em className="s-partner-why"><b>Pourquoi ce choix</b>{story}</em>
        ) : (
          p.description && <em>{p.description}</em>
        )}
      </span>
      <ArrowUpRight size={18} className="s-partner-go" />
    </motion.button>
  );
}

export function PartnersPage({ t, partners, onOpen, onBlockTech }: Props) {
  const brands = partners.filter((p) => p.kind !== 'pro');
  const pros = partners.filter((p) => p.kind === 'pro');
  const withStory = useMemo(() => partners.filter((p) => p.why_story?.trim()), [partners]);
  const [focusIndex] = useState(() => Math.floor(Math.random() * 1000));
  const focus = withStory.length > 0 ? withStory[focusIndex % withStory.length] : null;

  return (
    <div className="s-page">
      <PageIntro
        eyebrow={<><Handshake size={14} /> CELEC</>}
        title={t.partnersTitle}
        lead="Des marques et des professionnels du coin que nous recommandons librement. Rien d’imposé : on vous explique simplement pourquoi nous les avons choisis."
      />

      {focus && (
        <motion.section className="s-focus" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}>
          <span className="s-focus-tag">Focus sur…</span>
          <div className="s-focus-grid">
            <span className="s-focus-logo">
              {focus.logo_url ? <img src={focus.logo_url} alt="" /> : <Handshake size={36} />}
            </span>
            <div className="s-focus-copy">
              <h2>{focus.name}</h2>
              {(focus.trade || focus.locality) && <span className="s-partner-meta"><MapPin size={12} /> {[focus.trade, focus.locality].filter(Boolean).join(' · ')}</span>}
              <blockquote><Quote size={18} />{focus.why_story}</blockquote>
              <button className="s-link" onClick={() => onOpen(focus)}>Voir la fiche <ArrowRight size={14} /></button>
            </div>
          </div>
        </motion.section>
      )}

      <section className="s-psec">
        <h2>Les marques <span>{brands.length}</span></h2>
        {brands.length === 0 ? (
          <p className="s-state">{t.noPartners}</p>
        ) : (
          <div className="s-partner-grid">
            {brands.map((p, i) => <PartnerCard key={p.id} p={p} i={i} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      <section className="s-psec">
        <h2>Les professionnels du coin <span>{pros.length || ''}</span></h2>
        {pros.length === 0 ? (
          <div className="s-empty"><Users size={20} /><p>Les portraits des professionnels avec qui nous travaillons arrivent bientôt.</p></div>
        ) : (
          <div className="s-partner-grid">
            {pros.map((p, i) => <PartnerCard key={p.id} p={p} i={i} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      <section className="s-psec s-bt-aside">
        <div>
          <span className="s-focus-tag">Bureau d’études</span>
          <h2>BlockTech</h2>
          <p>{t.blocktechNote}</p>
        </div>
        <button className="s-btn s-btn--outline" onClick={onBlockTech}>Découvrir BlockTech <ArrowRight size={15} className="s-btn-arrow" /></button>
      </section>
    </div>
  );
}
