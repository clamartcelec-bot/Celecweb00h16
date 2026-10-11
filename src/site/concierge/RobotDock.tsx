import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { AlertCircle, MessageSquareText, Mic, Volume2, VolumeX, X } from 'lucide-react';
import '@/concierge/robot/controller.js';
import type { RobotElement } from '@/concierge/robot/controller.js';
import type { Lang, Partner, Photo } from '@/site/types';
import type { ConciergeApi } from './useConcierge';
import { ConciergeStage } from './ConciergeStage';
import { usePressToTalk } from './usePressToTalk';
import { dockLines, HOLD_HINT } from './dockLines';

interface Props {
  api: ConciergeApi;
  lang: Lang;
  page: string;
  userName: string | null;
  chatOpen: boolean;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  onOpenChat: () => void;
}

const RATIO = 458 / 552;
const HEADER = 72;

interface Target { key: string; x: number; y: number; w: number; align: 'start' | 'center' | 'end' }

function measure(): Target {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-robot-anchor]'))
    .sort((a, b) => Number(b.dataset.robotAnchor === 'chat') - Number(a.dataset.robotAnchor === 'chat'));
  let t: Omit<Target, 'align'> | null = null;
  for (const a of anchors) {
    const r = a.getBoundingClientRect();
    if (!r.width) continue;
    const mid = r.top + (r.width * RATIO) / 2;
    if (mid > HEADER && mid < vh - 40) {
      t = { key: a.dataset.robotAnchor ?? 'anchor', x: r.left, y: r.top, w: r.width };
      break;
    }
  }
  if (!t) {
    const small = vw < 640;
    const w = small ? 88 : 116;
    const gap = small ? 12 : 24;
    t = { key: 'corner', x: vw - w - gap, y: vh - w * RATIO - gap, w };
  }
  const bubble = Math.min(300, vw - 24);
  const align = t.x + t.w >= bubble + 12 ? 'end' : vw - t.x >= bubble + 12 ? 'start' : 'center';
  return { ...t, align };
}

const ROBOT_STATE = { ready: 'idle', connecting: 'thinking', listening: 'listening', thinking: 'thinking', speaking: 'speaking' } as const;

export function RobotDock({ api, lang, page, userName, chatOpen, photos, partners, onOpenEntry, onOpenPartner, onOpenChat }: Props) {
  const reduce = useReducedMotion();
  const robot = useRef<RobotElement | null>(null);
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const w = useMotionValue(116);
  const current = useRef<Target | null>(null);
  const flying = useRef(false);
  const [spot, setSpot] = useState<{ key: string; align: Target['align'] }>({ key: 'corner', align: 'end' });
  const [menu, setMenu] = useState(false);
  const [invite, setInvite] = useState(true);
  const [lineIndex, setLineIndex] = useState(0);
  const [peek, setPeek] = useState(false);
  const { lines, chips } = dockLines(lang, chatOpen ? 'concierge' : page, userName);
  const talk = usePressToTalk(api, useCallback(() => {
    if (api.phase === 'speaking' || api.phase === 'thinking') api.stopSpeaking();
    else setMenu((m) => !m);
  }, [api]));

  const place = useCallback(() => {
    const t = measure();
    const prev = current.current;
    current.current = t;
    if (!prev || reduce) {
      x.set(t.x); y.set(t.y); w.set(t.w);
    } else if (prev.key !== t.key || flying.current) {
      flying.current = true;
      const spring = { type: 'spring', stiffness: 90, damping: 17, mass: 1 } as const;
      animate(x, t.x, spring);
      animate(w, t.w, spring);
      void animate(y, t.y, spring).then(() => {
        if (current.current === t) flying.current = false;
      });
      if (prev.key !== t.key) void robot.current?.wiggleAntenna?.();
    } else {
      x.set(t.x); y.set(t.y); w.set(t.w);
    }
    setSpot((s) => (s.key === t.key && s.align === t.align ? s : { key: t.key, align: t.align }));
  }, [reduce, w, x, y]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const tick = window.setInterval(place, 250);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(tick);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [place]);

  useEffect(() => {
    setMenu(false);
    setInvite(true);
    setLineIndex(0);
    const t = window.setTimeout(() => void robot.current?.greet?.(), 700);
    return () => window.clearTimeout(t);
  }, [page, chatOpen]);

  const idle = api.phase === 'ready' && !api.caption && !api.error;
  const anchored = spot.key !== 'corner';

  useEffect(() => {
    if (!idle || menu) return;
    if (!invite) {
      const again = window.setTimeout(() => { setInvite(true); setLineIndex((n) => n + 1); }, 40_000);
      return () => window.clearTimeout(again);
    }
    const next = window.setTimeout(() => {
      if (anchored) setLineIndex((n) => n + 1);
      else setInvite(false);
    }, 7_000);
    return () => window.clearTimeout(next);
  }, [idle, invite, menu, anchored, lineIndex]);

  useEffect(() => {
    if (api.phase !== 'ready' || !api.caption) return;
    const t = window.setTimeout(api.clearCaption, 9_000);
    return () => window.clearTimeout(t);
  }, [api.phase, api.caption, api.clearCaption]);

  useEffect(() => {
    robot.current?.setState(ROBOT_STATE[api.phase]);
    if (api.phase !== 'listening' && api.phase !== 'speaking') {
      robot.current?.setAmplitude(0);
      return;
    }
    let frame = 0;
    const loop = () => {
      robot.current?.setAmplitude(Math.min(1, api.level() * 1.4));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [api.phase, api.level]);

  useEffect(() => {
    const onFocus = () => {
      const el = document.activeElement as HTMLElement | null;
      setPeek(Boolean(el?.matches('input, textarea, select') && !el.closest('.s-dock, .s-cxp')));
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, []);

  const line = lines[lineIndex % lines.length];
  let bubble: { tone: string; body: ReactNode } | null = null;
  if (api.error) bubble = { tone: 'error', body: <p><AlertCircle size={15} /> {api.error}</p> };
  else if (talk.far) bubble = { tone: 'error', body: <p>Relâchez pour annuler.</p> };
  else if (api.phase === 'connecting') bubble = { tone: 'live', body: <p>Une seconde, je tends l’oreille…</p> };
  else if (api.phase === 'listening') bubble = { tone: 'live', body: <p><span className="s-dock-rec" /> Je vous écoute… relâchez quand vous avez fini.</p> };
  else if (api.caption) bubble = { tone: api.caption.role === 'user' ? 'user' : 'say', body: <p>{api.caption.text}{api.phase === 'thinking' && <span className="s-dock-dots" aria-hidden="true"><i /><i /><i /></span>}</p> };
  else if (api.phase === 'thinking') bubble = { tone: 'say', body: <p><span className="s-dock-dots" aria-hidden="true"><i /><i /><i /></span></p> };
  else if (menu) bubble = {
    tone: 'menu',
    body: (
      <>
        <p>{line}</p>
        <div className="s-dock-chips">
          {chips.map((c) => (
            <button key={c} onClick={() => { setMenu(false); void api.sendText(c); }}>{c}</button>
          ))}
        </div>
        <div className="s-dock-menu-foot">
          <span><Mic size={13} /> {HOLD_HINT[lang]}</span>
          {!chatOpen && <button onClick={() => { setMenu(false); onOpenChat(); }}><MessageSquareText size={14} /> Écrire</button>}
        </div>
      </>
    ),
  };
  else if (invite && !chatOpen) bubble = { tone: 'invite', body: <><p>{line}</p><small><Mic size={12} /> {HOLD_HINT[lang]}</small></> };

  const showStage = api.stage && !(chatOpen && (api.stage.kind === 'entries' || api.stage.kind === 'partner'));

  return (
    <>
      <motion.div
        className={`s-dock is-${spot.align} ${anchored ? 'is-anchored' : 'is-corner'} ${peek && !anchored ? 'is-peek' : ''}`}
        style={{ x, y, width: w }}
      >
        <AnimatePresence mode="wait">
          {bubble && (
            <motion.div
              key={bubble.tone + (bubble.tone === 'invite' ? lineIndex : '')}
              className={`s-dock-bubble is-${bubble.tone}`}
              role={bubble.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              {bubble.body}
              {(bubble.tone === 'error' || bubble.tone === 'menu' || bubble.tone === 'invite') && (
                <button
                  className="s-dock-bubble-x"
                  aria-label="Fermer"
                  onClick={() => { api.setError(null); setMenu(false); setInvite(false); }}
                >
                  <X size={13} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          className={`s-dock-btn is-${api.phase}`}
          aria-label={HOLD_HINT[lang]}
          aria-expanded={menu}
          {...talk.handlers}
        >
          <span className="s-dock-halo" aria-hidden="true" />
          {createElement('robot-majordome', {
            ref: robot,
            class: 's-dock-el',
            label: 'Le robot CELEC',
            'auto-blink': '',
            'follow-pointer': '',
            'no-toolbox': '',
            'no-shadow': '',
          })}
        </button>

        {api.phase !== 'ready' && (
          <button
            className="s-dock-mute"
            onClick={() => api.setMuted(!api.muted)}
            aria-label={api.muted ? 'Réactiver la voix' : 'Couper la voix'}
          >
            {api.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {showStage && api.stage && (
          <ConciergeStage
            key={JSON.stringify(api.stage).slice(0, 120)}
            api={api}
            stage={api.stage}
            photos={photos}
            partners={partners}
            onOpenEntry={onOpenEntry}
            onOpenPartner={onOpenPartner}
          />
        )}
      </AnimatePresence>
    </>
  );
}
