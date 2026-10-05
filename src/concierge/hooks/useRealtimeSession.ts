import { useState, useRef, useCallback, useEffect } from 'react';
import {
  requestMicrophone,
  createRealtimeSession,
  closeSession,
  sendDataChannelEvent,
  type WebRTCSession,
  type DataChannelMessage,
} from '@/concierge/services/webrtc';

export type ConnectionStatus = 'idle' | 'requesting-mic' | 'connecting' | 'connected' | 'error' | 'ended';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolActivity {
  name: string;
  callId: string;
  phase: 'started' | 'success' | 'error';
}

export interface TranscriptEvent {
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
  fullText?: string;
}

export function useRealtimeSession(conversationId: string | null) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<WebRTCSession | null>(null);
  const toolCallHandlerRef = useRef<((tool: ToolCall) => void | Promise<void>) | null>(null);
  const transcriptHandlerRef = useRef<((event: TranscriptEvent) => void) | null>(null);
  const toolActivityHandlerRef = useRef<((activity: ToolActivity) => void) | null>(null);
  const toolNamesRef = useRef(new Map<string, string>());
  const playbackEventsRef = useRef(false);
  const playbackResponseRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const responseTimerRef = useRef<number | null>(null);

  const scheduleResponse = useCallback(() => {
    if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
    responseTimerRef.current = window.setTimeout(() => {
      responseTimerRef.current = null;
      const session = sessionRef.current;
      if (session) {
        sendDataChannelEvent(session.dc, { type: 'response.create' });
      }
    }, 180);
  }, []);
  const pendingArgsRef = useRef<Map<string, string>>(new Map());
  const processedCallsRef = useRef<Set<string>>(new Set());
  const assistantTranscriptRef = useRef('');

  const failToolCall = useCallback((callId: string, name: string) => {
    processedCallsRef.current.add(callId);
    toolNamesRef.current.delete(callId);
    toolActivityHandlerRef.current?.({ name, callId, phase: 'error' });
    if (!sessionRef.current) return;
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId,
        output: JSON.stringify({ success: false, message: 'Cette action a échoué. Veuillez réessayer.' }) },
    });
    scheduleResponse();
  }, [scheduleResponse]);

  const dispatchToolCall = useCallback((callId: string, name: string, argsStr: string) => {
    if (!callId || !name || processedCallsRef.current.has(callId)) return;
    try {
      const args = JSON.parse(argsStr || '{}') as Record<string, unknown>;
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
      processedCallsRef.current.add(callId);
      toolNamesRef.current.set(callId, name);
      toolActivityHandlerRef.current?.({ name, callId, phase: 'started' });
      const generation = generationRef.current;
      Promise.resolve().then(() => {
        if (generation === generationRef.current) return toolCallHandlerRef.current?.({ name, arguments: args, callId });
      }).catch(() => {
        if (generation === generationRef.current && toolNamesRef.current.has(callId)) failToolCall(callId, name);
      });
    } catch {
      failToolCall(callId, name);
    }
  }, [failToolCall]);

  const handleDataMessage = useCallback((msg: DataChannelMessage) => {
    const type = msg.type as string;

    if (type === 'session.created' || type === 'session.updated') {
      console.log('Session ready:', type);
    }

    if (type === 'input_audio_buffer.speech_started') {
      setIsUserSpeaking(true);
      setIsAssistantSpeaking(false); // User interruption closes the mouth immediately.
    }
    if (type === 'input_audio_buffer.speech_stopped') setIsUserSpeaking(false);
    // WebRTC playback can continue after response.done (generation completion).
    if (type === 'output_audio_buffer.started') {
      playbackEventsRef.current = true;
      playbackResponseRef.current = String(msg.response_id ?? '');
      setIsAssistantSpeaking(true);
    }
    if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
      playbackEventsRef.current = true;
      if (!msg.response_id || msg.response_id === playbackResponseRef.current) {
        playbackResponseRef.current = null;
        setIsAssistantSpeaking(false);
      }
    }
    if (!playbackEventsRef.current) {
      if (type === 'response.output_audio.delta' || type === 'response.audio.delta') setIsAssistantSpeaking(true);
      if (type === 'response.output_audio.done' || type === 'response.audio.done' || type === 'response.done') setIsAssistantSpeaking(false);
    }
    if (type === 'response.created') setIsResponding(true);
    if (type === 'response.done') setIsResponding(false);

    if (type === 'conversation.item.input_audio_transcription.delta') {
      transcriptHandlerRef.current?.({ role: 'user', text: String(msg.delta ?? ''), final: false });
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      transcriptHandlerRef.current?.({ role: 'user', text: String(msg.transcript ?? ''), final: true });
    }

    if (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') {
      assistantTranscriptRef.current += String(msg.delta ?? '');
      transcriptHandlerRef.current?.({
        role: 'assistant',
        text: String(msg.delta ?? ''),
        final: false,
        fullText: assistantTranscriptRef.current,
      });
    }

    if (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') {
      const complete = String(msg.transcript ?? '') || assistantTranscriptRef.current;
      assistantTranscriptRef.current = '';
      transcriptHandlerRef.current?.({ role: 'assistant', text: complete, final: true, fullText: complete });
    }

    if (type === 'response.created') assistantTranscriptRef.current = '';

    if (type === 'response.function_call_arguments.delta') {
      const callId = msg.call_id as string;
      const delta = msg.delta as string;
      const current = pendingArgsRef.current.get(callId) || '';
      pendingArgsRef.current.set(callId, current + delta);
    }

    if (type === 'response.function_call_arguments.done') {
      const callId = msg.call_id as string;
      const name = msg.name as string;
      const completeArgs = typeof msg.arguments === 'string' ? msg.arguments : '';
      const argsStr = completeArgs || pendingArgsRef.current.get(callId) || '{}';
      pendingArgsRef.current.delete(callId);
      dispatchToolCall(callId, name, argsStr);
    }

    if (type === 'response.done') {
      const response = msg.response as { output?: Array<Record<string, unknown>> } | undefined;
      for (const item of response?.output || []) {
        if (item.type !== 'function_call') continue;
        dispatchToolCall(
          String(item.call_id || ''),
          String(item.name || ''),
          typeof item.arguments === 'string' ? item.arguments : '{}',
        );
      }
    }

    if (type === 'error') {
      console.error('Realtime error event:', msg);
    }
  }, [dispatchToolCall]);

  const handleConnectionStateChange = useCallback((state: RTCPeerConnectionState) => {
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      ++generationRef.current;
      const session = sessionRef.current;
      sessionRef.current = null;
      toolNamesRef.current.clear();
      playbackResponseRef.current = null;
      if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
      closeSession(session);
      setIsUserSpeaking(false);
      setIsAssistantSpeaking(false);
      setIsResponding(false);
      setLocalStream(null);
      setRemoteStream(null);
      setStatus('ended');
    }
  }, []);

  const start = useCallback(async () => {
    const generation = ++generationRef.current;
    closeSession(sessionRef.current);
    sessionRef.current = null;
    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
    playbackEventsRef.current = false;
    playbackResponseRef.current = null;
    toolNamesRef.current.clear();
    setLocalStream(null);
    setRemoteStream(null);
    setIsResponding(false);
    pendingArgsRef.current.clear();
    processedCallsRef.current.clear();
    setError(null);
    setIsMuted(false);
    setIsUserSpeaking(false);
    setIsAssistantSpeaking(false);
    setStatus('requesting-mic');

    let stream: MediaStream;
    try {
      stream = await requestMicrophone();
    } catch (e) {
      if (generation !== generationRef.current) return;
      const msg = e instanceof DOMException && e.name === 'NotAllowedError'
        ? "L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres de votre navigateur."
        : e instanceof DOMException && e.name === 'NotFoundError'
          ? 'Aucun microphone détecté sur cet appareil.'
          : "Impossible d'accéder au microphone.";
      setError(msg);
      setStatus('error');
      return;
    }

    if (generation !== generationRef.current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    setStatus('connecting');

    try {
      const session = await createRealtimeSession(
        stream,
        message => { if (generation === generationRef.current) handleDataMessage(message); },
        state => { if (generation === generationRef.current) handleConnectionStateChange(state); },
        conversationId,
      );
      if (generation !== generationRef.current) { closeSession(session); return; }
      sessionRef.current = session;
      setLocalStream(session.localStream);
      setRemoteStream(session.remoteStream);
      setStatus('connected');
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (generation !== generationRef.current) return;
      setError(e instanceof Error ? e.message : 'Erreur de connexion');
      setStatus('error');
    }
  }, [conversationId, handleDataMessage, handleConnectionStateChange]);

  useEffect(() => () => {
    ++generationRef.current;
    closeSession(sessionRef.current);
    sessionRef.current = null;
    if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
  }, []);

  const stop = useCallback(() => {
    ++generationRef.current;
    playbackResponseRef.current = null;
    toolNamesRef.current.clear();
    setIsResponding(false);
    closeSession(sessionRef.current);
    sessionRef.current = null;
    if (responseTimerRef.current) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsUserSpeaking(false);
    setIsAssistantSpeaking(false);
    setStatus('ended');
  }, []);

  const sendFunctionResult = useCallback((callId: string, result: Record<string, unknown>) => {
    if (!sessionRef.current || !toolNamesRef.current.has(callId)) return;
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    const name = toolNamesRef.current.get(callId);
    if (name) {
      toolNamesRef.current.delete(callId);
      toolActivityHandlerRef.current?.({ name, callId, phase: result.success === false ? 'error' : 'success' });
    }
    scheduleResponse();
  }, [scheduleResponse]);

  const onToolCall = useCallback((handler: ((tool: ToolCall) => void | Promise<void>) | null) => {
    toolCallHandlerRef.current = handler;
  }, []);

  const onToolActivity = useCallback((handler: ((activity: ToolActivity) => void) | null) => {
    toolActivityHandlerRef.current = handler;
  }, []);

  const onTranscript = useCallback((handler: ((event: TranscriptEvent) => void) | null) => {
    transcriptHandlerRef.current = handler;
  }, []);

  const injectSystemMessage = useCallback((text: string) => {
    if (!sessionRef.current) return;
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text }],
      },
    });
  }, []);

  const requestResponse = useCallback(() => {
    if (!sessionRef.current) return;
    sendDataChannelEvent(sessionRef.current.dc, { type: 'response.create' });
  }, []);

  const sendUserText = useCallback((text: string) => {
    if (!sessionRef.current) return;
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    sendDataChannelEvent(sessionRef.current.dc, { type: 'response.create' });
  }, []);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const shouldMute = !isMuted;
    session.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !shouldMute;
    });
    setIsMuted(shouldMute);
    if (shouldMute) setIsUserSpeaking(false);
  }, [isMuted]);

  return {
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
  };
}

