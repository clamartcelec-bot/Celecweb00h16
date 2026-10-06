import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Loader2, MicOff, PencilLine, Phone, PhoneOff, Send } from 'lucide-react';
import type { ConnectionStatus } from '@/concierge/hooks/useRealtimeSession';
import { useGuidePlacement } from './useGuidePlacement';

interface Props {
  robot: ReactNode; page: string; embedded: boolean; presenting: boolean; engaged: boolean;
  status: ConnectionStatus; phrase: string; muted: boolean; speaking: boolean;
  responding: boolean; duration: string; preview: boolean; available: boolean;
  text: string; onText: (value: string) => void; onSend: () => void;
  onActivate: () => void; onEnd: () => void; onMute: () => void; onAcknowledge: () => void;
}

export function LivingGuide({ robot, page, embedded, presenting, engaged, status, phrase, muted, speaking, responding, duration, preview, available, text, onText, onSend, onActivate, onEnd, onMute, onAcknowledge }: Props) {
  const placement = useGuidePlacement(embedded, presenting, page);
  const reduced = useReducedMotion();
  const positioned = useRef(false);
  const viewportRevision = useRef(placement.viewportRevision);
  const animateTravel = positioned.current && placement.ready && viewportRevision.current === placement.viewportRevision;
  useLayoutEffect(() => { if (placement.ready) positioned.current = true; viewportRevision.current = placement.viewportRevision; }, [placement.ready]);
  const [writing, setWriting] = useState(false);
  const connected = status === 'connected';
  const preparing = status === 'connecting' || status === 'requesting-mic';
  const bubbleWidth = window.innerWidth <= 760 ? (engaged || connected || preparing ? 185 : 164) : window.innerWidth <= 1100 ? 228 : 250;
  const desiredBubbleLeft = placement.mode === 'compact' ? -bubbleWidth - 8 : window.innerWidth <= 760 ? 5 : placement.width - bubbleWidth + 28 - placement.progress * 30;
  const sideBubble = placement.mode === 'compact' && placement.y < (window.visualViewport?.height ?? window.innerHeight) / 2;
  const bubbleLeft = Math.max(8 - placement.x, Math.min(desiredBubbleLeft, window.innerWidth - bubbleWidth - 8 - placement.x));
  return <motion.aside className={`ce-guide-free ce-guide-free--${placement.mode} ${engaged || connected || preparing ? 'ce-guide-free--engaged' : ''}`} aria-label="Concierge numérique CELEC" data-placement={placement.mode}
    initial={false} animate={{ x: placement.x, y: placement.y, width: placement.width, opacity: placement.ready && !page.startsWith('/admin') ? 1 : 0 }}
    transition={reduced || !animateTravel ? { duration: 0 } : { type: 'tween', duration: .22, ease: 'easeOut' }}>
    {embedded && <div className="ce-guide-bubble" style={{ opacity: placement.mode === 'hero' ? engaged || connected || preparing ? 1 : 1 - smoothFade(placement.progress) : undefined, left: bubbleLeft, right: 'auto', width: bubbleWidth, top: sideBubble ? 0 : undefined, bottom: sideBubble ? 'auto' : 'calc(100% - 7px)' }}>
      <span className="ce-guide-bubble-label">Le concierge numérique · IA</span>
      <p aria-live="polite">{phrase}</p>
      <span className="ce-guide-state">{preparing ? <><Loader2 size={11} className="concierge-spin" /> Connexion en cours</> : connected ? <><span className="ce-guide-live-dot" /> {muted ? 'Micro coupé' : speaking ? 'Je vous réponds' : responding ? 'Je prépare la suite' : 'Je vous écoute'} · {duration}</> : preview && engaged ? 'Démonstration visuelle · sans appel réel' : <><Phone size={11} /> Cliquez sur moi pour échanger</>}</span>
    </div>}
    <motion.button className="ce-guide-character" onClick={onActivate} disabled={preparing || (!available && !connected && !preview)} aria-label={connected ? 'Le concierge vous accompagne' : 'Parler au concierge numérique CELEC'} onPointerEnter={onAcknowledge} onFocus={onAcknowledge} whileHover={reduced ? undefined : { y: -5, rotate: -2 }} whileTap={reduced ? undefined : { scale: 0.97 }}>
      {robot}
    </motion.button>
    <AnimatePresence>
      {embedded && (connected || (preview && engaged)) && <motion.div className="ce-guide-tools" initial={{ opacity: 0, y: reduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        {connected && <><button onClick={() => setWriting(value => !value)} aria-label="Écrire au concierge" aria-expanded={writing} aria-controls="ce-guide-writing"><PencilLine size={15} /></button><button onClick={onMute} aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'} aria-pressed={muted}><MicOff size={15} /></button></>}
        <Link to="/concierge" aria-label="Revenir à la conversation avec le concierge"><ArrowUpRight size={15} /></Link>
        <button onClick={onEnd} className="ce-guide-hangup" aria-label={preview ? 'Terminer la démonstration' : 'Raccrocher'}><PhoneOff size={15} /></button>
      </motion.div>}
    </AnimatePresence>
    <AnimatePresence>
      {embedded && writing && connected && <motion.form id="ce-guide-writing" className="ce-guide-writing" style={sideBubble ? { top: 'calc(100% + 36px)', bottom: 'auto' } : undefined} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onSubmit={event => { event.preventDefault(); onSend(); }}>
        <label htmlFor="ce-guide-message">Écrire au concierge</label>
        <input id="ce-guide-message" autoFocus value={text} onChange={event => onText(event.target.value)} placeholder="Votre message…" />
        <button type="submit" disabled={!text.trim()} aria-label="Envoyer le message"><Send size={16} /></button>
      </motion.form>}
    </AnimatePresence>
  </motion.aside>;
}

function smoothFade(progress: number) { return progress * progress * (3 - 2 * progress); }
