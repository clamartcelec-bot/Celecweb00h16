import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import type { Copy } from '@/site/content';
import { KIND_COLORS, MAP_KINDS, isWorksite, type MapKind, type MapTheme } from '@/site/map/mapData';
import { coneSvg } from '@/site/map/mapIcons';

export function KindMark({ kind }: { kind: MapKind }) {
  if (isWorksite(kind)) {
    return <span className="mx-mark mx-mark--cone" dangerouslySetInnerHTML={{ __html: coneSvg(KIND_COLORS[kind], 14) }} />;
  }
  return <span className="mx-mark" style={{ ['--k' as string]: KIND_COLORS[kind] }} />;
}

export function MapFilters({
  t,
  kinds,
  kindCounts,
  theme,
  themes,
  onKind,
  onTheme,
  onReset,
}: {
  t: Copy;
  kinds: MapKind[];
  kindCounts: Record<MapKind, number>;
  theme: MapTheme | null;
  themes: { theme: MapTheme; count: number }[];
  onKind: (k: MapKind) => void;
  onTheme: (th: MapTheme | null) => void;
  onReset: () => void;
}) {
  const filtered = kinds.length > 0 || theme !== null;
  return (
    <div className="mx-filters" role="toolbar">
      <motion.button whileTap={{ scale: 0.95 }} className="mx-chip" data-on={!filtered || undefined} onClick={onReset}>
        {t.mapAll}
      </motion.button>
      {MAP_KINDS.map((k) => (
        <motion.button
          key={k}
          whileTap={{ scale: 0.95 }}
          className="mx-chip"
          data-on={kinds.includes(k) || undefined}
          data-empty={kindCounts[k] === 0 || undefined}
          aria-pressed={kinds.includes(k)}
          onClick={() => onKind(k)}
        >
          <KindMark kind={k} />
          {t.mapKinds[k]}
          <em>{kindCounts[k]}</em>
        </motion.button>
      ))}
      {themes.length > 0 && <span className="mx-sep" aria-hidden />}
      {themes.map(({ theme: th, count }) => (
        <motion.button
          key={th}
          whileTap={{ scale: 0.95 }}
          className="mx-chip mx-chip--theme"
          data-on={theme === th || undefined}
          aria-pressed={theme === th}
          onClick={() => onTheme(theme === th ? null : th)}
        >
          {t.mapThemes[th]}
          <em>{count}</em>
        </motion.button>
      ))}
      {filtered && (
        <motion.button
          className="mx-chip mx-chip--reset"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={onReset}
          aria-label={t.mapReset}
          title={t.mapReset}
        >
          <RotateCcw size={14} />
        </motion.button>
      )}
    </div>
  );
}
