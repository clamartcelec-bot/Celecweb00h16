import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ChevronDown, History, Mic, MicOff, PhoneOff, Send } from 'lucide-react';
import { useAudioLevels } from '../hooks/useAudioLevels';
import type { ConciergeMessage } from '../types';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Vos horaires',
    prompt: 'Quels sont vos horaires ? À quelle heure fermez-vous ?',
  },
  {
    label: 'Prendre rendez-vous',
    prompt: "Je souhaite prendre rendez-vous avec CELEC. Lance le mode rendez-vous et remplis la fiche avec moi.",
  },
  {
    label: 'Ce que vous faites',
    prompt: "Raconte-moi ce que fait CELEC : dépannage, travaux, projets. Illustre avec un ou deux billets du carnet si c'est pertinent.",
  },
  {
    label: 'Avec qui vous travaillez',
    prompt: "Avec quelles marques et quels partenaires CELEC travaille-t-il ? Présente-les et affiche les fiches correspondantes.",
  },
];

const CALLBACK_PROMPT = 'Je préfère être rappelé plutôt que de continuer à parler. Prenons mes coordonnées.';

interface ActiveViewProps {
  timer: { formatted: string; warningLevel: 'none' | 'approaching' | 'ending' };
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAudioAmplitude: (value: number) => void;
  messages: ConciergeMessage[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  composerText: string;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (text: string) => void;
  onQuickAction: (prompt: string) => void;
  onToggleMute: () => void;
  onEnd: () => void;
}

export function ActiveView({
  timer,
  isMuted,
  isUserSpeaking,
  isAssistantSpeaking,
  localStream,
  remoteStream,
  onAudioAmplitude,
  messages,
  historyOpen,
  onToggleHistory,
  composerText,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onQuickAction,
  onToggleMute,
  onEnd,
}: ActiveViewProps) {
  const { inputLevels } = useAudioLevels(
    isMuted ? null : localStream,
    remoteStream,
    onAudioAmplitude,
  );
  const showQuickPrompts = messages.length <= 1;
  const micLevel = isMuted ? 0 : Math.min(1, inputLevels.reduce((sum, level) => sum + level, 0) / Math.max(1, inputLevels.length) * 2.4);
  const timeline = useSpeechTimeline(isUserSpeaking && !isMuted, isAssistantSpeaking);

  return (
    <div className="concierge-dock-wrap">
      <AnimatePresence>
        {timer.warningLevel === 'ending' && (
          <motion.div
            className="concierge-ending-notice"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <AlertTriangle size={16} />
            La conversation va se terminer
          </motion.div>
        )}
      </AnimatePresence>

      <div className="concierge-dock">
        {messages.length > 0 && (
          <div className="concierge-history">
            <button onClick={onToggleHistory} className="concierge-history-toggle" aria-expanded={historyOpen}>
              <History size={15} />
              Historique de la conversation ({messages.length})
              <ChevronDown size={15} className={`cc-chevron ${historyOpen ? 'cc-chevron--up' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {historyOpen && (
                <motion.div
                  className="concierge-history-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <div className="concierge-history-inner">
                    {messages.map((message) => (
                      <div key={message.id} className={`concierge-bubble concierge-bubble--${message.role}`}>
                        <span className="concierge-bubble-author">{message.role === 'user' ? 'Vous' : 'CELEC'}</span>
                        <p>{message.text}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence initial={false}>
          {showQuickPrompts && (
            <motion.div
              className="concierge-quick-actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {QUICK_PROMPTS.map((action) => (
                <button key={action.label} onClick={() => onQuickAction(action.prompt)} className="concierge-quick-btn">
                  {action.label}
                </button>
              ))}
              <button onClick={() => onQuickAction(CALLBACK_PROMPT)} className="concierge-quick-btn">
                Être rappelé
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="concierge-dock-bar">
          <div className="concierge-composer">
            <textarea
              value={composerText}
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={1}
              placeholder="Écrivez ou parlez…"
              className="concierge-composer-input"
            />
            <motion.button
              onClick={() => onSendMessage(composerText)}
              className="concierge-composer-send"
              disabled={!composerText.trim()}
              aria-label="Envoyer le message"
              whileTap={{ scale: 0.9 }}
            >
              <Send size={17} />
            </motion.button>
          </div>

          <div className="concierge-controls">
            <SpeechTimeline cells={timeline} muted={isMuted} />
            <motion.button
              onClick={onToggleMute}
              style={{ '--mic-level': micLevel } as React.CSSProperties}
              data-speaking={isUserSpeaking && !isMuted ? 'true' : undefined}
              className={`concierge-mic-btn ${isMuted ? 'concierge-mic-btn--muted' : 'concierge-mic-btn--active'}`}
              aria-label={isMuted ? 'Réactiver le micro' : 'Couper le micro'}
              aria-pressed={isMuted}
              whileTap={{ scale: 0.9 }}
            >
              {isMuted ? <MicOff size={19} /> : <Mic size={19} />}
            </motion.button>
            <motion.button onClick={onEnd} className="concierge-end-btn" whileTap={{ scale: 0.95 }}>
              <PhoneOff size={18} />
              Raccrocher
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

type SpeechCell = 'user' | 'celec' | 'quiet';

const TIMELINE_CELLS = 28;
const TIMELINE_STEP_MS = 450;

function useSpeechTimeline(userSpeaking: boolean, assistantSpeaking: boolean) {
  const [cells, setCells] = useState<SpeechCell[]>(() => Array(TIMELINE_CELLS).fill('quiet'));
  const currentRef = useRef<SpeechCell>('quiet');
  currentRef.current = assistantSpeaking ? 'celec' : userSpeaking ? 'user' : 'quiet';

  useEffect(() => {
    const id = window.setInterval(() => {
      setCells((previous) => [...previous.slice(1), currentRef.current]);
    }, TIMELINE_STEP_MS);
    return () => window.clearInterval(id);
  }, []);

  return cells;
}

function SpeechTimeline({ cells, muted }: { cells: SpeechCell[]; muted: boolean }) {
  return (
    <div className={`concierge-timeline ${muted ? 'concierge-timeline--muted' : ''}`} aria-hidden="true" title="Temps de parole : vous en bleu, CELEC en rose">
      {cells.map((cell, index) => (
        <span key={index} className={`concierge-timeline-cell concierge-timeline-cell--${cell}`} />
      ))}
    </div>
  );
}
