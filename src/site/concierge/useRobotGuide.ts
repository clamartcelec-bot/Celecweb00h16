import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { animate, type MotionValue } from 'motion/react';
import type { RobotElement } from '@/concierge/robot/controller.js';
import type { Guide } from './conciergeTools';

export interface GuideHandlers {
  go(view: string, family?: string): void;
  topic(id: string): void;
  type(text: string): void;
  openEntry(id: string): void;
  openPartner(id: string): void;
}

interface Body {
  x: MotionValue<number>;
  y: MotionValue<number>;
  w: MotionValue<number>;
  robot: MutableRefObject<RobotElement | null>;
}

const RATIO = 458 / 552;
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

export function useRobotGuide(
  guide: Guide | null,
  done: (id: number) => void,
  body: Body,
  handlers: GuideHandlers,
  where: { page: string; chatOpen: boolean },
  reduce: boolean,
) {
  const [active, setActive] = useState(false);
  const [pressing, setPressing] = useState(false);
  const latest = useRef({ handlers, where, done, body, reduce });
  latest.current = { handlers, where, done, body, reduce };

  useEffect(() => {
    if (!guide) return;
    let alive = true;
    const isAlive = () => alive;
    const { body: b, reduce: still } = latest.current;
    const size = window.innerWidth < 640 ? 76 : 92;

    const fly = async (el: HTMLElement, side: 'below' | 'right' | 'over') => {
      const r = el.getBoundingClientRect();
      const h = size * RATIO;
      let tx = r.left + r.width / 2 - size / 2;
      let ty = r.bottom + 4;
      if (side === 'right') { tx = r.right - size * 0.9; ty = r.top + r.height / 2 - h * 0.5; }
      if (side === 'over') { ty = r.top + r.height / 2 - h / 2; }
      tx = clamp(tx, 8, window.innerWidth - size - 8);
      ty = clamp(ty, 8, window.innerHeight - h - 8);
      if (still) { b.x.set(tx); b.y.set(ty); b.w.set(size); return; }
      const spring = { type: 'spring', stiffness: 130, damping: 19 } as const;
      await Promise.all([animate(b.x, tx, spring), animate(b.y, ty, spring), animate(b.w, size, spring)]);
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

    const reach = async (name: string, side: 'below' | 'right' | 'over', scroll = true) => {
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
      await fly(el, side);
      return alive ? el : null;
    };

    (async () => {
      setActive(true);
      void b.robot.current?.wiggleAntenna?.();
      const h = () => latest.current.handlers;
      const { page, chatOpen } = latest.current.where;

      if (chatOpen || page !== guide.view || guide.view === 'family') {
        const nav = chatOpen ? null : target(guide.view === 'family' ? 'nav-familles' : `nav-${guide.view}`);
        if (nav) {
          await fly(nav, 'below');
          if (!alive) return;
          await press(nav);
        }
        if (!alive) return;
        h().go(guide.view, guide.family);
        await sleep(still ? 50 : 500);
      }

      if (guide.topic) {
        const chip = await reach(`topic-${guide.topic}`, 'below', false);
        if (chip) {
          chip.scrollIntoView({ block: 'nearest', inline: 'center' });
          await press(chip);
        }
        if (!alive) return;
        h().topic(guide.topic);
        await sleep(400);
      }

      if (guide.search) {
        await reach('carnet-search', 'right');
        if (!alive) return;
        h().type('');
        for (let i = 1; i <= guide.search.length && alive; i++) {
          h().type(guide.search.slice(0, i));
          await sleep(still ? 0 : 45 + Math.random() * 40);
        }
        await sleep(650);
      }

      if (guide.entryId) {
        const cell = await reach(`entry-${guide.entryId}`, 'over');
        if (cell) await press(cell);
        if (alive) h().openEntry(guide.entryId);
      } else if (guide.search) {
        const first = document.querySelector<HTMLElement>('.s-bento-cell');
        if (first && alive) {
          first.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
          await sleep(still ? 0 : 500);
          await fly(first, 'over');
          first.classList.add('is-robot-pick');
          window.setTimeout(() => first.classList.remove('is-robot-pick'), 3200);
          await sleep(900);
        }
      }

      if (guide.partnerId) {
        const card = await reach(`partner-${guide.partnerId}`, 'over');
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
  }, [guide]);

  return { active, pressing };
}
