import { useEffect, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, FileText, History, Loader2, MessageSquare, Mic, PhoneCall, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Copy } from '@/site/content';
import type { Lang } from '@/site/types';
import { EASE_OUT, EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { HomeRobot } from '@/site/components/HomeRobot';

interface FeedItem {
  id: string;
  kind: 'request' | 'exchange';
  title: string;
  date: string;
  status?: string;
}

interface Activity {
  feed: FeedItem[];
  open: number;
  exchanges: number;
  invoices: number;
  since: string | null;
}

const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ar: 'ar' };
const CLOSED = new Set(['done']);

function useClientActivity() {
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) { setFailed(true); return; }
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) { if (active) setFailed(true); return; }
      const [req, ex, inv] = await Promise.all([
        supabase.from('requests').select('id, category, description, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('exchanges').select('id, summary, happened_at').eq('user_id', user.id).order('happened_at', { ascending: false }).limit(12),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (!active) return;
      if (req.error || ex.error) { setFailed(true); return; }
      const requests = req.data ?? [];
      const exchanges = ex.data ?? [];
      const feed: FeedItem[] = [
        ...requests.map((r) => ({ id: `r-${r.id}`, kind: 'request' as const, title: r.description?.trim() || r.category, date: r.created_at, status: r.status })),
        ...exchanges.map((e) => ({ id: `e-${e.id}`, kind: 'exchange' as const, title: e.summary, date: e.happened_at })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
      setData({
        feed,
        open: requests.filter((r) => !CLOSED.has(r.status)).length,
        exchanges: exchanges.length,
        invoices: inv.count ?? 0,
        since: user.created_at ?? null,
      });
    })();
    return () => { active = false; };
  }, []);

  return { data, failed };
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const controls = animate(0, value, { duration: 1.4, ease: EASE_OUT, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{shown}</>;
}

function Tile({ icon, title, text, tone, onClick }: { icon: ReactNode; title: string; text: string; tone: 'accent' | 'ion' | 'sand' | 'ink'; onClick: () => void }) {
  const track = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <motion.button
      className={`s-me-tile s-me-tile--${tone}`}
      variants={fadeUp}
      onClick={onClick}
      onPointerMove={track}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <span className="s-me-tile-glow" aria-hidden="true" />
      <span className="s-me-tile-icon">{icon}</span>
      <span className="s-me-tile-copy">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <ArrowUpRight size={18} className="s-me-tile-go" />
    </motion.button>
  );
}

interface Props {
  t: Copy;
  lang: Lang;
  name: string;
  onConcierge: (origin?: { x: number; y: number }) => void;
  onCallback: () => void;
  onHistory: () => void;
  onRequest: () => void;
}

export function ClientHome({ t, lang, name, onConcierge, onCallback, onHistory, onRequest }: Props) {
  const { data, failed } = useClientActivity();
  const reduce = useReducedMotion();
  const locale = LOCALES[lang];
  const now = new Date();
  const hello = now.getHours() >= 18 ? t.me.evening : t.me.morning;
  const today = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const robotLines = useMemo(() => t.me.robotLines.map((l) => l.replace('{name}', name)), [t, name]);
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const stats = data
    ? [
        { value: data.open, label: t.me.open },
        { value: data.exchanges, label: t.me.exchanges },
        { value: data.invoices, label: t.me.invoices },
      ]
    : [];

  return (
    <section className="s-me">
      <div className="s-me-aura" aria-hidden="true">
        <span className="s-aura s-aura--rose" />
        <span className="s-aura s-aura--ion" />
        <span className="s-aura s-aura--sand" />
        <svg className="s-me-orbit" viewBox="0 0 600 600">
          <circle cx="300" cy="300" r="220" />
          <circle cx="300" cy="300" r="290" />
        </svg>
      </div>

      <div className="s-me-top">
        <motion.div className="s-me-copy" variants={stagger(0.09, 0.15)} initial="hidden" animate="show">
          <motion.span className="s-eyebrow" variants={fadeUp}>
            <span className="s-acct-live s-acct-live--inline" />
            {t.me.eyebrow} · <span className="s-me-date">{today}</span>
          </motion.span>

          <h1 className="s-me-title">
            <motion.span className="s-me-hello" variants={fadeUp}>{hello},</motion.span>
            <span className="s-me-name" aria-label={name}>
              {Array.from(name).map((ch, i) => (
                <motion.span
                  key={`${ch}-${i}`}
                  aria-hidden="true"
                  initial={reduce ? false : { opacity: 0, y: '0.5em', rotate: 8, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, rotate: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.45 + i * 0.045, duration: 0.8, ease: EASE_SOFT }}
                >
                  {ch === ' ' ? '\u00a0' : ch}
                </motion.span>
              ))}
              <motion.span
                className="s-me-underline"
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.9 + name.length * 0.04, duration: 1, ease: EASE_SOFT }}
              />
            </span>
            <motion.em className="s-accent s-me-home" variants={fadeUp}>{t.me.home}</motion.em>
          </h1>

          <motion.p className="s-me-lead" variants={fadeUp}>{t.me.lead}</motion.p>

          <motion.div className="s-me-stats" variants={fadeUp}>
            {data ? (
              stats.map((s) => (
                <div className="s-me-stat" key={s.label}>
                  <strong><CountUp value={s.value} /></strong>
                  <span>{s.label}</span>
                </div>
              ))
            ) : (
              <span className="s-me-stat-wait">
                {failed ? t.me.error : <><Loader2 size={14} className="s-spin" />{t.me.loading}</>}
              </span>
            )}
            {data?.since && (
              <div className="s-me-stat s-me-stat--since">
                <span>{t.me.since}</span>
                <strong>{new Date(data.since).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong>
              </div>
            )}
          </motion.div>
        </motion.div>

        <div className="s-me-robot">
          <HomeRobot lines={robotLines} cta={t.me.robotCta} hint={t.me.robotHint} onEnter={onConcierge} />
        </div>
      </div>

      <motion.div className="s-me-tiles" variants={stagger(0.08, 0.5)} initial="hidden" animate="show">
        <Tile tone="accent" icon={<PhoneCall size={20} />} title={t.me.callback} text={t.me.callbackText} onClick={onCallback} />
        <Tile tone="ink" icon={<History size={20} />} title={t.me.history} text={t.me.historyText} onClick={onHistory} />
        <Tile tone="ion" icon={<Mic size={20} />} title={t.me.concierge} text={t.me.conciergeText} onClick={() => onConcierge()} />
        <Tile tone="sand" icon={<Plus size={20} />} title={t.me.request} text={t.me.requestText} onClick={onRequest} />
      </motion.div>

      <motion.div className="s-me-feed" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={viewportOnce} transition={{ duration: 0.9, ease: EASE_OUT }}>
        <div className="s-me-feed-head">
          <h2>{t.me.activity}</h2>
          <button className="s-me-feed-all" onClick={onHistory}>
            {t.me.seeAll} <ArrowUpRight size={15} />
          </button>
        </div>

        {data && data.feed.length === 0 && <p className="s-me-feed-empty">{t.me.empty}</p>}
        {!data && failed && <p className="s-me-feed-empty">{t.me.error}</p>}

        {data && data.feed.length > 0 && (
          <motion.ol className="s-me-timeline" variants={stagger(0.07)} initial="hidden" whileInView="show" viewport={viewportOnce}>
            <motion.span
              className="s-me-rail"
              aria-hidden="true"
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={viewportOnce}
              transition={{ duration: 1.4, ease: EASE_SOFT }}
            />
            {data.feed.map((item) => (
              <motion.li key={item.id} className={`s-me-event s-me-event--${item.kind}`} variants={fadeUp}>
                <span className="s-me-event-node">
                  {item.kind === 'request' ? <FileText size={14} /> : <MessageSquare size={14} />}
                </span>
                <div className="s-me-event-body">
                  <span className="s-me-event-meta">
                    {item.kind === 'request' ? t.me.requestLabel : t.me.exchangeLabel} · {fmt(item.date)}
                  </span>
                  <p>{item.title}</p>
                </div>
                {item.status && (
                  <span className={`s-me-pill s-me-pill--${item.status}`}>{t.me.status[item.status] ?? item.status}</span>
                )}
              </motion.li>
            ))}
          </motion.ol>
        )}
      </motion.div>
    </section>
  );
}
