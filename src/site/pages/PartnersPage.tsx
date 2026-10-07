import { motion } from 'motion/react';
import { ArrowUpRight, Handshake } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';
import type { Partner } from '@/site/types';

export function PartnersPage({ t, partners, onOpen }: { t: Copy; partners: Partner[]; onOpen: (partner: Partner) => void }) {
  return (
    <div className="s-page">
      <PageIntro eyebrow={<><Handshake size={14} /> CELEC</>} title={t.partnersTitle} lead={t.partnersLead} />
      {partners.length === 0 ? (
        <p className="s-state">{t.noPartners}</p>
      ) : (
        <div className="s-partner-grid">
          {partners.map((p, i) => (
            <motion.button
              key={p.id}
              className={`s-partner-card ${i % 5 === 0 ? 's-partner-card--lg' : ''}`}
              onClick={() => onOpen(p)}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -8% 0px' }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: (i % 4) * 0.07 }}
              whileHover={{ y: -6 }}
            >
              <span className="s-partner-logo">
                {p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : <Handshake size={30} />}
              </span>
              <span className="s-partner-body">
                <strong>{p.name}</strong>
                {p.description && <em>{p.description}</em>}
              </span>
              <ArrowUpRight size={18} className="s-partner-go" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
