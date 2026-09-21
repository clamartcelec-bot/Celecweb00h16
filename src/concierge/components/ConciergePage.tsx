import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  LogOut,
  Paperclip,
  Phone,
  PhoneOff,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { useRealtimeSession, type ToolCall, type TranscriptEvent } from '../hooks/useRealtimeSession';
import { useConversationTimer } from '../hooks/useConversationTimer';
import { formatConciergeContext, formatConciergeResume, loadConciergeContext, type ConciergeContext } from '../services/context';
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
import { uploadConciergeFile } from '../services/upload';
import { carnetUrlForSession, endConciergeSession, startConciergeSession } from '@/lib/conciergeSession';
import {
  CATEGORY_LABELS,
  EMPTY_CONCIERGE_DRAFT,
  URGENCY_LABELS,
  isDraftSubmittable,
  type ConciergeCard,
  type ConciergeDraft,
  type ConciergeMessage,
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

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
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

function formatPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 12).replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function hasValidPhone(value: string) {
  return value.replace(/\D/g, '').length >= 8;
}

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
    onTranscript,
    injectSystemMessage,
    requestResponse,
    sendUserText,
  } = useRealtimeSession(conversationId);

  const [draft, setDraft] = useState<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const [clientContext, setClientContext] = useState<ConciergeContext | null>(null);
  const [knowledgeReady, setKnowledgeReady] = useState(false);
  const [settings, setSettings] = useState<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const [cards, setCards] = useState<ConciergeCard[]>([]);
  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [appointmentMode, setAppointmentMode] = useState(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const hasInjectedWarningRef = useRef(false);
  const hasStartedGreetingRef = useRef(false);
  const hasSubmittedRef = useRef(false);
  const sentSnapshotRef = useRef('');
  const selectedTopicRef = useRef<string>();
  const draftRef = useRef<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const settingsRef = useRef<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const knowledgeRef = useRef<ConciergeKnowledge>(EMPTY_KNOWLEDGE);
  const sessionIdRef = useRef<string | null>(null);
  const shownCardIdsRef = useRef<Set<string>>(new Set());
  const transcriptRef = useRef<ConciergeMessage[]>([]);
  const isResumingRef = useRef(false);

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

      if (hasSubmittedRef.current) {
        const nextSnapshot = [
          (next.lastName.trim() || next.firstName.trim()),
          next.phone.replace(/\D/g, ''),
          next.summary.trim(),
        ].join('|');
        if (nextSnapshot !== sentSnapshotRef.current) {
          hasSubmittedRef.current = false;
          setSubmissionState('idle');
          next.nextStep = 'Fiche mise à jour — la demande peut être renvoyée';
        }
      }

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

  const handleTranscript = useCallback((event: TranscriptEvent) => {
    setMessages((current) => {
      const last = current[current.length - 1];
      let next: ConciergeMessage[];

      if (last && last.role === event.role && last.pending) {
        next = [...current.slice(0, -1), {
          ...last,
          text: event.final ? event.text : last.text + event.text,
          pending: !event.final,
        }];
      } else {
        next = [...current, {
          id: `${event.role}-${current.length}-${Date.now()}`,
          role: event.role,
          text: event.text,
          pending: !event.final,
        }];
      }

      transcriptRef.current = next;
      return next;
    });
  }, []);

  const handleToolCall = useCallback(async (tool: ToolCall) => {
    const args = tool.arguments;

    if (tool.name === 'update_client_panel') {
      const firstName = stringArg(args, 'first_name');
      const lastName = stringArg(args, 'last_name');
      const phone = stringArg(args, 'phone');
      const summary = stringArg(args, 'summary');
      updateDraft({
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(summary !== undefined && { summary }),
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
      if (appointmentMode) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'Mode rendez-vous actif : ne consulte plus le carnet. Recentre la conversation sur la prise de rendez-vous.',
        });
        return;
      }

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
      if (appointmentMode) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'Mode rendez-vous actif : n’affiche plus de billets. Reste sur la prise de rendez-vous.',
        });
        return;
      }

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
      if (appointmentMode) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: 'Mode rendez-vous actif : n’affiche plus de marque. Reste sur la prise de rendez-vous.',
        });
        return;
      }

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
      if (booleanArg(args, 'callback_requested') === true) {
        updateDraft({ callbackRequested: true });
      }
      sendFunctionResult(tool.callId, {
        success: true,
        mode: 'rendez-vous',
        message: 'Mode rendez-vous activé. Recentre la conversation et ne traite plus les questions sur le site.',
      });
      requestResponse();
      return;
    }

    if (tool.name === 'end_appointment_flow') {
      setAppointmentMode(false);
      sendFunctionResult(tool.callId, {
        success: true,
        message: 'Sortie de la prise de rendez-vous. La fiche reste enregistrée et peut être renvoyée après correction. Réponds maintenant aux questions du client.',
      });
      requestResponse();
      return;
    }

    if (tool.name === 'submit_request') {
      if (hasSubmittedRef.current) {
        const currentSnapshot = [
          (draftRef.current.lastName.trim() || draftRef.current.firstName.trim()),
          draftRef.current.phone.replace(/\D/g, ''),
          draftRef.current.summary.trim(),
        ].join('|');
        if (currentSnapshot === sentSnapshotRef.current) {
          sendFunctionResult(tool.callId, { success: true, message: 'La demande a déjà été transmise avec ces informations exactes. Ne la renvoie pas.' });
          return;
        }
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

      updateDraft({
        ...(firstName !== undefined && { firstName }),
        ...(phone !== undefined && { phone }),
        ...(category && { category }),
        ...(summary !== undefined && { summary }),
      });

      try {
        const result = await sendLead('concierge');
        sendFunctionResult(tool.callId, {
          success: true,
          saved: true,
          telegram_notified: result.telegram,
          message: result.telegram
            ? 'La demande est enregistrée et transmise à l’équipe CELEC. Remercie le client et confirme-lui que tout est transmis.'
            : 'La demande est enregistrée. La notification Telegram n’a pas pu être confirmée.',
        });
      } catch (submissionError) {
        sendFunctionResult(tool.callId, {
          success: false,
          message: submissionError instanceof Error
            ? submissionError.message
            : 'La transmission a échoué.',
        });
      }
    }
  }, [appointmentMode, pushCards, requestResponse, sendFunctionResult, updateDraft]);

  const sendLead = useCallback(async (source: 'concierge' | 'callback') => {
    const current = draftRef.current;
    if (!isDraftSubmittable(current)) {
      throw new Error('Le nom, le téléphone et l’objet de l’appel sont nécessaires.');
    }

    setSubmissionState('sending');
    setUploadError(null);

    try {
      const result = await submitConciergeLead(current, source);
      hasSubmittedRef.current = true;
      sentSnapshotRef.current = [
        (current.lastName.trim() || current.firstName.trim()),
        current.phone.replace(/\D/g, ''),
        current.summary.trim(),
      ].join('|');
      setSubmissionState('sent');
      updateDraft({
        nextStep: result.telegram
          ? 'Demande transmise à l’équipe CELEC'
          : 'Demande enregistrée dans l’espace CELEC',
      });
      return result;
    } catch (submissionError) {
      setSubmissionState('error');
      throw submissionError;
    }
  }, [updateDraft]);

  useEffect(() => {
    onToolCall(handleToolCall);
    return () => onToolCall(null);
  }, [handleToolCall, onToolCall]);

  useEffect(() => {
    onTranscript(handleTranscript);
    return () => onTranscript(null);
  }, [handleTranscript, onTranscript]);

  useEffect(() => {
    if (status !== 'connected') {
      hasStartedGreetingRef.current = false;
      return;
    }
    if (hasStartedGreetingRef.current || !knowledgeReady) return;

    hasStartedGreetingRef.current = true;

    if (isResumingRef.current) {
      isResumingRef.current = false;
      injectSystemMessage(formatConciergeResume(
        clientContext,
        draftRef.current,
        transcriptRef.current.map((message) => `${message.role === 'user' ? 'Client' : 'CELEC'} : ${message.text}`),
      ));
    } else {
      injectSystemMessage(formatConciergeContext(clientContext, selectedTopicRef.current));
    }

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
    isResumingRef.current = false;
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
    isResumingRef.current = false;
    hasSubmittedRef.current = false;
    setSubmissionState('idle');
    setCards([]);
    setMessages([]);
    transcriptRef.current = [];
    setComposerText('');
    setUploadError(null);
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

  const handleResume = () => {
    hasSubmittedRef.current = submissionState === 'sent';
    isResumingRef.current = true;
    start();
  };

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendUserText(trimmed);
    setComposerText('');
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage(composerText);
    }
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadConciergeFile(file, sessionIdRef.current);
      updateDraft({ attachments: [...draftRef.current.attachments, url] });
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : 'Envoi impossible.');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (url: string) => {
    updateDraft({ attachments: draftRef.current.attachments.filter((item) => item !== url) });
  };

  const handleManualSubmit = async () => {
    if (!isDraftSubmittable(draftRef.current)) {
      setUploadError('Le nom, le téléphone et l’objet de l’appel sont nécessaires.');
      return;
    }

    try {
      await sendLead(appointmentMode ? 'concierge' : 'callback');
      const name = draftRef.current.lastName.trim() || draftRef.current.firstName.trim();
      sendUserText(
        `Le client vient d’appuyer sur le bouton « Envoyer la demande » de la fiche de prise de rendez-vous. La demande de ${name} vient d’être transmise à l’équipe CELEC avec les informations à jour. Confirme-le chaleureusement à l’oral, sans redemander aucune information.`,
      );
    } catch {
      // l’état de transmission reflète déjà l’échec à l’écran
    }
  };

  const handleExitAppointment = () => {
    setAppointmentMode(false);
    sendUserText(
      'Le client a appuyé sur « Sortir de la prise de rendez-vous ». La fiche reste enregistrée et pourra être renvoyée si elle change. Réponds maintenant à sa nouvelle question.',
    );
  };

  const inSession = status === 'connected' || status === 'ended';
  const showRequestPanel = appointmentMode || submissionState !== 'idle';
  const flow = useMemo(() => {
    if (appointmentMode || !cards.length) return null;
    return (
      <div className="concierge-flow">
        <div className="concierge-flow-head">
          <span className="concierge-flow-label">Ce que je vous montre</span>
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

      <main className={`concierge-main ${inSession && (showRequestPanel || cards.length > 0) ? 'concierge-main--flow' : ''}`}>
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
                compact={cards.length > 0 || appointmentMode}
                isMuted={isMuted}
                isUserSpeaking={isUserSpeaking}
                isAssistantSpeaking={isAssistantSpeaking}
                messages={messages}
                composerText={composerText}
                onComposerChange={setComposerText}
                onComposerKeyDown={handleComposerKeyDown}
                onSendMessage={handleSendMessage}
                onQuickAction={sendUserText}
                onToggleMute={toggleMute}
                onEnd={handleEnd}
              />
              {showRequestPanel && (
                <RequestPanel
                  draft={draft}
                  submissionState={submissionState}
                  uploading={uploading}
                  uploadError={uploadError}
                  onFilePick={handleFilePick}
                  onRemoveAttachment={removeAttachment}
                  onSubmit={handleManualSubmit}
                  onExit={handleExitAppointment}
                />
              )}
            </div>
            {flow}
          </>
        )}

        {status === 'error' && <ErrorView error={error} onRetry={() => handleStart()} />}

        {status === 'ended' && (
          <>
            <div className={`concierge-session-layout ${showRequestPanel ? '' : 'concierge-session-layout--solo'}`}>
              <EndedView draft={draft} onRestart={() => handleStart()} onResume={handleResume} onBack={handleGoBack} />
              {showRequestPanel && (
                <RequestPanel
                  draft={draft}
                  submissionState={submissionState}
                  uploading={uploading}
                  uploadError={uploadError}
                  onFilePick={handleFilePick}
                  onRemoveAttachment={removeAttachment}
                  onSubmit={handleManualSubmit}
                />
              )}
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
  messages: ConciergeMessage[];
  composerText: string;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (text: string) => void;
  onQuickAction: (prompt: string) => void;
  onToggleMute: () => void;
  onEnd: () => void;
}

function ActiveView({
  timer,
  compact,
  isMuted,
  isUserSpeaking,
  isAssistantSpeaking,
  messages,
  composerText,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onQuickAction,
  onToggleMute,
  onEnd,
}: ActiveViewProps) {
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const showQuickPrompts = messages.length <= 1;

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

      <div className="concierge-transcript" aria-live="polite">
        {messages.length === 0 ? (
          <p className="concierge-transcript-empty">La conversation s’affiche ici, en direct.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`concierge-bubble concierge-bubble--${message.role} ${message.pending ? 'concierge-bubble--pending' : ''}`}
            >
              <span className="concierge-bubble-author">{message.role === 'user' ? 'Vous' : 'CELEC'}</span>
              <p>{message.text}</p>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      <div className="concierge-composer">
        <textarea
          value={composerText}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          rows={1}
          placeholder="Écrivez votre message…"
          className="concierge-composer-input"
        />
        <button
          onClick={() => onSendMessage(composerText)}
          className="concierge-composer-send"
          disabled={!composerText.trim()}
          aria-label="Envoyer le message"
        >
          <Send size={18} />
        </button>
      </div>

      {showQuickPrompts && (
        <div className="concierge-quick-actions">
          {QUICK_PROMPTS.map((action) => (
            <button key={action.label} onClick={() => onQuickAction(action.prompt)} className="concierge-quick-btn">
              {action.label}
            </button>
          ))}
          <button onClick={() => onQuickAction(CALLBACK_PROMPT)} className="concierge-quick-btn">
            Être rappelé
          </button>
        </div>
      )}

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

function RequestPanel({
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

  return (
    <aside className="concierge-request-panel" aria-live="polite">
      <div className="concierge-panel-title">
        <ClipboardList size={18} />
        <span>Prise de rendez-vous</span>
        {sent && !canSend && <span className="concierge-submit-status concierge-submit-status--sent">Transmise</span>}
      </div>

      <div className="concierge-field">
        <span className="concierge-field-label">Nom</span>
        <span className={`concierge-field-value ${name ? 'concierge-field-value--ok' : 'concierge-field-value--missing'}`}>
          {name || 'À préciser'}
        </span>
      </div>

      <div className="concierge-field">
        <span className="concierge-field-label">Téléphone</span>
        <span className={`concierge-field-value concierge-field-value--spaced ${phoneOk ? 'concierge-field-value--ok' : 'concierge-field-value--missing'}`}>
          {phone || 'À préciser'}
        </span>
      </div>

      <div className="concierge-field">
        <span className="concierge-field-label">Adresse</span>
        <span className={`concierge-field-value ${draft.location ? 'concierge-field-value--ok' : ''}`}>
          {draft.location || 'Facultatif'}
        </span>
      </div>

      {draft.category && (
        <PanelLine icon={<ClipboardList size={15} />} label="Type" value={CATEGORY_LABELS[draft.category]} />
      )}
      {draft.siteType && <PanelLine icon={<MapPin size={15} />} label="Site" value={draft.siteType} />}
      {draft.urgency && (
        <PanelLine icon={<AlertTriangle size={15} />} label="Priorité" value={URGENCY_LABELS[draft.urgency]} />
      )}
      {draft.availability && (
        <PanelLine icon={<Clock3 size={15} />} label="Disponibilités" value={draft.availability} />
      )}

      <div className="concierge-panel-objective">
        <span className={`concierge-panel-objective-label ${objective ? 'concierge-panel-objective-label--ok' : 'concierge-panel-objective-label--missing'}`}>
          Objet de l’appel
        </span>
        <p className={objective ? '' : 'concierge-panel-objective-empty'}>
          {objective || 'À préciser pendant l’échange.'}
        </p>
      </div>

      <div className="concierge-panel-files">
        <label className="concierge-file-btn">
          {uploading ? <Loader2 size={15} className="concierge-spin" /> : <Paperclip size={15} />}
          Ajouter une photo ou une vidéo
          <input
            type="file"
            accept="image/*,video/*"
            onChange={onFilePick}
            hidden
          />
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

      <button
        onClick={onSubmit}
        disabled={!canSend}
        className={`concierge-submit-btn ${readyToSend ? 'concierge-submit-btn--ready' : ''} ${sent && !readyToSend ? 'concierge-submit-btn--sent' : ''}`}
      >
        {sending && <Loader2 size={16} className="concierge-spin" />}
        {sent && !sending && <CheckCircle2 size={16} />}
        {sending ? 'Envoi…' : sent ? 'Renvoyer la demande' : 'Envoyer la demande'}
      </button>

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

function EndedView({ draft, onRestart, onResume, onBack }: { draft: ConciergeDraft; onRestart: () => void; onResume: () => void; onBack: () => void }) {
  return (
    <div className="concierge-ended">
      <h2>Merci pour votre appel.</h2>
      <p>
        {draft.summary
          ? 'Votre fiche reste disponible sur cette page. Vérifiez que la transmission a bien été confirmée pendant l’appel.'
          : "L'équipe CELEC reste disponible si vous souhaitez préciser votre demande."}
      </p>
      <div className="concierge-ended-actions">
        <button onClick={onResume} className="concierge-restart-btn">
          <Phone size={18} />
          Reprendre l’appel
        </button>
        <button onClick={onRestart} className="concierge-retry-btn">
          <RotateCcw size={18} />
          Nouvel appel
        </button>
        <button onClick={onBack} className="concierge-back-btn">Retour à l'accueil</button>
      </div>
    </div>
  );
}
