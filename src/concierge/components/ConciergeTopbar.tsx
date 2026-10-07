import { useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, RotateCcw, X } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SNIPPET_MAX = 96;

function splitSentences(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  return clean.match(/[^.!?…]+[.!?…]*\s*/g)?.map((part) => part.trim()).filter(Boolean) ?? [clean];
}

/** Only the sentence being spoken right now, trimmed to its last words when long. */
function currentSnippet(text: string) {
  const sentences = splitSentences(text);
  if (!sentences.length) return { key: 0, text: '' };
  let last = sentences[sentences.length - 1];
  if (last.length < 14 && sentences.length > 1) last = `${sentences[sentences.length - 2]} ${last}`;
  if (last.length > SNIPPET_MAX) last = `…${last.slice(-SNIPPET_MAX).replace(/^\S*\s/, '')}`;
  return { key: sentences.length, text: last };
}

interface ConciergeTopbarProps {
  robot: ReactNode;
  speech: string;
  statusLabel: string;
  speaking: boolean;
  timer: { formatted: string; warningLevel: 'none' | 'approaching' | 'ending' } | null;
  ended: boolean;
  onResume: () => void;
  onRestart: () => void;
  onClose: () => void;
}

export function ConciergeTopbar({ robot, speech, statusLabel, speaking, timer, ended, onResume, onRestart, onClose }: ConciergeTopbarProps) {
  const snippet = useMemo(() => currentSnippet(speech), [speech]);
  const live = Boolean(snippet.text);

  return (
    <header className="ct-bar">
      <div className="ct-companion">
        {robot}
        <div className="ct-bubble" data-live={live || undefined} data-speaking={speaking || undefined} aria-live="polite">
          <span className="ct-bubble-tail" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={live ? `s-${snippet.key}` : `l-${statusLabel}`}
              className={live ? 'ct-bubble-text' : 'ct-bubble-status'}
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              {live ? snippet.text : statusLabel}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <div className="ct-actions">
        <AnimatePresence initial={false}>
          {timer && (
            <motion.span
              key="timer"
              className="ct-chip ct-chip--timer"
              data-warn={timer.warningLevel !== 'none' || undefined}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <span className="ct-live-dot" />
              {timer.formatted}
            </motion.span>
          )}
          {ended && (
            <motion.div
              key="ended"
              className="ct-ended"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <button type="button" className="ct-chip ct-chip--action" onClick={onResume} aria-label="Reprendre l’appel">
                <RotateCcw size={13} />
                <span className="ct-chip-label">Reprendre</span>
              </button>
              <button type="button" className="ct-chip" onClick={onRestart} aria-label="Nouvel appel">
                <Plus size={13} />
                <span className="ct-chip-label">Nouvel appel</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          className="ct-close"
          onClick={onClose}
          aria-label="Fermer le concierge"
          whileTap={{ scale: 0.92 }}
        >
          <X size={16} />
        </motion.button>
      </div>
    </header>
  );
}
