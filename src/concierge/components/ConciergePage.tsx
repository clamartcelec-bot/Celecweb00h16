import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRealtimeSession, type ToolCall, type TranscriptEvent, type ToolActivity } from '@/concierge/hooks/useRealtimeSession';
import { ConciergeRobot, type ConciergeRobotHandle } from '@/concierge/components/ConciergeRobot';
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
import { ConciergeCardStack } from './ConciergeCardStack';
import { ActiveView } from './ConciergeActiveView';
import { RequestPanel } from './ConciergeRequestPanel';
import { ConnectingView, EndedView, ErrorView, IdleView, UnavailableView } from './ConciergeStageViews';
import '../concierge.css';

const PAGE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
    isResponding,
    localStream,
    remoteStream,
    start,
    stop,
    toggleMute,
    sendFunctionResult,
    onToolCall,
    onToolActivity,
    onTranscript,
    injectSystemMessage,
    requestResponse,
    sendUserText,
  } = useRealtimeSession(conversationId);

  const robotRef = useRef<ConciergeRobotHandle>(null);
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const handleAudioAmplitude = useCallback((value: number) => {
    robotRef.current?.setAudioAmplitude(value);
  }, []);
  useEffect(() => {
    onToolActivity(setToolActivity);
    return () => onToolActivity(null);
  }, [onToolActivity]);
  useEffect(() => {
    if (status !== 'connected') setToolActivity(null);
  }, [status]);

  const [draft, setDraft] = useState<ConciergeDraft>(EMPTY_CONCIERGE_DRAFT);
  const [clientContext, setClientContext] = useState<ConciergeContext | null>(null);
  const [knowledgeReady, setKnowledgeReady] = useState(false);
  const [settings, setSettings] = useState<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const [cards, setCards] = useState<ConciergeCard[]>([]);
  const [messages, setMessages] = useState<ConciergeMessage[]>([]);
  const [aiReply, setAiReply] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
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
    if (event.role === 'assistant') {
      // Le texte du modèle arrive parfois vide ou après l'audio : on ne remplace
      // la phrase en cours que si on a bien un texte à afficher.
      const next = event.fullText || event.text;
      if (next) setAiReply(next);
      return;
    }

    if (!event.final) {
      setComposerText((current) => current || event.text);
      return;
    }

    setMessages((current) => {
      const next = [...current, {
        id: `user-${current.length}-${Date.now()}`,
        role: 'user' as const,
        text: event.text,
      }];
      transcriptRef.current = next;
      return next;
    });
    setComposerText('');
  }, []);

  const handleToolCall = useCallback(async (tool: ToolCall) => {
    const args = tool.arguments;
    if (!['update_client_panel', 'update_request_panel', 'search_carnet', 'show_carnet_entries',
      'show_brand', 'begin_appointment_flow', 'end_appointment_flow', 'submit_request'].includes(tool.name)) {
      sendFunctionResult(tool.callId, { success: false, message: 'Action inconnue.' });
      return;
    }


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
    if (!aiReply) return;
    const timer = window.setTimeout(() => setAiReply(''), aiReply.length * 65 + 2_600);
    return () => window.clearTimeout(timer);
  }, [aiReply]);

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

  const [searchParams, setSearchParams] = useSearchParams();
  const autoStartedRef = useRef(false);
  const wantsAutoStart = searchParams.get('start') === '1';

  // Arrivée depuis le robot de l’accueil : on décroche dès que le carnet est prêt.
  useEffect(() => {
    if (!wantsAutoStart || autoStartedRef.current || !knowledgeReady) return;
    autoStartedRef.current = true;
    setSearchParams((params) => {
      params.delete('start');
      return params;
    }, { replace: true });
    if (settings.enabled && status === 'idle') handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAutoStart, knowledgeReady, settings.enabled, status]);

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
      <ConciergeCardStack
        cards={cards}
        ended={status === 'ended'}
        detailHrefFor={(card) => card.kind === 'carnet'
          ? carnetUrlForSession(sessionIdRef.current)
          : brandCardHref(card.brandName ?? card.title)}
      />
    );
  }, [appointmentMode, cards, status]);

  const phase: 'unavailable' | 'idle' | 'connecting' | 'error' | 'session' =
    status === 'idle' ? (settings.enabled ? 'idle' : 'unavailable')
      : status === 'requesting-mic' || status === 'connecting' ? 'connecting'
        : status === 'error' ? 'error' : 'session';

  const statusLabel = status === 'connected'
    ? isAssistantSpeaking ? 'CELEC vous répond' : isUserSpeaking ? 'Vous parlez…'
      : isResponding || toolActivity?.phase === 'started' ? 'Je m’en occupe…' : 'À l’écoute'
    : status === 'requesting-mic' || status === 'connecting' ? 'Je me prépare…'
      : status === 'error' ? 'Connexion à réessayer' : status === 'ended' ? 'À bientôt !' : 'Bonjour !';

  return (
    <div className="concierge-page" data-status={status}>
      <div className="concierge-backdrop" aria-hidden="true">
        <span className="concierge-aura concierge-aura--rose" />
        <span className="concierge-aura concierge-aura--ion" />
        <span className="concierge-aura concierge-aura--sand" />
        <span className="concierge-grid" />
      </div>

      <header className="concierge-header">
        <motion.button
          onClick={handleGoBack}
          className="concierge-back"
          aria-label="Retour"
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.92 }}
        >
          <ArrowLeft size={18} />
        </motion.button>
        <span className="concierge-logo">CELEC<span>.</span></span>
        <div className="concierge-header-spacer" />
        <AnimatePresence>
          {status === 'connected' && (
            <motion.span
              className={`concierge-timer ${timer.warningLevel !== 'none' ? 'concierge-timer--warn' : ''}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <span className="concierge-live-dot" />
              {timer.formatted}
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <div className="concierge-companion">
        <ConciergeRobot ref={robotRef} status={status}
          isUserSpeaking={isUserSpeaking} isAssistantSpeaking={isAssistantSpeaking}
          isResponding={isResponding} toolActivity={toolActivity} />
        <motion.div
          className="concierge-companion-caption"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: PAGE_EASE }}
        >
          <span className="concierge-companion-name">Votre concierge CELEC</span>
          <div className="concierge-status-row" role="status">
            <span className={`concierge-status-dot concierge-status-dot--${status}`} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={statusLabel}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {statusLabel}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <main className={`concierge-main ${inSession && (showRequestPanel || cards.length > 0) ? 'concierge-main--flow' : ''}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            className="concierge-phase"
            initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: PAGE_EASE }}
          >
            {phase === 'unavailable' && <UnavailableView />}
            {phase === 'idle' && (
              <IdleView greeting={settings.greeting} knowledgeReady={knowledgeReady} onStart={handleStart} />
            )}
            {phase === 'connecting' && (
              <ConnectingView label={status === 'requesting-mic' ? 'Autorisation du micro…' : 'Connexion en cours…'} />
            )}
            {phase === 'error' && <ErrorView error={error} onRetry={() => handleStart()} />}

            {phase === 'session' && (
              <>
                <div className={`concierge-session-layout ${showRequestPanel ? '' : 'concierge-session-layout--solo'}`}>
                  {status === 'connected' ? (
                    <ActiveView
                      timer={timer}
                      compact={cards.length > 0 || appointmentMode}
                      isMuted={isMuted}
                      isUserSpeaking={isUserSpeaking}
                      isAssistantSpeaking={isAssistantSpeaking}
                      localStream={localStream}
                      remoteStream={remoteStream}
                      onAudioAmplitude={handleAudioAmplitude}
                      aiReply={aiReply}
                      messages={messages}
                      historyOpen={historyOpen}
                      onToggleHistory={() => setHistoryOpen((value) => !value)}
                      composerText={composerText}
                      onComposerChange={setComposerText}
                      onComposerKeyDown={handleComposerKeyDown}
                      onSendMessage={handleSendMessage}
                      onQuickAction={sendUserText}
                      onToggleMute={toggleMute}
                      onEnd={handleEnd}
                    />
                  ) : (
                    <EndedView draft={draft} onRestart={() => handleStart()} onResume={handleResume} onBack={handleGoBack} />
                  )}
                  {showRequestPanel && (
                    <RequestPanel
                      draft={draft}
                      submissionState={submissionState}
                      uploading={uploading}
                      uploadError={uploadError}
                      onFilePick={handleFilePick}
                      onRemoveAttachment={removeAttachment}
                      onSubmit={handleManualSubmit}
                      onExit={status === 'connected' ? handleExitAppointment : undefined}
                    />
                  )}
                </div>
                {flow}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

