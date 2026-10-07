import { motion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Camera, Handshake } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_SOFT } from '@/site/motion';
import { Sheet } from '@/site/components/Sheet';
import { Reviews } from '@/site/components/Reviews';
import { coverOf, fmtDate, type Partner, type Photo } from '@/site/types';

export function BrandSheet({
  t,
  name,
  partner,
  entries,
  userEmail,
  showConciergeReturn,
  onOpenEntry,
  onClose,
}: {
  t: Copy;
  name: string;
  partner: Partner | null;
  entries: Photo[];
  userEmail: string | null;
  showConciergeReturn: boolean;
  onOpenEntry: (entry: Photo) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} label={name} closeLabel={t.close}>
      <div className="s-brand-hero">
        {partner?.logo_url ? (
          <motion.img src={partner.logo_url} alt={name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: EASE_SOFT }} />
        ) : (
          <span className="s-brand-hero-ph"><Handshake size={36} /></span>
        )}
      </div>
      <div className="s-sheet-body">
        {showConciergeReturn && (
          <div className="s-sheet-backs">
            <a className="s-chip-btn s-chip-btn--accent" href="/concierge"><ArrowLeft size={14} /> {t.backToConversation}</a>
          </div>
        )}
        <h2 className="s-sheet-title">{name}</h2>
        <p className={`s-sheet-text ${partner?.description ? '' : 's-muted'}`}>{partner?.description || t.noBrandSheet}</p>

        <div className="s-sheet-block">
          <h3 className="s-sheet-h3"><Camera size={15} /> {t.relatedEntries} ({entries.length})</h3>
          {entries.length === 0 ? (
            <p className="s-muted">{t.noRelated}</p>
          ) : (
            <div className="s-related">
              {entries.map((e, i) => (
                <motion.button
                  key={e.id}
                  className="s-related-item"
                  onClick={() => onOpenEntry(e)}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease: EASE_SOFT }}
                >
                  {coverOf(e) ? <img src={coverOf(e)} alt="" loading="lazy" /> : <span className="s-related-ph"><Camera size={16} /></span>}
                  <span className="s-related-body">
                    <strong>{e.title}</strong>
                    <em>{e.city || 'CELEC'} · {fmtDate(e.created_at)}</em>
                  </span>
                  <ArrowUpRight size={16} className="s-related-go" />
                </motion.button>
              ))}
            </div>
          )}
        </div>

        <Reviews t={t} targetType="partner" targetId={partner?.id ?? null} userEmail={userEmail} autoLoad={Boolean(partner)} />
      </div>
    </Sheet>
  );
}
