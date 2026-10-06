import { useLayoutEffect, useState } from 'react';

type Placement = { x: number; y: number; width: number; progress: number; mode: 'hero' | 'presenting' | 'docked' | 'full'; ready: boolean };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** Follow a real page anchor; a single voice-driven character travels between positions. */
export function useGuidePlacement(embedded: boolean, presenting: boolean, page: string) {
  const [placement, setPlacement] = useState<Placement>({ x: 0, y: 0, width: 240, progress: 0, mode: 'hero', ready: false });
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const mobile = viewportWidth <= 760;
      const stage = presenting && embedded ? document.getElementById('ce-live-presentation')?.getBoundingClientRect() : undefined;
      const anchor = document.querySelector<HTMLElement>(embedded ? '.ce-guide-anchor' : '.ce-full-guide-anchor')?.getBoundingClientRect();
      const width = mobile ? 122 : 170;
      let next: Placement = { x: viewportWidth - width - (mobile ? 10 : 24), y: Math.max(100, viewportHeight - width * 458 / 552 - (mobile ? 30 : 55)), width, progress: 1, mode: 'docked', ready: true };
      if (!embedded) {
        next = { x: anchor?.left ?? 24, y: anchor?.top ?? 130, width: anchor?.width ?? (mobile ? 92 : 225), progress: 0, mode: 'full', ready: true };
      } else if (stage && !mobile && stage.height > 0 && stage.top < viewportHeight - 100 && stage.bottom > 280) {
        next = { x: Math.max(18, stage.left), y: Math.max(185, Math.min(stage.top + 170, viewportHeight - 230)), width: 225, progress: 0, mode: 'presenting', ready: true };
      } else if (anchor) {
        const pageTop = anchor.top + window.scrollY;
        const departure = Math.max(0, pageTop - viewportHeight * .72);
        const progress = clamp((window.scrollY - departure) / Math.max(360, viewportHeight * .65));
        // First drift sideways, then descend. Both phases reverse with the scroll.
        const sideways = smooth(progress / .8);
        const downward = smooth((progress - .18) / .82);
        const startY = window.scrollY < departure ? anchor.top : pageTop - departure;
        next = { x: mix(anchor.left, next.x, sideways), y: mix(startY, next.y, downward), width: mix(anchor.width, width, smooth(progress)), progress, mode: progress < 1 ? 'hero' : 'docked', ready: true };
      }
      setPlacement(previous => Math.abs(previous.x - next.x) < .5 && Math.abs(previous.y - next.y) < .5 && Math.abs(previous.width - next.width) < .5 && previous.progress === next.progress && previous.mode === next.mode && previous.ready ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    measure();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [embedded, presenting, page]);
  return placement;
}

// App changes its route content independently of the persistent concierge.
export function usePresentationTarget(embedded: boolean, page: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!embedded) { setTarget(null); return; }
    const find = () => setTarget(document.getElementById('ce-live-presentation'));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [embedded, page]);
  return target;
}
