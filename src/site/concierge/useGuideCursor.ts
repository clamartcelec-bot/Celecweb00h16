import { useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, type MotionValue } from 'motion/react';
import type { Guide } from './conciergeTools';
import type { GuideHandlers } from './useRobotGuide';

export interface CursorState { x: MotionValue<number>; y: MotionValue<number>; active: boolean; pressing: boolean }

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function target(name: string) {
  const el = document.querySelector<HTMLElement>(`[data-robot-target="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
}

async function waitFor(name: string, alive: () => boolean, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end && alive()) {
    const el = target(name);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

/** Point-curseur de la V2 : vole vers la cible, pulse le clic, déclenche l'action. */
export function useGuideCursor(guide: Guide | null, done: (id: number) => void, handlers: GuideHandlers, reduce: boolean): CursorState {
  const x = useMotionValue(-40);
  const y = useMotionValue(-40);
  const [active, setActive] = useState(false);
  const [pressing, setPressing] = useState(false);
  const latest = useRef({ handlers, done, reduce });
  latest.current = { handlers, done, reduce };

  useEffect(() => {
    if (!guide) return;
    let alive = true;
    const isAlive = () => alive;
    const { reduce: still } = latest.current;
    const size = 34;

    const fly = async (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const tx = clamp(r.left + r.width / 2 - size / 2, 8, window.innerWidth - size - 8);
      const ty = clamp(r.top + r.height / 2 - size / 2, 8, window.innerHeight - size - 8);
      if (still) { x.set(tx); y.set(ty); return; }
      const spring = { type: 'spring', stiffness: 130, damping: 19 } as const;
      await Promise.all([animate(x, tx, spring), animate(y, ty, spring)]);
    };

    const press = async (el: HTMLElement) => {
      setPressing(true);
      el.classList.remove('is-robot-press');
      void el.offsetWidth;
      el.classList.add('is-robot-press');
      await sleep(340);
      setPressing(false);
      window.setTimeout(() => el.classList.remove('is-robot-press'), 500);
    };

    const reach = async (name: string, scroll = true) => {
      const el = await waitFor(name, isAlive);
      if (!el || !alive) return null;
      if (scroll) {
        const r = el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 40) {
          el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
          await sleep(still ? 0 : 550);
        }
      }
      if (!alive) return null;
      await fly(el);
      return alive ? el : null;
    };

    (async () => {
      setActive(true);
      const h = () => latest.current.handlers;

      if (guide.topic) {
        const chip = await reach(`topic-${guide.topic}`, false);
        if (chip) {
          chip.scrollIntoView({ block: 'nearest', inline: 'center' });
          await press(chip);
        }
        if (!alive) return;
        h().topic(guide.topic);
        await sleep(400);
      }

      if (guide.search) {
        await reach('carnet-search');
        if (!alive) return;
        h().type('');
        for (let i = 1; i <= guide.search.length && alive; i++) {
          h().type(guide.search.slice(0, i));
          await sleep(still ? 0 : 45 + Math.random() * 40);
        }
        await sleep(650);
      }

      if (guide.entryId) {
        const cell = await reach(`entry-${guide.entryId}`);
        if (cell) await press(cell);
        if (alive) h().openEntry(guide.entryId);
      } else if (guide.search) {
        const first = document.querySelector<HTMLElement>('.s-bento-cell');
        if (first && alive) {
          first.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
          await sleep(still ? 0 : 500);
          await fly(first);
          first.classList.add('is-robot-pick');
          window.setTimeout(() => first.classList.remove('is-robot-pick'), 3200);
          await sleep(900);
        }
      }

      if (guide.partnerId) {
        const card = await reach(`partner-${guide.partnerId}`);
        if (card) await press(card);
        if (alive) h().openPartner(guide.partnerId);
      }
    })().finally(() => {
      if (!alive) return;
      setActive(false);
      latest.current.done(guide.id);
    });

    return () => {
      alive = false;
      setActive(false);
      setPressing(false);
    };
  }, [guide, x, y]);

  return { x, y, active, pressing };
}
