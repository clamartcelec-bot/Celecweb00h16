import { createElement, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Eraser, MessageSquarePlus } from 'lucide-react';
import '@/concierge/robot/controller.js';
import type { RobotElement } from '@/concierge/robot/controller.js';
import { ConciergeThread } from '@/site/concierge/ConciergeThread';
import type { ConciergeApi, ConciergeContext } from '@/site/concierge/useConcierge';
import { useTalk } from '@/site/concierge/useTalk';
import type { Partner, Photo } from '@/site/types';

interface Props {
  api: ConciergeApi;
  context: () => ConciergeContext;
  photos: Photo[];
  partners: Partner[];
  signedIn: boolean;
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  onClose: () => void;
}

export function ConciergeChat({ api, context, photos, partners, signedIn, onOpenEntry, onOpenPartner, onClose }: Props) {
  const talk = useTalk(api, context);
  const robot = useRef<RobotElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    robot.current?.setState(api.phase === 'recording' ? 'listening' : api.phase === 'thinking' ? 'thinking' : api.phase === 'speaking' ? 'speaking' : 'idle');
  }, [api.phase]);
  useEffect(() => { robot.current?.setAmplitude(talk.recording ? talk.level : api.phase === 'speaking' ? 0.45 : 0); }, [talk.level, talk.recording, api.phase]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !talk.recording) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, talk.recording]);

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
          <button
            className={`s-cxp-robot-btn is-${api.phase}`}
            aria-label={talk.recording ? 'Arrêter et envoyer' : 'Parler au robot'}
            aria-pressed={talk.recording}
            onClick={() => (talk.recording ? void talk.finish() : void talk.begin())}
          >
            {createElement('robot-majordome', { ref: robot, class: 's-cxp-robot-el', 'auto-blink': '', 'follow-pointer': '', 'no-toolbox': '', 'no-shadow': '', 'aria-hidden': true })}
          </button>
          <p>{talk.recording ? 'Je vous écoute. Touchez-moi à nouveau pour envoyer.' : 'Touchez le robot ou le micro pour parler, ou écrivez en bas.'}</p>
          <small>Votre conversation est conservée 90 jours{signedIn ? ' et retrouvée sur vos autres appareils' : ' sur cet appareil'}.</small>
        </aside>
        <ConciergeThread
          api={api}
          talk={talk}
          onSendText={(text) => void api.send({ text }, context())}
          photos={photos}
          partners={partners}
          onOpenEntry={onOpenEntry}
          onOpenPartner={onOpenPartner}
          emptyHint="Bonjour ! Je peux vous orienter pour une panne, un projet de travaux, vous montrer nos réalisations ou préparer une demande de rappel."
        />
      </div>
    </motion.div>
  );
}
