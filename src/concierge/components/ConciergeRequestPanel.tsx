import type { ChangeEvent, ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  LogOut,
  MapPin,
  Paperclip,
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
  const name = draft.lastName.trim() || draft.firstName.trim();
  const phone = formatPhone(draft.phone);
  const phoneOk = hasValidPhone(draft.phone);
  const objective = draft.summary.trim();
  const readyToSend = Boolean(name) && phoneOk && Boolean(objective);
  const canSend = readyToSend && !sending;
  const filled = [Boolean(name), phoneOk, Boolean(objective)].filter(Boolean).length;

  return (
    <motion.aside
      className="concierge-request-panel"
      aria-live="polite"
      initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="concierge-panel-title">
        <span className="concierge-panel-icon"><ClipboardList size={16} /></span>
        <span>Prise de rendez-vous</span>
        {sent && !canSend
          ? <span className="concierge-submit-status concierge-submit-status--sent">Transmise</span>
          : <span className="concierge-panel-count">{filled}/3</span>}
      </div>

      <div className="concierge-progress" aria-hidden="true">
        <motion.span
          className="concierge-progress-fill"
          animate={{ width: `${(filled / 3) * 100}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        />
      </div>

      <div className="concierge-fields">
        <Field label="Nom" value={name} required />
        <Field label="Téléphone" value={phone} ok={phoneOk} required spaced />
        <Field label="Adresse" value={draft.location} />
      </div>

      {(draft.category || draft.siteType || draft.urgency || draft.availability) && (
        <div className="concierge-panel-lines">
          {draft.category && (
            <PanelLine icon={<ClipboardList size={14} />} label="Type" value={CATEGORY_LABELS[draft.category]} />
          )}
          {draft.siteType && <PanelLine icon={<MapPin size={14} />} label="Site" value={draft.siteType} />}
          {draft.urgency && (
            <PanelLine icon={<AlertTriangle size={14} />} label="Priorité" value={URGENCY_LABELS[draft.urgency]} />
          )}
          {draft.availability && (
            <PanelLine icon={<Clock3 size={14} />} label="Disponibilités" value={draft.availability} />
          )}
        </div>
      )}

      <div className="concierge-panel-objective">
        <span className={`concierge-panel-objective-label ${objective ? 'concierge-panel-objective-label--ok' : 'concierge-panel-objective-label--missing'}`}>
          Objet de l’appel
        </span>
        <motion.p key={objective ? 'filled' : 'empty'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={objective ? '' : 'concierge-panel-objective-empty'}>
          {objective || 'À préciser pendant l’échange.'}
        </motion.p>
      </div>

      <div className="concierge-panel-files">
        <label className="concierge-file-btn">
          {uploading ? <Loader2 size={15} className="concierge-spin" /> : <Paperclip size={15} />}
          Ajouter une photo ou une vidéo
          <input type="file" accept="image/*,video/*" onChange={onFilePick} hidden />
        </label>

        {uploadError && <p className="concierge-file-error">{uploadError}</p>}

        {draft.attachments.length > 0 && (
          <ul className="concierge-file-list">
            {draft.attachments.map((url) => (
              <li key={url}>
                <Camera size={13} />
                <span>{url.split('/').pop()}</span>
                <button onClick={() => onRemoveAttachment(url)} aria-label="Retirer le fichier">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft.nextStep && (
        <div className="concierge-panel-next">
          <CheckCircle2 size={15} />
          <span>{draft.nextStep}</span>
        </div>
      )}

      <motion.button
        onClick={onSubmit}
        disabled={!canSend}
        whileTap={canSend ? { scale: 0.97 } : undefined}
        className={`concierge-submit-btn ${readyToSend ? 'concierge-submit-btn--ready' : ''} ${sent && !readyToSend ? 'concierge-submit-btn--sent' : ''}`}
      >
        {sending && <Loader2 size={16} className="concierge-spin" />}
        {sent && !sending && <CheckCircle2 size={16} />}
        {sending ? 'Envoi…' : sent ? 'Renvoyer la demande' : 'Envoyer la demande'}
      </motion.button>

      {onExit && (
        <button onClick={onExit} className="concierge-exit-btn">
          <LogOut size={14} />
          Sortir de la prise de rendez-vous
        </button>
      )}

      {!readyToSend && !sent && (
        <p className="concierge-panel-hint">
          Le nom, le téléphone et l’objet de l’appel sont nécessaires pour envoyer la demande.
        </p>
      )}
      {submissionState === 'error' && (
        <p className="concierge-file-error">L’envoi a échoué. Réessayez dans quelques instants.</p>
      )}
    </motion.aside>
  );
}

function Field({ label, value, ok, required = false, spaced = false }: { label: string; value: string; ok?: boolean; required?: boolean; spaced?: boolean }) {
  const valid = ok ?? Boolean(value);
  const state = valid ? 'concierge-field-value--ok' : required ? 'concierge-field-value--missing' : '';
  return (
    <div className={`concierge-field ${valid ? 'concierge-field--ok' : ''}`}>
      <span className="concierge-field-label">
        {label}
        {valid && <CheckCircle2 size={12} />}
      </span>
      <span className={`concierge-field-value ${spaced ? 'concierge-field-value--spaced' : ''} ${state}`}>
        {value || (required ? 'À préciser' : 'Facultatif')}
      </span>
    </div>
  );
}

function PanelLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={`concierge-panel-line ${value ? 'concierge-panel-line--filled' : ''}`}>
      {icon}
      <span className="concierge-panel-label">{label}</span>
      <span className="concierge-panel-value">{value || 'À préciser'}</span>
    </div>
  );
}
