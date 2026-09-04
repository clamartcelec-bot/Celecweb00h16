import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { useRealtimeSession, type ToolCall } from '../hooks/useRealtimeSession';
import { useConversationTimer } from '../hooks/useConversationTimer';
import { formatConciergeContext, loadConciergeContext, type ConciergeContext } from '../services/context';
import { submitConciergeLead } from '../services/lead';
import {
  CATEGORY_LABELS,
  EMPTY_CONCIERGE_DRAFT,
  URGENCY_LABELS,
  type ConciergeDraft,
  type RequestCategory,
  type RequestUrgency,
} from '../types';
import '../concierge.css';

const TOPICS: Array<{ label: string; category: RequestCategory }> = [
  { label: "J'ai une panne", category: 'depannage' },
  { label: "J'ai des travaux", category: 'travaux' },
  { label: "J'ai un projet", category: 'projet' },
  { label: 'Je ne sais pas vraiment', category: 'question' },
];

function stringArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === 'string' ? args[key].trim() : undefined;
}

function booleanArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === 'boolean' ? args[key] : undefined;
}

function categoryArg(value: string | undefined): RequestCategory | undefined {
  return value && value in CATEGORY_LABELS ? value as RequestCategory : undefined;
}

function urgencyArg(value: string | undefined): RequestUrgency | undefined {
  return value && value in URGENCY_LABELS ? value as RequestUrgency : undefined;
}

export function ConciergePage() {
  const {
    status,
    error,
    isMuted,
    isUserSpeaking,
    isAssistantSpeaking,
    start,
    stop,
    toggleMute,
    sendFunctionResult,
    onToolCall,
    injectSystemMessage,
    requestResponse,
  } = useRealtimeSession();

  const [draft, setDraft] = useState<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const [clientContext, setClientContext] = useState<ConciergeContext | null>(null);
  const [submissionState, setSubmissionState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const hasInjectedWarningRef = useRef(false);
  const hasStartedGreetingRef = useRef(false);
  const hasSubmittedRef = useRef(false);
  const selectedTopicRef = useRef<string>();
  const draftRef = useRef<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);

  useEffect(() => {
    let active = true;
    loadConciergeContext()
      .then((context) => {
        if (!active || !context) return;
        setClientContext(context);
        setDraft((current) => {
          const next = {
            ...current,
            firstName: current.firstName || context.firstName || '',
            phone: current.phone || context.phone || '',
          };
          draftRef.current = next;
          return next;
        });
      })
      .catch((contextError) => console.warn('Concierge context unavailable:', contextError));
    return () => { active = false; };
  }, []);

  const updateDraft = useCallback((patch: Partial<ConciergeDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      draftRef.current = next;
      return next;
    });
  }, []);

  const handleToolCall = useCallback(async (tool: ToolCall) => {
    const args = tool.arguments;

    if (tool.name === 'update_client_panel') {
      const firstName = stringArg(args, 'first_name');
      const phone = stringArg(args, 'phone');
      updateDraft({
        ...(firstName !== undefined && { firstName }),
        ...(phone !== undefined && { phone }),
      });
      sendFunctionResult(tool.callId, { success: true, message: 'Fiche client mise à jour.' });
      return;
    }

    if (tool.name === 'update_request_panel') {
      const category = categoryArg(stringArg(args, 'category'));
      const summary = stringArg(args, 'summary');
      const siteType = stringArg(args, 'site_type');
      const location = stringArg(args, 'location');
      const urgency = urgencyArg(stringArg(args, 'urgency'));
      const availability = stringArg(args, 'availability');
      const callbackRequested = booleanArg(args, 'callback_requested');
      const photoNeeded = booleanArg(args, 'photo_needed');
      const nextStep = stringArg(args, 'next_step');

      updateDraft({
        ...(category && { category }),
        ...(summary !== undefined && { summary }),
        ...(siteType !== undefined && { siteType }),
        ...(location !== undefined && { location }),
        ...(urgency && { urgency }),
        ...(availability !== undefined && { availability }),
        ...(callbackRequested !== undefined && { callbackRequested }),
        ...(photoNeeded !== undefined && { photoNeeded }),
        ...(nextStep !== undefined && { nextStep }),
      });
      sendFunctionResult(tool.callId, { success: true, message: 'Fiche de demande mise à jour.' });
      return;
    }

    if (tool.name === 'submit_request') {
      if (hasSubmittedRef.current) {
        sendFunctionResult(tool.callId, { success: true, message: 'La demande a déjà été transmise.' });
        return;
      }

      if (booleanArg(args, 'explicit_confirmed') !== true) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'Demande d’abord l’accord explicite du client.',
        });
        return;
      }

      const firstName = stringArg(args, 'first_name');
      const phone = stringArg(args, 'phone');
      const category = categoryArg(stringArg(args, 'category'));
      const summary = stringArg(args, 'summary');
      const siteType = stringArg(args, 'site_type');
      const location = stringArg(args, 'location');
      const urgency = urgencyArg(stringArg(args, 'urgency'));
      const availability = stringArg(args, 'availability');
      const callbackRequested = booleanArg(args, 'callback_requested');
      const nextDraft: ConciergeDraft = {
        ...draftRef.current,
        ...(firstName !== undefined && { firstName }),
        ...(phone !== undefined && { phone }),
        ...(category && { category }),
        ...(summary !== undefined && { summary }),
        ...(siteType !== undefined && { siteType }),
        ...(location !== undefined && { location }),
        ...(urgency && { urgency }),
        ...(availability !== undefined && { availability }),
        ...(callbackRequested !== undefined && { callbackRequested }),
      };

      updateDraft(nextDraft);
      setSubmissionState('sending');

      try {
        const result = await submitConciergeLead(nextDraft);
        hasSubmittedRef.current = true;
        setSubmissionState('sent');
        updateDraft({
          nextStep: result.telegram
            ? 'Demande transmise à l’équipe CELEC'
            : 'Demande enregistrée dans l’espace CELEC',
        });
        sendFunctionResult(tool.callId, {
          success: true,
          saved: true,
          telegram_notified: result.telegram,
          message: result.telegram
            ? 'La demande est enregistrée et transmise à l’équipe CELEC.'
            : 'La demande est enregistrée. La notification Telegram n’a pas pu être confirmée.',
        });
      } catch (submissionError) {
        setSubmissionState('error');
        sendFunctionResult(tool.callId, {
          success: false,
          message: submissionError instanceof Error
            ? submissionError.message
            : 'La transmission a échoué.',
        });
      }
    }
  }, [sendFunctionResult, updateDraft]);

  useEffect(() => {
    onToolCall(handleToolCall);
    return () => onToolCall(null);
  }, [handleToolCall, onToolCall]);

  useEffect(() => {
    if (status !== 'connected') {
      hasStartedGreetingRef.current = false;
      return;
    }
    if (hasStartedGreetingRef.current) return;

    hasStartedGreetingRef.current = true;
    injectSystemMessage(formatConciergeContext(clientContext, selectedTopicRef.current));
    requestResponse();
  }, [clientContext, injectSystemMessage, requestResponse, status]);

  const onApproachingEnd = useCallback(() => {
    if (!hasInjectedWarningRef.current) {
      hasInjectedWarningRef.current = true;
      injectSystemMessage(
        'INSTRUCTION INTERNE : Il reste environ 2 minutes de conversation. Commence à conclure naturellement, résume ce qui a été compris et propose de transmettre la demande.'
      );
    }
  }, [injectSystemMessage]);

  const onCutoff = useCallback(() => stop(), [stop]);
  const timer = useConversationTimer(status === 'connected', onApproachingEnd, onCutoff);

  useEffect(() => {
    if (status !== 'connected') hasInjectedWarningRef.current = false;
  }, [status]);

  const handleStart = (topic?: { label: string; category: RequestCategory }) => {
    selectedTopicRef.current = topic?.label;
    hasSubmittedRef.current = false;
    setSubmissionState('idle');
    const initialDraft: ConciergeDraft = {
      ...EMPTY_CONCIERGE_DRAFT,
      firstName: clientContext?.firstName || '',
      phone: clientContext?.phone || '',
      category: topic?.category || '',
    };
    draftRef.current = initialDraft;
    setDraft(initialDraft);
    start();
  };

  const handleGoBack = () => {
    stop();
    window.location.href = '/';
  };

  return (
    <div className="concierge-page">
      <header className="concierge-header">
        <button onClick={handleGoBack} className="concierge-back" aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <span className="concierge-logo">CELEC</span>
        <div className="concierge-header-spacer" />
      </header>

      <main className="concierge-main">
        {status === 'idle' && <IdleView onStart={handleStart} />}
        {status === 'requesting-mic' && <ConnectingView label="Autorisation du micro..." />}
        {status === 'connecting' && <ConnectingView label="Connexion en cours..." />}
        {status === 'connected' && (
          <div className="concierge-session-layout">
            <ActiveView
              timer={timer}
              isMuted={isMuted}
              isUserSpeaking={isUserSpeaking}
              isAssistantSpeaking={isAssistantSpeaking}
              onToggleMute={toggleMute}
              onEnd={stop}
            />
            <RequestPanel draft={draft} submissionState={submissionState} />
          </div>
        )}
        {status === 'error' && <ErrorView error={error} onRetry={() => handleStart()} />}
        {status === 'ended' && (
          draft.summary ? (
            <div className="concierge-session-layout">
              <EndedView draft={draft} onRestart={() => handleStart()} onBack={handleGoBack} />
              <RequestPanel draft={draft} submissionState={submissionState} />
            </div>
          ) : (
            <EndedView draft={draft} onRestart={() => handleStart()} onBack={handleGoBack} />
          )
        )}
      </main>
    </div>
  );
}

function IdleView({ onStart }: { onStart: (topic?: { label: string; category: RequestCategory }) => void }) {
  return (
    <div className="concierge-idle">
      <div className="concierge-greeting">
        <h1>Bonjour.</h1>
        <p>Comment pouvons-nous vous aider ?</p>
      </div>

      <button onClick={() => onStart()} className="concierge-start-btn">
        <Mic size={24} />
        Parler à CELEC
      </button>

      <div className="concierge-quick-topics">
        {TOPICS.map((topic) => (
          <button key={topic.category} onClick={() => onStart(topic)} className="concierge-topic">
            {topic.label}
          </button>
        ))}
      </div>

      <p className="concierge-disclosure">
        Vous allez parler avec le concierge numérique de CELEC. La conversation peut être retranscrite afin de transmettre correctement votre demande à l'équipe.
      </p>
    </div>
  );
}

function ConnectingView({ label }: { label: string }) {
  return (
    <div className="concierge-connecting">
      <div className="concierge-pulse" />
      <p>{label}</p>
    </div>
  );
}

interface ActiveViewProps {
  timer: { formatted: string; warningLevel: 'none' | 'approaching' | 'ending' };
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}

function ActiveView({ timer, isMuted, isUserSpeaking, isAssistantSpeaking, onToggleMute, onEnd }: ActiveViewProps) {
  return (
    <div className="concierge-active">
      <div className="concierge-status-row">
        <div className="concierge-live-dot" />
        <span>Conversation en cours</span>
        <span className={`concierge-timer ${timer.warningLevel !== 'none' ? 'concierge-timer--warn' : ''}`}>
          {timer.formatted}
        </span>
      </div>

      {timer.warningLevel === 'ending' && (
        <div className="concierge-ending-notice">
          <AlertTriangle size={16} />
          La conversation va se terminer
        </div>
      )}

      <div className="concierge-audio-viz">
        <AudioBars label="VOUS" variant="user" active={isUserSpeaking && !isMuted} />
        <AudioBars label="CELEC" variant="celec" active={isAssistantSpeaking} />
      </div>

      <div className="concierge-controls">
        <button
          onClick={onToggleMute}
          className={`concierge-mic-btn ${isMuted ? '' : 'concierge-mic-btn--active'}`}
          aria-label={isMuted ? 'Réactiver le micro' : 'Couper le micro'}
          aria-pressed={isMuted}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button onClick={onEnd} className="concierge-end-btn">
          <PhoneOff size={20} />
          Terminer
        </button>
      </div>
    </div>
  );
}

function AudioBars({ label, variant, active }: { label: string; variant: 'user' | 'celec'; active: boolean }) {
  return (
    <div className="concierge-viz-column">
      <span className="concierge-viz-label">{label}</span>
      <div className={`concierge-viz-bars ${active ? 'concierge-viz-bars--active' : ''}`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={`concierge-viz-bar concierge-viz-bar--${variant}`}
            style={{ animationDelay: `${index * (variant === 'user' ? 0.1 : 0.12)}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function RequestPanel({
  draft,
  submissionState,
}: {
  draft: ConciergeDraft;
  submissionState: 'idle' | 'sending' | 'sent' | 'error';
}) {
  return (
    <aside className="concierge-request-panel" aria-live="polite">
      <div className="concierge-panel-title">
        <ClipboardList size={18} />
        <span>Votre demande</span>
        {submissionState !== 'idle' && (
          <span className={`concierge-submit-status concierge-submit-status--${submissionState}`}>
            {submissionState === 'sending' && 'Envoi…'}
            {submissionState === 'sent' && 'Transmise'}
            {submissionState === 'error' && 'À réessayer'}
          </span>
        )}
      </div>
      <PanelLine icon={<UserRound size={15} />} label="Prénom" value={draft.firstName} />
      <PanelLine icon={<Phone size={15} />} label="Téléphone" value={draft.phone} />
      <PanelLine
        icon={<ClipboardList size={15} />}
        label="Objet"
        value={draft.category ? CATEGORY_LABELS[draft.category] : ''}
      />
      <PanelLine icon={<Building2 size={15} />} label="Site" value={draft.siteType} />
      <PanelLine icon={<MapPin size={15} />} label="Lieu" value={draft.location} />
      <PanelLine
        icon={<AlertTriangle size={15} />}
        label="Priorité"
        value={draft.urgency ? URGENCY_LABELS[draft.urgency] : ''}
      />
      <PanelLine icon={<Clock3 size={15} />} label="Disponibilités" value={draft.availability} />
      {draft.summary && <p className="concierge-panel-summary">{draft.summary}</p>}
      {draft.nextStep && (
        <div className="concierge-panel-next">
          <CheckCircle2 size={15} />
          <span>{draft.nextStep}</span>
        </div>
      )}
      {draft.photoNeeded && <p className="concierge-panel-photo">Une photo pourra être demandée pour préciser le diagnostic.</p>}
    </aside>
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

function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="concierge-error">
      <MicOff size={48} className="concierge-error-icon" />
      <p className="concierge-error-msg">{error || 'Une erreur est survenue.'}</p>
      <button onClick={onRetry} className="concierge-retry-btn">
        <RotateCcw size={18} />
        Réessayer
      </button>
    </div>
  );
}

function EndedView({ draft, onRestart, onBack }: { draft: ConciergeDraft; onRestart: () => void; onBack: () => void }) {
  return (
    <div className="concierge-ended">
      <h2>Merci pour votre appel.</h2>
      <p>
        {draft.summary
          ? 'Votre fiche reste disponible sur cette page. Vérifiez que la transmission a bien été confirmée pendant l’appel.'
          : "L'équipe CELEC reste disponible si vous souhaitez préciser votre demande."}
      </p>
      <div className="concierge-ended-actions">
        <button onClick={onRestart} className="concierge-restart-btn">
          <RotateCcw size={18} />
          Nouvel appel
        </button>
        <button onClick={onBack} className="concierge-back-btn">Retour à l'accueil</button>
      </div>
    </div>
  );
}
