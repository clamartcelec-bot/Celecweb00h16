import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardList,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareText,
  Paperclip,
  Phone,
  Send,
  User,
  X,
} from 'lucide-react';
import { CATEGORY_LABELS, URGENCY_LABELS, type ConciergeDraft } from '../types';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function formatPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 12).replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function hasValidPhone(value: string) {
  return value.replace(/\D/g, '').length >= 8;
}

interface Slot {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
  required?: boolean;
  wide?: boolean;
}

interface RequestPanelProps {
  draft: ConciergeDraft;
  submissionState: 'idle' | 'sending' | 'sent' | 'error';
  uploading: boolean;
  uploadError: string | null;
  onFilePick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (url: string) => void;
  onSubmit: () => void;
  onExit?: () => void;
}

export function RequestPanel({
  draft,
  submissionState,
  uploading,
  uploadError,
  onFilePick,
  onRemoveAttachment,
  onSubmit,
  onExit,
}: RequestPanelProps) {
  const sent = submissionState === 'sent';
  const sending = submissionState === 'sending';
  const phoneOk = hasValidPhone(draft.phone);
  const canSend = phoneOk && !sending;

  const slots: Slot[] = [
    { key: 'phone', label: 'Téléphone', value: phoneOk ? formatPhone(draft.phone) : '', icon: <Phone size={14} />, required: true },
    { key: 'summary', label: 'Objet', value: draft.summary.trim(), icon: <MessageSquareText size={14} />, wide: true },
    { key: 'name', label: 'Nom', value: draft.lastName.trim() || draft.firstName.trim(), icon: <User size={14} /> },
    { key: 'location', label: 'Adresse', value: draft.location.trim(), icon: <MapPin size={14} /> },
  ];
  if (draft.category) slots.push({ key: 'category', label: 'Type', value: CATEGORY_LABELS[draft.category], icon: <ClipboardList size={14} /> });
  if (draft.urgency) slots.push({ key: 'urgency', label: 'Priorité', value: URGENCY_LABELS[draft.urgency], icon: <AlertTriangle size={14} /> });
  if (draft.availability) slots.push({ key: 'availability', label: 'Disponibilités', value: draft.availability, icon: <CalendarClock size={14} />, wide: true });

  const filled = slots.slice(0, 3).filter((slot) => slot.value).length;
  const latest = useLatestFilled(slots);

  return (
    <motion.section
      className="cq"
      data-sent={sent || undefined}
      aria-label="Demande de rappel"
      aria-live="polite"
      layout
      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <header className="cq-head">
        <span className="cq-head-icon"><Phone size={14} /></span>
        <h2 className="cq-title">Être rappelé</h2>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={sent ? 'sent' : `n-${filled}`}
            className={`cq-status ${sent ? 'cq-status--sent' : ''}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            {sent ? <><CheckCircle2 size={12} /> Transmise à l’équipe</> : `${filled}/3 noté${filled > 1 ? 's' : ''}`}
          </motion.span>
        </AnimatePresence>
      </header>

      <LayoutGroup id="cq">
        <ul className="cq-slots">
          {slots.map((slot) => (
            <motion.li
              key={slot.key}
              layout
              className={`cq-slot ${slot.wide ? 'cq-slot--wide' : ''}`}
              data-filled={slot.value ? true : undefined}
              data-required={slot.required && !slot.value ? true : undefined}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <span className="cq-slot-icon">{slot.value ? <CheckCircle2 size={14} /> : slot.icon}</span>
              <span className="cq-slot-text">
                <span className="cq-slot-label">{slot.label}</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={slot.value || 'empty'}
                    className={`cq-slot-value ${slot.key === 'phone' ? 'cq-slot-value--phone' : ''}`}
                    initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    {slot.value || (slot.required ? 'À noter' : 'Facultatif')}
                  </motion.span>
                </AnimatePresence>
              </span>
              {latest === slot.key && (
                <motion.span
                  layoutId="cq-frame"
                  className="cq-frame"
                  initial={{ opacity: 0, scale: 1.08 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                  aria-hidden="true"
                />
              )}
            </motion.li>
          ))}
        </ul>
      </LayoutGroup>

      {draft.attachments.length > 0 && (
        <ul className="cq-files">
          {draft.attachments.map((url) => (
            <li key={url}>
              <Camera size={12} />
              <span>{url.split('/').pop()}</span>
              <button type="button" onClick={() => onRemoveAttachment(url)} aria-label="Retirer le fichier">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(uploadError || submissionState === 'error') && (
        <p className="cq-error">{uploadError || 'L’envoi a échoué. Réessayez dans quelques instants.'}</p>
      )}

      <footer className="cq-foot">
        <label className="cq-btn cq-btn--ghost" title="Ajouter une photo ou une vidéo">
          {uploading ? <Loader2 size={14} className="concierge-spin" /> : <Paperclip size={14} />}
          <span className="cq-btn-label">Photo</span>
          <input type="file" accept="image/*,video/*" onChange={onFilePick} hidden />
        </label>
        {onExit && (
          <button type="button" className="cq-btn cq-btn--ghost" onClick={onExit} title="Revenir aux questions">
            <LogOut size={14} />
            <span className="cq-btn-label">Plus tard</span>
          </button>
        )}
        <span className="cq-hint">
          {draft.nextStep || (phoneOk ? 'Prêt à transmettre.' : 'Votre numéro suffit pour être rappelé.')}
        </span>
        <motion.button
          type="button"
          className={`cq-btn cq-btn--send ${phoneOk ? 'cq-btn--ready' : ''}`}
          onClick={onSubmit}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.96 } : undefined}
        >
          {sending ? <Loader2 size={14} className="concierge-spin" /> : sent ? <CheckCircle2 size={14} /> : <Send size={14} />}
          {sending ? 'Envoi…' : sent ? 'Renvoyer' : 'Envoyer'}
        </motion.button>
      </footer>
    </motion.section>
  );
}

/** Key of the slot that was filled or changed most recently, so the red frame snaps onto it. */
function useLatestFilled(slots: Slot[]) {
  const previous = useRef<Record<string, string>>({});
  const [latest, setLatest] = useState<string | null>(null);
  const signature = slots.map((slot) => `${slot.key}=${slot.value}`).join('|');

  useEffect(() => {
    let changed: string | null = null;
    for (const slot of slots) {
      if (slot.value && previous.current[slot.key] !== slot.value) changed = slot.key;
    }
    previous.current = Object.fromEntries(slots.map((slot) => [slot.key, slot.value]));
    if (changed) setLatest(changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return latest;
}
