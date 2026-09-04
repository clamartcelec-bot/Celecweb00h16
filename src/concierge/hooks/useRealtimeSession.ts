import { useState, useRef, useCallback } from 'react';
import {
  requestMicrophone,
  createRealtimeSession,
  closeSession,
  sendDataChannelEvent,
  type WebRTCSession,
  type DataChannelMessage,
} from '../services/webrtc';

export type ConnectionStatus = 'idle' | 'requesting-mic' | 'connecting' | 'connected' | 'error' | 'ended';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export function useRealtimeSession() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  const sessionRef = useRef<WebRTCSession | null>(null);
  const toolCallHandlerRef = useRef<((tool: ToolCall) => void) | null>(null);
  const pendingArgsRef = useRef<Map<string, string>>(new Map());
  const processedCallsRef = useRef<Set<string>>(new Set());

  const dispatchToolCall = useCallback((callId: string, name: string, argsStr: string) => {
    if (!callId || !name || processedCallsRef.current.has(callId)) return;

    try {
      const args = JSON.parse(argsStr || '{}') as Record<string, unknown>;
      processedCallsRef.current.add(callId);
      toolCallHandlerRef.current?.({ name, arguments: args, callId });
    } catch {
      console.error('Failed to parse tool call args:', argsStr);
    }
  }, []);

  const handleDataMessage = useCallback((msg: DataChannelMessage) => {
    const type = msg.type as string;

    if (type === 'session.created' || type === 'session.updated') {
      console.log('Session ready:', type);
    }

    if (type === 'input_audio_buffer.speech_started') setIsUserSpeaking(true);
    if (type === 'input_audio_buffer.speech_stopped') setIsUserSpeaking(false);
    if (type === 'response.output_audio.delta') setIsAssistantSpeaking(true);
    if (type === 'response.output_audio.done' || type === 'response.done') setIsAssistantSpeaking(false);

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
      setIsUserSpeaking(false);
      setIsAssistantSpeaking(false);
      setStatus('ended');
    }
  }, []);

  const start = useCallback(async () => {
    closeSession(sessionRef.current);
    sessionRef.current = null;
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
      const msg = e instanceof DOMException && e.name === 'NotAllowedError'
        ? "L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres de votre navigateur."
        : e instanceof DOMException && e.name === 'NotFoundError'
          ? 'Aucun microphone détecté sur cet appareil.'
          : "Impossible d'accéder au microphone.";
      setError(msg);
      setStatus('error');
      return;
    }

    setStatus('connecting');

    try {
      const session = await createRealtimeSession(
        stream,
        handleDataMessage,
        handleConnectionStateChange,
      );
      sessionRef.current = session;
      setStatus('connected');
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setError(e instanceof Error ? e.message : 'Erreur de connexion');
      setStatus('error');
    }
  }, [handleDataMessage, handleConnectionStateChange]);

  const stop = useCallback(() => {
    closeSession(sessionRef.current);
    sessionRef.current = null;
    setIsUserSpeaking(false);
    setIsAssistantSpeaking(false);
    setStatus('ended');
  }, []);

  const sendFunctionResult = useCallback((callId: string, result: Record<string, unknown>) => {
    if (!sessionRef.current) return;
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    sendDataChannelEvent(sessionRef.current.dc, {
      type: 'response.create',
    });
  }, []);

  const onToolCall = useCallback((handler: ((tool: ToolCall) => void) | null) => {
    toolCallHandlerRef.current = handler;
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
    start,
    stop,
    toggleMute,
    sendFunctionResult,
    onToolCall,
    injectSystemMessage,
    requestResponse,
  };
}
