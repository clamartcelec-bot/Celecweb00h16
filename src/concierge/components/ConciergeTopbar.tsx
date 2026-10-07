import { useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, RotateCcw, X } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const RECENT_MAX = 260;

/** The last few sentences being spoken, so the bubble reads like a short, scrolling subtitle. */
function recentSpeech(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= RECENT_MAX) return clean;
  const tail = clean.slice(-RECENT_MAX);
  const boundary = tail.search(/[.!?…]\s+\S/);
  return boundary >= 0 && boundary < RECENT_MAX / 2
    ? tail.slice(boundary + 1).trim()
    : `…${tail.replace(/^\S*\s/, '')}`;
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
  const recent = useMemo(() => recentSpeech(speech), [speech]);
  const live = Boolean(recent);

  return (
    <header className="ct-bar">
      <div className="ct-companion">
        {robot}
        <div className="ct-bubble" data-live={live || undefined} data-speaking={speaking || undefined} aria-live="polite">
          <span className="ct-bubble-tail" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={live ? 'speech' : `l-${statusLabel}`}
              className={live ? 'ct-bubble-text' : 'ct-bubble-status'}
              data-long={recent.length > 150 || undefined}
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <p>{live ? recent : statusLabel}</p>
            </motion.div>
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
