import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Eraser, MessageSquarePlus } from 'lucide-react';
import { ConciergeThread } from '@/site/concierge/ConciergeThread';
import type { ConciergeApi } from '@/site/concierge/useConcierge';
import type { Partner, Photo } from '@/site/types';

interface Props {
  api: ConciergeApi;
  photos: Photo[];
  partners: Partner[];
  signedIn: boolean;
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  onClose: () => void;
}

const PHASE_TEXT = {
  ready: 'Restez appuyé sur moi pour parler, ou écrivez à droite.',
  connecting: 'Une seconde…',
  listening: 'Je vous écoute. Relâchez quand vous avez fini.',
  thinking: 'Je cherche la meilleure réponse…',
  speaking: 'Touchez-moi pour m’interrompre.',
} as const;

export function ConciergeChat({ api, photos, partners, signedIn, onOpenEntry, onOpenPartner, onClose }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const listening = api.phase === 'listening';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !listening) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, listening]);

  return (
    <motion.div
      className="s-cxp"
      role="dialog"
      aria-modal="true"
      aria-label="Conversation avec le robot CELEC"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="s-cxp-top">
        <button className="s-btn s-btn--ghost s-btn--sm" onClick={onClose}><ArrowLeft size={15} /> Retour au site</button>
        <div className="s-cxp-tools">
          <button className="s-btn s-btn--ghost s-btn--sm" onClick={() => void api.newConversation()} disabled={!api.turns.length}>
            <MessageSquarePlus size={15} /> Nouvelle conversation
          </button>
          {confirmClear ? (
            <span className="s-cxp-confirm">
              Tout effacer{signedIn ? ' sur tous vos appareils' : ''} ?
              <button className="s-btn s-btn--primary s-btn--sm" onClick={() => { setConfirmClear(false); void api.clearHistory(); }}>Effacer</button>
              <button className="s-link s-link--muted" onClick={() => setConfirmClear(false)}>Annuler</button>
            </span>
          ) : (
            <button className="s-btn s-btn--ghost s-btn--sm" onClick={() => setConfirmClear(true)}><Eraser size={15} /> Effacer mon historique</button>
          )}
        </div>
      </header>

      <div className="s-cxp-body">
        <aside className="s-cxp-robot">
          <div className="s-cxp-spot">
            <span className={`s-cxp-glow is-${api.phase}`} aria-hidden="true" />
            <div className="s-cxp-anchor" data-robot-anchor="chat" aria-hidden="true" />
          </div>
          <p aria-live="polite">{PHASE_TEXT[api.phase]}</p>
          <small>Votre conversation est conservée 90 jours{signedIn ? ' et retrouvée sur vos autres appareils' : ' sur cet appareil'}.</small>
        </aside>
        <ConciergeThread
          api={api}
          photos={photos}
          partners={partners}
          onOpenEntry={onOpenEntry}
          onOpenPartner={onOpenPartner}
        />
      </div>
    </motion.div>
  );
}
