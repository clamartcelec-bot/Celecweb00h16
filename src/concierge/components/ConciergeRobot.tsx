import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import '@/concierge/robot/controller.js';
import type { RobotElement, RobotState } from '@/concierge/robot/controller.js';
import type { ConnectionStatus, ToolActivity } from '@/concierge/hooks/useRealtimeSession';

export interface ConciergeRobotHandle {
  setAudioAmplitude(value: number): void;
}
interface Props {
  status: ConnectionStatus;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
  isResponding: boolean;
  toolActivity: ToolActivity | null;
}

/** A single persistent instance: gestures never replace the voice-driven mouth. */
export const ConciergeRobot = forwardRef<ConciergeRobotHandle, Props>(function ConciergeRobot(
  { status, isUserSpeaking, isAssistantSpeaking, isResponding, toolActivity }, ref,
) {
  const element = useRef<RobotElement | null>(null);
  const previousMode = useRef<RobotState | null>(null);
  const greeted = useRef(false);
  const speaking = useRef(false);
  const [expiredActivity, setExpiredActivity] = useState<string | null>(null);
  speaking.current = status === 'connected' && isAssistantSpeaking;

  useImperativeHandle(ref, () => ({
    setAudioAmplitude(value) {
      element.current?.setAmplitude(speaking.current ? value : 0);
    },
  }), []);

  useEffect(() => {
    if (status !== 'connected') { greeted.current = false; setExpiredActivity(null); }
  }, [status]);

  useEffect(() => {
    if (!toolActivity || status !== 'connected') return;
    if (toolActivity.phase === 'started') return;
    const timer = window.setTimeout(() => setExpiredActivity(toolActivity.callId), 1300);
    return () => window.clearTimeout(timer);
  }, [toolActivity, status]);

  const reaction = toolActivity && toolActivity.phase !== 'started' && expiredActivity !== toolActivity.callId
    ? toolActivity.phase : null;
  const mode: RobotState = status === 'error' ? 'error'
    : status === 'connecting' || status === 'requesting-mic' ? 'thinking'
    : status !== 'connected' ? 'idle'
    : isAssistantSpeaking ? 'speaking'
    : isUserSpeaking ? 'listening'
    : reaction ?? (isResponding || toolActivity?.phase === 'started' ? 'thinking' : 'listening');

  useEffect(() => {
    const robot = element.current;
    if (!robot) return;
    if (previousMode.current !== mode) {
      robot.setState(mode);
      previousMode.current = mode;
    }
    if (!isAssistantSpeaking) robot.setAmplitude(0);
    if (status === 'connected' && isAssistantSpeaking && !greeted.current) {
      greeted.current = true;
      robot.setPose({ browLeft: 0.55, browRight: 0.65, happy: 0 });
      void robot.greet();
    }
  }, [mode, status, isAssistantSpeaking]);

  useEffect(() => {
    const robot = element.current;
    if (!robot || !toolActivity || status !== 'connected') return;
    if (toolActivity.phase === 'started') {
      void robot.wiggleAntenna();
    } else if (toolActivity.phase === 'success') {
      if (toolActivity.name === 'submit_request') void robot.tipHat();
      else if (toolActivity.name === 'show_carnet_entries' || toolActivity.name === 'show_brand') void robot.hands();
      else void robot.nod();
    } else {
      robot.setPose({ browLeft: 0.5, browRight: -0.2, headTilt: -4 });
    }
  }, [toolActivity, status]);

  return createElement('robot-majordome', {
    ref: element,
    class: 'concierge-robot',
    label: 'Le petit robot électricien CELEC',
    'auto-blink': '',
    'no-toolbox': '',
    'no-shadow': '',
    'data-mode': mode,
    'aria-hidden': true,
  });
});
