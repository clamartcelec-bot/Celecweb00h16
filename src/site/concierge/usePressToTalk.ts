import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ConciergeApi } from './useConcierge';

const HOLD_MS = 220;
const CANCEL_DISTANCE = 90;

/** Press-and-hold to talk: a short tap calls onTap, a hold records until release; sliding away cancels. */
export function usePressToTalk(api: ConciergeApi, onTap: () => void) {
  const press = useRef<{ x: number; y: number; timer: number; holding: boolean } | null>(null);
  const keyHeld = useRef(false);
  const [far, setFar] = useState(false);

  const begin = useCallback((x: number, y: number) => {
    api.preconnect();
    const p = { x, y, holding: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.holding = true;
      void api.startTalking();
    }, HOLD_MS);
    press.current = p;
  }, [api]);

  const end = useCallback((send: boolean) => {
    const p = press.current;
    press.current = null;
    setFar(false);
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.holding) api.stopTalking(send);
    else if (send) onTap();
  }, [api, onTap]);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button > 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      begin(e.clientX, e.clientY);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (p?.holding) setFar(Math.hypot(e.clientX - p.x, e.clientY - p.y) > CANCEL_DISTANCE);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const p = press.current;
      end(!(p?.holding && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CANCEL_DISTANCE));
    },
    onPointerCancel: () => end(false),
    onPointerEnter: () => api.preconnect(),
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat || keyHeld.current) return;
      keyHeld.current = true;
      begin(0, 0);
    },
    onKeyUp: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      keyHeld.current = false;
      end(true);
    },
  };

  return { handlers, far };
}
