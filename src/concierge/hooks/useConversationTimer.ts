import { useState, useEffect, useRef, useCallback } from 'react';

interface TimerState {
  elapsed: number;
  formatted: string;
  warningLevel: 'none' | 'approaching' | 'ending';
}

const WARNING_TIME = 8 * 60;
const VISUAL_WARNING_TIME = 9 * 60 + 30;
const CUTOFF_TIME = 10 * 60;

export function useConversationTimer(
  isActive: boolean,
  onApproachingEnd: () => void,
  onCutoff: () => void,
) {
  const [state, setState] = useState<TimerState>({
    elapsed: 0,
    formatted: '0:00',
    warningLevel: 'none',
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const approachingFiredRef = useRef(false);
  const cutoffFiredRef = useRef(false);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    approachingFiredRef.current = false;
    cutoffFiredRef.current = false;
    setState({ elapsed: 0, formatted: '0:00', warningLevel: 'none' });
  }, []);

  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      approachingFiredRef.current = false;
      cutoffFiredRef.current = false;

      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;

        let warningLevel: TimerState['warningLevel'] = 'none';
        if (elapsed >= VISUAL_WARNING_TIME) {
          warningLevel = 'ending';
        } else if (elapsed >= WARNING_TIME) {
          warningLevel = 'approaching';
        }

        setState({
          elapsed,
          formatted: `${mins}:${secs.toString().padStart(2, '0')}`,
          warningLevel,
        });

        if (elapsed >= WARNING_TIME && !approachingFiredRef.current) {
          approachingFiredRef.current = true;
          onApproachingEnd();
        }

        if (elapsed >= CUTOFF_TIME && !cutoffFiredRef.current) {
          cutoffFiredRef.current = true;
          onCutoff();
        }
      }, 1000);
    } else {
      reset();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, onApproachingEnd, onCutoff, reset]);

  return { ...state, reset };
}
