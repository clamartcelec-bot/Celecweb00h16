import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, Mic, X } from 'lucide-react';
import '@/concierge/robot/controller.js';
import type { RobotElement, RobotState } from '@/concierge/robot/controller.js';
import { ConciergeThread } from '@/site/concierge/ConciergeThread';
import { micAlreadyExplained, rememberMicExplained } from '@/site/concierge/useVoiceRecorder';
import type { ConciergeApi, ConciergeContext } from '@/site/concierge/useConcierge';
import { useTalk } from '@/site/concierge/useTalk';
import type { Partner, Photo } from '@/site/types';

interface Props {
  api: ConciergeApi;
  context: () => ConciergeContext;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  onExpand: () => void;
}

const HOLD_MS = 280;
const CANCEL_DISTANCE = 90;

async function micGranted() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export function FloatingRobot({ api, context, photos, partners, onOpenEntry, onOpenPartner, onExpand }: Props) {
  const talk = useTalk(api, context);
  const robot = useRef<RobotElement | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const holding = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const [bubble, setBubble] = useState(false);
  const [explain, setExplain] = useState(false);
  const [panel, setPanel] = useState(false);
  const [drifting, setDrifting] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [tucked, setTucked] = useState(false);

  const mode: RobotState = api.phase === 'recording' ? 'listening' : api.phase === 'thinking' ? 'thinking' : api.phase === 'speaking' ? 'speaking' : api.error ? 'error' : 'idle';

  useEffect(() => { robot.current?.setState(mode); }, [mode]);
  useEffect(() => { robot.current?.setAmplitude(talk.recording ? talk.level : api.phase === 'speaking' ? 0.45 : 0); }, [talk.level, talk.recording, api.phase]);
  useEffect(() => { if (api.pending || api.error) setPanel(true); }, [api.pending, api.error]);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      setKeyboard(Boolean(el.matches?.('input, textarea, select') && !el.closest('.s-bot')));
    };
    const onBlur = () => setKeyboard(false);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); };
  }, []);

  useEffect(() => {
    let io: IntersectionObserver | null = null;
    const timer = window.setTimeout(() => {
      const target = document.getElementById('contact-box');
      if (!target) { setTucked(false); return; }
      io = new IntersectionObserver(([entry]) => setTucked(entry.isIntersecting), { threshold: 0.15 });
      io.observe(target);
    }, 800);
    return () => { window.clearTimeout(timer); io?.disconnect(); };
  }, [context]);

  const showBubble = useCallback(() => {
    setBubble(true);
    void robot.current?.greet();
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(false), 4200);
  }, []);

  const startHold = useCallback(async () => {
    if (!micAlreadyExplained() && !(await micGranted())) {
      holding.current = false;
      setExplain(true);
      return;
    }
    setBubble(false);
    const ok = await talk.begin();
    if (ok && !holding.current) talk.abort();
  }, [talk]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origin.current = { x: e.clientX, y: e.clientY };
    holding.current = true;
    setDrifting(false);
    holdTimer.current = window.setTimeout(() => { holdTimer.current = undefined; void startHold(); }, HOLD_MS);
  };

  const onPointerUp = () => {
    holding.current = false;
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
      if (!talk.recording) showBubble();
      return;
    }
    if (talk.recording) {
      if (drifting) { talk.abort(); api.setError('Enregistrement annulé.'); }
      else void talk.finish();
    }
    setDrifting(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!talk.recording) return;
    setDrifting(Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > CANCEL_DISTANCE);
  };

  const onPointerCancel = () => {
    holding.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    if (talk.recording) talk.abort();
    setDrifting(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && talk.recording) { talk.abort(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.repeat) return;
    if (talk.recording) void talk.finish(); else setPanel(true);
  };

  const allowMic = async () => {
    rememberMicExplained();
    setExplain(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setBubble(true);
      window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => setBubble(false), 4200);
    } catch {
      setPanel(true);
      api.setError('Le micro est bloqué. Autorisez-le dans les réglages du navigateur, ou écrivez-moi.');
    }
  };

  const hint = talk.recording ? (drifting ? 'Relâchez pour annuler' : 'Je vous écoute… relâchez pour envoyer') : 'Bonjour ! Restez appuyé pour me parler.';

  return (
    <div className={`s-bot ${keyboard ? 'is-hidden' : ''} ${tucked && !panel && !talk.recording ? 'is-tucked' : ''}`}>
      <AnimatePresence>
        {panel && (
          <motion.section
            className="s-bot-panel"
            role="dialog"
            aria-label="Conversation avec le robot CELEC"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25 }}
          >
            <header className="s-bot-head">
              <strong>Le majordome CELEC</strong>
              <button onClick={() => { setPanel(false); onExpand(); }} aria-label="Ouvrir en grand" title="Ouvrir en grand"><Maximize2 size={15} /></button>
              <button onClick={() => setPanel(false)} aria-label="Fermer"><X size={16} /></button>
            </header>
            <ConciergeThread
              api={api}
              talk={talk}
              onSendText={(text) => void api.send({ text }, context())}
              photos={photos}
              partners={partners}
              onOpenEntry={onOpenEntry}
              onOpenPartner={onOpenPartner}
              limit={6}
            />
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {explain && (
          <motion.div className="s-bot-bubble s-bot-explain" role="dialog" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <p><Mic size={14} /> Pour me parler, votre navigateur va demander l’accès au micro. Je n’écoute que lorsque vous restez appuyé sur moi.</p>
            <div>
              <button className="s-btn s-btn--primary s-btn--sm" onClick={() => void allowMic()}>Activer le micro</button>
              <button className="s-link s-link--muted" onClick={() => { setExplain(false); setPanel(true); }}>Plutôt écrire</button>
            </div>
          </motion.div>
        )}
        {!explain && !panel && (bubble || talk.recording) && (
          <motion.div className={`s-bot-bubble ${drifting ? 'is-cancel' : ''}`} role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <p>{hint}</p>
            {!talk.recording && <button className="s-link" onClick={() => { setBubble(false); setPanel(true); }}>Ou écrivez-moi</button>}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`s-bot-robot is-${api.phase}`}
        role="button"
        tabIndex={0}
        aria-label="Robot CELEC : restez appuyé pour parler, ou appuyez sur Entrée pour écrire"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        {talk.recording && <span className="s-bot-ring" style={{ transform: `scale(${1 + talk.level * 0.35})` }} />}
        {createElement('robot-majordome', {
          ref: robot,
          class: 's-bot-el',
          label: 'Le petit robot électricien CELEC',
          'auto-blink': '',
          'no-toolbox': '',
          'no-shadow': '',
          'aria-hidden': true,
        })}
      </div>
    </div>
  );
}
