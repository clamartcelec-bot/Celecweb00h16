import { useLayoutEffect, useState } from 'react';

import { guidePlacement, type Placement } from './guidePlacement';

/** One persistent character, constrained to the actual visible screen. */
export function useGuidePlacement(embedded: boolean, presenting: boolean, page: string) {
  const [placement, setPlacement] = useState<Placement & { ready: boolean; viewportRevision: number }>({ x: 0, y: 0, width: 122, progress: 0, mode: 'hero', ready: false, viewportRevision: 0 });
  useLayoutEffect(() => {
    let frame = 0;
    let viewportRevision = 0;
    const measure = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const header = document.querySelector('.hdr')?.getBoundingClientRect();
      const next = guidePlacement({
        viewportWidth: viewport?.width ?? window.innerWidth,
        viewportHeight: viewport?.height ?? window.innerHeight,
        viewportLeft: viewport?.offsetLeft ?? 0, viewportTop: top,
        headerBottom: header?.bottom ?? top + 72,
        scrollY: window.scrollY, embedded,
        anchor: document.querySelector<HTMLElement>(embedded ? '.ce-guide-anchor' : '.ce-full-guide-anchor')?.getBoundingClientRect(),
        stage: presenting && embedded ? document.getElementById('ce-live-presentation')?.getBoundingClientRect() : undefined,
      });
      setPlacement({ ...next, ready: true, viewportRevision });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = () => { viewportRevision++; measure(); };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    measure();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
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
