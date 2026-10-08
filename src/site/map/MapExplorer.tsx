import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2, RotateCcw } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { coverOf, type Photo } from '@/site/types';
import { MapCanvas } from '@/site/map/MapCanvas';
import { MapFilters, KindMark } from '@/site/map/MapFilters';
import { MapPanel } from '@/site/map/MapPanel';
import { countKinds, toMapPoints, topThemes, type MapKind, type MapPoint, type MapTheme } from '@/site/map/mapData';

function useNarrow() {
  const query = '(max-width: 720px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setNarrow(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}

const distance = (a: MapPoint, b: MapPoint) => (a.lat - b.lat) ** 2 + ((a.lng - b.lng) * 0.66) ** 2;

export function MapExplorer({
  t,
  photos,
  variant,
  onOpen,
  onExpand,
}: {
  t: Copy;
  photos: Photo[];
  variant: 'home' | 'page';
  onOpen: (p: Photo) => void;
  onExpand?: () => void;
}) {
  const narrow = useNarrow();
  const all = useMemo(() => toMapPoints(photos), [photos]);
  const kindCounts = useMemo(() => countKinds(all), [all]);
  const themes = useMemo(() => topThemes(all), [all]);
  const [kinds, setKinds] = useState<MapKind[]>([]);
  const [theme, setTheme] = useState<MapTheme | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState<MapPoint[]>([]);

  const points = useMemo(
    () => all.filter((p) => (kinds.length === 0 || kinds.includes(p.kind)) && (!theme || p.themes.includes(theme))),
    [all, kinds, theme],
  );
  const selected = points.find((p) => p.id === selectedId) ?? null;

  const strip = useMemo(() => {
    const list = visible.filter((p) => p.id !== selected?.id);
    if (selected) list.sort((a, b) => distance(a, selected) - distance(b, selected));
    else list.sort((a, b) => b.entry.created_at.localeCompare(a.entry.created_at));
    return list.slice(0, 14);
  }, [visible, selected]);

  const toggleKind = (k: MapKind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const reset = () => { setKinds([]); setTheme(null); };
  const select = useCallback((p: MapPoint | null) => setSelectedId(p?.id ?? null), []);

  const showStrip = strip.length > 0 && !(narrow && selected);

  return (
    <div className={`mx mx--${variant}`} data-panel={(selected && !narrow) || undefined}>
      <MapFilters
        t={t}
        kinds={kinds}
        kindCounts={kindCounts}
        theme={theme}
        themes={themes}
        onKind={toggleKind}
        onTheme={setTheme}
        onReset={reset}
      />

      <div className="mx-frame">
        <MapCanvas
          points={points}
          selectedId={selected?.id ?? null}
          immersive={variant === 'page'}
          wheelHint={t.mapWheelHint}
          touchHint={t.mapTouchHint}
          onSelect={select}
          onVisible={setVisible}
        />

        {variant === 'home' && onExpand && (
          <button className="mx-expand" onClick={onExpand}>
            <Maximize2 size={14} /> <span>{t.mapOpen}</span>
          </button>
        )}

        <div className="mx-count" aria-live="polite">
          <b>{visible.length}</b> {t.mapEntries} {t.mapInZone}
        </div>

        {points.length === 0 && (
          <div className="mx-empty">
            <p>{t.mapNoResult}</p>
            <button className="s-btn s-btn--outline s-btn--sm" onClick={reset}><RotateCcw size={14} /> {t.mapReset}</button>
          </div>
        )}

        <AnimatePresence>
          {showStrip && (
            <motion.div
              className="mx-strip"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              {strip.map((p) => {
                const src = coverOf(p.entry);
                return (
                  <motion.button key={p.id} layout="position" className="mx-thumb" onClick={() => select(p)} whileHover={{ y: -3 }}>
                    <span className="mx-thumb-img">
                      {src ? <img src={src} alt="" loading="lazy" /> : <KindMark kind={p.kind} />}
                    </span>
                    <span className="mx-thumb-text">
                      <b>{p.entry.title}</b>
                      <small><KindMark kind={p.kind} /> {p.entry.city}</small>
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {selected && (
            <MapPanel
              key={selected.id}
              t={t}
              point={selected}
              sheet={narrow}
              onClose={() => setSelectedId(null)}
              onOpen={() => onOpen(selected.entry)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
