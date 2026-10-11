import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ArrowLeft, BookOpen, Loader2, RotateCcw, Search, Shuffle, X } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';
import { EntryCard } from '@/site/components/EntryCard';
import { buildMix, searchCarnet, topicCounts, type MixSegment } from '@/site/carnetMix';
import { TOPICS, topicById, topicsOf } from '@/site/taxonomy';
import { fmtDate, type Photo } from '@/site/types';

const STEP = 12;
const BENTO = ['s-bento-xl', '', 's-bento-tall', '', 's-bento-wide', '', '', 's-bento-tall', '', 's-bento-wide'];

interface Props {
  t: Copy;
  photos: Photo[];
  status: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  topic: string | null;
  onTopic: (topic: string | null) => void;
  query: string;
  onQuery: (query: string) => void;
  onOpen: (entry: Photo) => void;
}

export function CarnetPage({ t, photos, status, onRetry, topic, onTopic, query, onQuery, onOpen }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [shown, setShown] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const history = useRef<(string | null)[]>([]);
  const prevTopic = useRef(topic);
  const goingBack = useRef(false);

  const searching = query.trim().length >= 2;
  const segments = useMemo<MixSegment[]>(
    () => (searching ? [{ key: 'search', label: null, items: searchCarnet(topic ? photos.filter((p) => topicsOf(p).includes(topic)) : photos, query) }] : buildMix(photos, topic, seed)),
    [photos, topic, seed, query, searching],
  );
  const total = segments.reduce((n, s) => n + s.items.length, 0);
  const counts = useMemo(() => topicCounts(photos), [photos]);
  const chips = useMemo(() => TOPICS.filter((tp) => (counts.get(tp.id) ?? 0) > 0).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)), [counts]);
  const focus = topic ? topicById(topic) : null;
  const done = shown >= total;

  useEffect(() => {
    if (prevTopic.current !== topic) {
      if (!goingBack.current) history.current.push(prevTopic.current);
      goingBack.current = false;
      prevTopic.current = topic;
      setShown(STEP);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [topic]);

  useEffect(() => setShown(STEP), [query]);

  useEffect(() => {
    if (done || status !== 'ready') return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((items) => { if (items[0].isIntersecting) setShown((n) => n + STEP); }, { rootMargin: '500px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [done, status, shown]);

  const back = () => {
    goingBack.current = true;
    onTopic(history.current.pop() ?? null);
  };

  let budget = shown;
  let cellIndex = 0;

  return (
    <div className="s-page s-page--wide">
      <PageIntro eyebrow={<><BookOpen size={14} /> CELEC</>} title={t.carnetTitle} lead={t.carnetPageLead} />

      <label className={`s-cx-search ${searching ? 'is-on' : ''}`} data-robot-target="carnet-search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher une réalisation : éclairage LED bureaux, tableau, Legrand, Clamart…"
          aria-label="Rechercher dans le carnet"
        />
        {query && <button type="button" onClick={() => onQuery('')} aria-label="Effacer la recherche"><X size={16} /></button>}
      </label>

      <div className="s-cx-bar" role="toolbar" aria-label="Filtrer le Carnet par sujet">
        <button className={`s-cx-chip ${!topic ? 'is-on' : ''}`} onClick={() => onTopic(null)}>Tout</button>
        {chips.map((tp) => (
          <button key={tp.id} data-robot-target={`topic-${tp.id}`} className={`s-cx-chip ${topic === tp.id ? 'is-on' : ''}`} onClick={() => onTopic(tp.id)} aria-pressed={topic === tp.id}>
            {tp.name}<em>{counts.get(tp.id)}</em>
          </button>
        ))}
      </div>

      <div className="s-cx-head">
        {searching ? (
          <div className="s-cx-focus" aria-live="polite">
            <strong>{total ? `${total} réalisation${total > 1 ? 's' : ''} pour « ${query.trim()} »` : `Aucune réalisation pour « ${query.trim()} »`}</strong>
            <span>{total ? 'Les plus proches de votre recherche en premier.' : 'Essayez un autre mot : une marque, un type de travaux ou une commune.'}</span>
          </div>
        ) : focus ? (
          <>
            <button className="s-cx-back" onClick={back}><ArrowLeft size={15} /> Retour</button>
            <div className="s-cx-focus">
              <strong>{focus.name}</strong>
              <span>{focus.summary}</span>
            </div>
          </>
        ) : (
          <button className="s-cx-back" onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setShown(STEP); }} disabled={status !== 'ready' || photos.length === 0}>
            <Shuffle size={15} /> Autre sélection
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={searching ? `q-${query.trim()}` : `${topic ?? 'all'}-${seed}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {!searching && focus && segments[0].items.length === 0 && status === 'ready' && (
            <div className="s-empty s-cx-empty"><BookOpen size={20} /><p>Pas encore de billet publié sur « {focus.name} ». Voici des sujets voisins.</p></div>
          )}
          {segments.map((seg, si) => {
            if (budget <= 0) return null;
            const items = seg.items.slice(0, budget);
            budget -= items.length;
            return (
              <Fragment key={seg.key}>
                {seg.label && si > 0 && (
                  <div className="s-cx-divider">
                    <span>Sujet voisin</span>
                    <button onClick={() => onTopic(seg.key)}>{seg.label}</button>
                  </div>
                )}
                <div className="s-bento">
                  {items.map((entry, i) => {
                    const pattern = BENTO[i % BENTO.length];
                    cellIndex++;
                    return (
                      <motion.div
                        key={entry.id}
                        data-robot-target={`entry-${entry.id}`}
                        className={`s-bento-cell ${pattern}`}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '0px 0px -8% 0px' }}
                        transition={{ duration: 0.8, ease: EASE_OUT, delay: (cellIndex % 4) * 0.05 }}
                      >
                        <EntryCard entry={entry} cta={t.readEntry} onOpen={onOpen} showDescription={pattern === 's-bento-xl'} meta={`${entry.city || 'CELEC'} · ${fmtDate(entry.created_at)}`} />
                      </motion.div>
                    );
                  })}
                </div>
              </Fragment>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <div ref={sentinel} className="s-page-status">
        {status === 'loading' && <span className="s-loader"><Loader2 size={18} className="s-spin" /></span>}
        {status === 'error' && (
          <div className="s-state s-state--error">
            <AlertCircle size={18} />
            <span>{t.carnetError}</span>
            <button className="s-btn s-btn--outline s-btn--sm" onClick={onRetry}><RotateCcw size={14} /> {t.retry}</button>
          </div>
        )}
        {status === 'ready' && done && (
          photos.length === 0 || (searching && total === 0) ? (
            searching ? null :
            <span className="s-state">{t.carnetEmpty}</span>
          ) : focus ? (
            <div className="s-cx-end">
              <strong>Vous avez fait le tour de « {focus.name} » et de ses sujets voisins.</strong>
              <div>
                <button className="s-btn s-btn--outline s-btn--sm" onClick={back}><ArrowLeft size={14} /> Retour</button>
                <button className="s-btn s-btn--primary s-btn--sm" onClick={() => onTopic(null)}>Tout le Carnet</button>
              </div>
            </div>
          ) : (
            <span className="s-state">{t.carnetEnd}</span>
          )
        )}
      </div>
    </div>
  );
}
