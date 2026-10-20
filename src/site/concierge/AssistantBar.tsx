import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDown, Mic, Send, Volume2, VolumeX } from 'lucide-react';
import type { MotionValue } from 'motion/react';
import type { Lang, Partner, Photo } from '@/site/types';
import type { ConciergeApi, ConciergeTurn } from './useConcierge';
import type { GuideHandlers } from './useRobotGuide';
import { usePressToTalk } from './usePressToTalk';

export type AssistantLevel = 'closed' | 'peek' | 'half' | 'full';

interface Props {
  api: ConciergeApi;
  lang: Lang;
  userName: string | null;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  guide: GuideHandlers;
  guideCursor: { x: MotionValue<number>; y: MotionValue<number>; active: boolean; pressing: boolean };
}

const TAP_HINT = 'Maintenez appuyé, parlez, puis relâchez.';
const NEW_KEY = 'celec-assistant-open';

function TurnCards({ turn, photos, partners, onOpenEntry, onOpenPartner }: { turn: ConciergeTurn } & Pick<Props, 'photos' | 'partners' | 'onOpenEntry' | 'onOpenPartner'>) {
  const entries = (turn.actions ?? []).flatMap((a) => (a.type === 'show_entries' ? a.ids : []))
    .map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => Boolean(p));
  const partner = (turn.actions ?? []).flatMap((a) => (a.type === 'show_partner' ? [a.id] : []))
    .map((id) => partners.find((p) => p.id === id)).find(Boolean);
  if (!entries.length && !partner) return null;
  return (
    <div className="s-ab-cards">
      {entries.map((e) => (
        <button key={e.id} className="s-ab-card" onClick={() => onOpenEntry(e)}>
          {e.image_url && <img src={e.image_url} alt="" loading="lazy" />}
          <span><strong>{e.title}</strong><em>{e.city}</em></span>
        </button>
      ))}
      {partner && (
        <button className="s-ab-card" onClick={() => onOpenPartner(partner)}>
          {partner.logo_url ? <img src={partner.logo_url} alt="" className="is-logo" /> : null}
          <span><strong>{partner.name}</strong><em>Notre choix</em></span>
        </button>
      )}
    </div>
  );
}

export function AssistantBar({ api, userName, photos, partners, onOpenEntry, onOpenPartner }: Omit<Props, 'lang' | 'guide' | 'guideCursor'>) {
  const reduce = Boolean(useReducedMotion());
  const [level, setLevel] = useState<AssistantLevel>('closed');
  const [tapHint, setTapHint] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const openTo = useCallback((l: AssistantLevel) => {
    setLevel(l);
    try { sessionStorage.setItem(NEW_KEY, l); } catch { /* ignore */ }
  }, []);

  const talk = usePressToTalk(api, useCallback(() => {
    // Appui court sur la boule : on informe (maintenir appuyé pour parler) et on ouvre la ligne compressée.
    setTapHint(true);
    window.setTimeout(() => setTapHint(false), 3500);
    if (level === 'closed') openTo('peek');
  }, [level, openTo]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    void api.sendText(value);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [api.turns.length, api.caption]);

  useEffect(() => {
    // La réponse de l'assistant ouvre le panneau en demi-hauteur pour lecture.
    if (api.phase === 'speaking' && level === 'closed') openTo('peek');
  }, [api.phase, level, openTo]);

  const lastAssistant = [...api.turns].reverse().find((x) => x.role === 'assistant');
  const peekText = api.caption?.role === 'assistant' && api.phase !== 'ready'
    ? api.caption.text
    : lastAssistant?.text || '';

  const HEIGHT: Record<AssistantLevel, string> = { closed: '0px', peek: '58px', half: '46dvh', full: '72dvh' };

  return (
    <>
      <div className={`s-ab is-${level} ${api.phase !== 'ready' ? `is-${api.phase}` : ''}`}>
        <AnimatePresence>
          {(level !== 'closed' || tapHint || api.error) && (
            <motion.button
              className="s-ab-grip"
              onClick={() => openTo(level === 'full' ? 'half' : level === 'half' ? 'peek' : 'closed')}
              aria-label={level === 'full' ? 'Réduire' : 'Agrandir'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="s-ab-grip-dot" />
              {level !== 'closed' && <span className="s-ab-grip-label">{level === 'peek' ? peekText.slice(0, 80) || '…' : 'Conversation'}</span>}
              <ArrowDown size={14} className="s-ab-grip-arrow" />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {tapHint && (
            <motion.div
              className="s-ab-tap-hint"
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <Mic size={14} /> {TAP_HINT}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="s-ab-panel"
          initial={false}
          animate={{ height: HEIGHT[level] }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 30 }}
          aria-hidden={level === 'closed'}
        >
          <div className="s-ab-thread" ref={listRef}>
            {api.turns.length === 0 && level !== 'closed' && (
              <p className="s-ab-empty">
                {userName ? `Bonjour ${userName} !` : 'Bonjour !'} Maintenez appuyé sur la boule pour parler, ou écrivez ici.
              </p>
            )}
            {api.turns.map((turn, i) => (
              <div key={turn.id ?? `${turn.at}-${i}`} className={`s-ab-msg is-${turn.role}`}>
                <p>{turn.text || <span className="s-dock-dots" aria-label="En cours"><i /><i /><i /></span>}</p>
                {turn.role === 'assistant' && (
                  <TurnCards turn={turn} photos={photos} partners={partners} onOpenEntry={onOpenEntry} onOpenPartner={onOpenPartner} />
                )}
              </div>
            ))}
            {api.caption?.role === 'assistant' && api.phase !== 'ready' && (
              <div className="s-ab-msg is-assistant is-live"><p>{api.caption.text}</p></div>
            )}
            {api.error && <p className="s-ab-line is-error" role="alert">{api.error}</p>}
          </div>

          <form className="s-ab-compose" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={api.phase === 'listening' ? 'Je vous écoute…' : 'Écrire à l’assistant…'}
              enterKeyHint="send"
              maxLength={1000}
              aria-label="Votre message"
            />
            {text.trim() ? (
              <button type="submit" className="s-ab-send" aria-label="Envoyer"><Send size={16} /></button>
            ) : (
              <span className={`s-ab-hold ${talk.far ? 'is-far' : ''}`} {...talk.handlers} role="button" aria-label="Maintenir appuyé pour parler">
                <Mic size={16} />
              </span>
            )}
          </form>
        </motion.div>
      </div>

      <motion.button
        className={`s-ab-orb is-${api.phase}`}
        aria-label="Assistant CELEC — maintenir appuyé pour parler"
        {...talk.handlers}
      >
        <span className="s-ab-orb-halo" aria-hidden="true" />
        <span className="s-ab-orb-core" aria-hidden="true" />
        <Mic size={18} className="s-ab-orb-icon" />
      </motion.button>

      {api.phase !== 'ready' && (
        <button className="s-ab-mute" onClick={() => api.setMuted(!api.muted)} aria-label={api.muted ? 'Réactiver la voix' : 'Couper la voix'}>
          {api.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
    </>
  );
}

export function AssistantGuideCursor({ x, y, active, pressing }: Props['guideCursor']) {
  return (
    <motion.div
      className={`s-ab-cursor ${active ? 'is-active' : ''} ${pressing ? 'is-pressing' : ''}`}
      style={{ x, y }}
      aria-hidden="true"
    >
      <span className="s-ab-cursor-dot" />
      <AnimatePresence>
        {pressing && (
          <motion.span
            className="s-ab-cursor-ripple"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
