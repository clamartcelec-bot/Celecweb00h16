import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Wallet,
} from 'lucide-react';
import { useRealtimeSession, type ToolCall } from '../hooks/useRealtimeSession';
import { useConversationTimer } from '../hooks/useConversationTimer';
import { formatConciergeContext, loadConciergeContext, type ConciergeContext } from '../services/context';
import {
  EMPTY_KNOWLEDGE,
  findBrand,
  findEntries,
  loadConciergeKnowledge,
  searchCarnet,
  type ConciergeKnowledge,
} from '../services/knowledge';
import { markPresentedEntries } from '../services/presence';
import { loadConciergeSettings, DEFAULT_CONCIERGE_SETTINGS, type ConciergeSettings } from '../services/config';
import { submitConciergeLead } from '../services/lead';
import { carnetUrlForSession, endConciergeSession, startConciergeSession } from '@/lib/conciergeSession';
import {
  CATEGORY_LABELS,
  EMPTY_CONCIERGE_DRAFT,
  URGENCY_LABELS,
  type ConciergeCard,
  type ConciergeDraft,
  type RequestCategory,
  type RequestUrgency,
} from '../types';
import { CardChip } from './CardChip';
import '../concierge.css';

const TOPICS: Array<{ label: string; category: RequestCategory }> = [
  { label: "J'ai une panne", category: 'depannage' },
  { label: "J'ai des travaux", category: 'travaux' },
  { label: "J'ai un projet", category: 'projet' },
  { label: 'Je ne sais pas vraiment', category: 'question' },
];

const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Prendre rendez-vous',
    prompt: "Je souhaite prendre rendez-vous avec CELEC. Lance le mode rendez-vous et remplis la fiche avec moi au fil de la conversation.",
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

function stringArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === 'string' ? args[key].trim() : undefined;
}

function booleanArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === 'boolean' ? args[key] : undefined;
}

function stringArrayArg(args: Record<string, unknown>, key: string, max = 6) {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, max);
}

function categoryArg(value: string | undefined): RequestCategory | undefined {
  return value && value in CATEGORY_LABELS ? value as RequestCategory : undefined;
}

function urgencyArg(value: string | undefined): RequestUrgency | undefined {
  return value && value in URGENCY_LABELS ? value as RequestUrgency : undefined;
}

function brandCardHref(name: string) {
  return `/partners?brand=${encodeURIComponent(name)}`;
}

export function ConciergePage() {
  const [conversationId, setConversationId] = useState<string | null>(null);

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
    sendUserText,
  } = useRealtimeSession(conversationId);

  const [draft, setDraft] = useState<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const [clientContext, setClientContext] = useState<ConciergeContext | null>(null);
  const [knowledgeReady, setKnowledgeReady] = useState(false);
  const [settings, setSettings] = useState<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const [cards, setCards] = useState<ConciergeCard[]>([]);
  const [appointmentMode, setAppointmentMode] = useState(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const hasInjectedWarningRef = useRef(false);
  const hasStartedGreetingRef = useRef(false);
  const hasSubmittedRef = useRef(false);
  const selectedTopicRef = useRef<string>();
  const draftRef = useRef<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const settingsRef = useRef<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const knowledgeRef = useRef<ConciergeKnowledge>(EMPTY_KNOWLEDGE);
  const sessionIdRef = useRef<string | null>(null);
  const shownCardIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    Promise.all([loadConciergeContext(), loadConciergeSettings(), loadConciergeKnowledge()])
      .then(([context, loadedSettings, loadedKnowledge]) => {
        if (!active) return;
        settingsRef.current = loadedSettings;
        knowledgeRef.current = loadedKnowledge;
        setSettings(loadedSettings);
        setKnowledgeReady(true);

        setClientContext({
          ...(context ?? {}),
          firstName: context?.firstName,
          phone: context?.phone,
          previousRequests: context?.previousRequests,
          knowledge: loadedKnowledge,
        });

        if (context) {
          setDraft((current) => {
            const next = {
              ...current,
              firstName: current.firstName || context.firstName || '',
              phone: current.phone || context.phone || '',
            };
            draftRef.current = next;
            return next;
          });
        }
      })
      .catch((contextError) => {
        console.warn('Concierge context unavailable:', contextError);
        setKnowledgeReady(true);
      });
    return () => { active = false; };
  }, []);

  const updateDraft = useCallback((patch: Partial<ConciergeDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      draftRef.current = next;
      return next;
    });
  }, []);

  const pushCards = useCallback((incoming: ConciergeCard[]) => {
    const fresh = incoming.filter((card) => !shownCardIdsRef.current.has(card.id));
    if (!fresh.length) return;

    fresh.forEach((card) => shownCardIdsRef.current.add(card.id));
    setCards((current) => [...fresh, ...current].slice(0, 24));

    const entryIds = fresh.filter((card) => card.kind === 'carnet').map((card) => card.id);
    if (entryIds.length) void markPresentedEntries(entryIds, sessionIdRef.current);
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

    if (tool.name === 'search_carnet') {
      const query = stringArg(args, 'query') ?? '';
      const found = searchCarnet(knowledgeRef.current, query, 3);
      sendFunctionResult(tool.callId, {
        success: true,
        results: found.map((entry) => ({
          id: entry.id,
          titre: entry.title,
          commune: entry.city || 'commune non précisée',
          marques: entry.brands.join(', ') || 'aucune marque identifiée',
          detail: entry.description.slice(0, 220),
        })),
        message: found.length
          ? 'Présente ces billets au client puis affiche-les avec show_carnet_entries.'
          : 'Aucun billet publié ne correspond. Dis-le simplement au client, sans rien afficher.',
      });
      return;
    }

    if (tool.name === 'show_carnet_entries') {
      const ids = stringArrayArg(args, 'entry_ids');
      const entries = findEntries(knowledgeRef.current, ids);
      const limited = entries.slice(0, Math.max(1, settingsRef.current.max_cards || 3));

      pushCards(limited.map((entry) => ({
        id: entry.id,
        kind: 'carnet',
        title: entry.title,
        subtitle: [entry.city, entry.brands.slice(0, 2).join(' · ')].filter(Boolean).join(' — '),
        imageUrl: entry.image_url,
      })));

      sendFunctionResult(tool.callId, {
        success: true,
        affiche: limited.length,
        message: limited.length
          ? 'Billets affichés à l’écran. Commente-les à l’oral.'
          : 'Ces billets ne sont pas disponibles. N’invente rien et poursuis la conversation.',
      });
      return;
    }

    if (tool.name === 'show_brand') {
      if (!settingsRef.current.show_brand_cards) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'L’affichage des marques est désactivé. Réponds uniquement à l’oral.',
        });
        return;
      }

      const requested = stringArg(args, 'brand') ?? '';
      const brand = findBrand(knowledgeRef.current, requested);
      if (!brand) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'Cette marque ne fait pas partie du carnet publié. Ne l’affiche pas et ne l’invente pas.',
        });
        return;
      }

      pushCards([{
        id: `brand:${brand.name}`,
        kind: 'brand',
        title: brand.name,
        subtitle: brand.partnerName ? 'Partenaire CELEC' : `${brand.count} intervention(s) au carnet`,
        imageUrl: '',
        brandName: brand.name,
      }]);

      sendFunctionResult(tool.callId, {
        success: true,
        marque: brand.name,
        fiche_partenaire: Boolean(brand.partnerName),
        message: 'Fiche marque affichée à l’écran.',
      });
      return;
    }

    if (tool.name === 'begin_appointment_flow') {
      setAppointmentMode(true);
      sendFunctionResult(tool.callId, {
        success: true,
        mode: 'rendez-vous',
        message: 'Mode rendez-vous activé. Recentre la conversation et ne traite plus les questions sur le site.',
      });
      requestResponse();
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
  }, [pushCards, requestResponse, sendFunctionResult, updateDraft]);

  useEffect(() => {
    onToolCall(handleToolCall);
    return () => onToolCall(null);
  }, [handleToolCall, onToolCall]);

  useEffect(() => {
    if (status !== 'connected') {
      hasStartedGreetingRef.current = false;
      return;
    }
    if (hasStartedGreetingRef.current || !knowledgeReady) return;

    hasStartedGreetingRef.current = true;
    injectSystemMessage(formatConciergeContext(clientContext, selectedTopicRef.current));
    requestResponse();
  }, [clientContext, injectSystemMessage, knowledgeReady, requestResponse, status]);

  const onApproachingEnd = useCallback(() => {
    if (!hasInjectedWarningRef.current) {
      hasInjectedWarningRef.current = true;
      injectSystemMessage(
        'INSTRUCTION INTERNE : Il reste environ 2 minutes de conversation. Commence à conclure naturellement, résume ce qui a été compris et propose de transmettre la demande.'
      );
    }
  }, [injectSystemMessage]);

  const handleEnd = useCallback(() => {
    stop();
    endConciergeSession(sessionIdRef.current);
  }, [stop]);

  const onCutoff = useCallback(() => handleEnd(), [handleEnd]);
  const timer = useConversationTimer(status === 'connected', onApproachingEnd, onCutoff);

  useEffect(() => {
    if (status !== 'connected') hasInjectedWarningRef.current = false;
  }, [status]);

  const handleStart = (topic?: { label: string; category: RequestCategory }) => {
    selectedTopicRef.current = topic?.label;
    hasSubmittedRef.current = false;
    setSubmissionState('idle');
    setCards([]);
    setAppointmentMode(false);
    shownCardIdsRef.current.clear();
    sessionIdRef.current = startConciergeSession();
    setConversationId(sessionIdRef.current);
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
    handleEnd();
    window.location.href = '/';
  };

  const inSession = status === 'connected' || status === 'ended';
  const showRequestPanel = appointmentMode || submissionState !== 'idle';
  const hasFlow = cards.length > 0 || showRequestPanel;

  const flow = useMemo(() => {
    if (!cards.length) return null;
    return (
      <div className="concierge-flow">
        <div className="concierge-flow-head">
          <span className="concierge-flow-label">Ce que je vous montre</span>
          {appointmentMode && <span className="concierge-flow-focus">Mode rendez-vous</span>}
        </div>
        <div className="concierge-card-list">
          {cards.map((card, index) => (
            <CardChip
              key={card.id}
              card={card}
              featured={index === 0}
              detailHref={card.kind === 'carnet'
                ? carnetUrlForSession(sessionIdRef.current)
                : brandCardHref(card.brandName ?? card.title)}
            />
          ))}
        </div>
        {status === 'ended' && (
          <p className="concierge-flow-note">
            L’appel est terminé. Les billets présentés restent marqués dans le carnet jusqu’à votre prochaine visite.
          </p>
        )}
      </div>
    );
  }, [appointmentMode, cards, status]);

  return (
    <div className="concierge-page">
      <header className="concierge-header">
        <button onClick={handleGoBack} className="concierge-back" aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <span className="concierge-logo">CELEC</span>
        <div className="concierge-header-spacer" />
      </header>

      <main className={`concierge-main ${inSession && hasFlow ? 'concierge-main--flow' : ''}`}>
        {status === 'idle' && !settings.enabled && (
          <div className="concierge-idle">
            <div className="concierge-greeting">
              <h1>Bonjour.</h1>
              <p>Le concierge numérique est momentanément indisponible.</p>
            </div>
            <a className="concierge-back-btn" href="/#contact-box">Nous écrire</a>
          </div>
        )}

        {status === 'idle' && settings.enabled && (
        <IdleView greeting={settings.greeting} knowledgeReady={knowledgeReady} onStart={handleStart} />
      )}
        {status === 'requesting-mic' && <ConnectingView label="Autorisation du micro..." />}
        {status === 'connecting' && <ConnectingView label="Connexion en cours..." />}

        {status === 'connected' && (
          <>
            <div className={`concierge-session-layout ${showRequestPanel ? '' : 'concierge-session-layout--solo'}`}>
              <ActiveView
                timer={timer}
                compact={cards.length > 0}
                isMuted={isMuted}
                isUserSpeaking={isUserSpeaking}
                isAssistantSpeaking={isAssistantSpeaking}
                onToggleMute={toggleMute}
                onEnd={handleEnd}
                onQuickAction={sendUserText}
              />
              {showRequestPanel && <RequestPanel draft={draft} submissionState={submissionState} />}
            </div>
            {flow}
          </>
        )}

        {status === 'error' && <ErrorView error={error} onRetry={() => handleStart()} />}

        {status === 'ended' && (
          <>
            <div className={`concierge-session-layout ${showRequestPanel ? '' : 'concierge-session-layout--solo'}`}>
              <EndedView draft={draft} onRestart={() => handleStart()} onBack={handleGoBack} />
              {showRequestPanel && <RequestPanel draft={draft} submissionState={submissionState} />}
            </div>
            {flow}
          </>
        )}
      </main>
    </div>
  );
}

function IdleView({
  greeting,
  knowledgeReady,
  onStart,
}: {
  greeting: string;
  knowledgeReady: boolean;
  onStart: (topic?: { label: string; category: RequestCategory }) => void;
}) {
  return (
    <div className="concierge-idle">
      <div className="concierge-greeting">
        <h1>Bonjour.</h1>
        <p>{greeting}</p>
      </div>

      <button onClick={() => onStart()} className="concierge-start-btn" disabled={!knowledgeReady}>
        <Mic size={24} />
        {knowledgeReady ? 'Parler à CELEC' : 'Préparation du carnet…'}
      </button>

      <div className="concierge-quick-topics">
        {TOPICS.map((topic) => (
          <button key={topic.category} onClick={() => onStart(topic)} className="concierge-topic">
            {topic.label}
          </button>
        ))}
      </div>

      <p className="concierge-disclosure">
        Vous allez parler avec le concierge numérique de CELEC. Il s’appuie sur notre carnet d’interventions publié et sur nos partenaires pour vous répondre, et affiche à l’écran les éléments dont il parle.
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
  compact: boolean;
  isMuted: boolean;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  onQuickAction: (prompt: string) => void;
}

function ActiveView({ timer, compact, isMuted, isUserSpeaking, isAssistantSpeaking, onToggleMute, onEnd, onQuickAction }: ActiveViewProps) {
  return (
    <div className={`concierge-active ${compact ? 'concierge-active--compact' : ''}`}>
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
          Raccrocher
        </button>
      </div>

      <div className="concierge-quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onQuickAction(action.prompt)}
            className="concierge-quick-btn"
          >
            {action.label}
          </button>
        ))}
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
      {!draft.summary && submissionState === 'idle' && (
        <p className="concierge-panel-hint">
          <Wallet size={13} />
          La fiche se remplit au fil de la conversation. Rien n’est transmis sans votre accord.
        </p>
      )}
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
