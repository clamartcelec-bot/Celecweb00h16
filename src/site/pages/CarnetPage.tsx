import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, BookOpen, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';
import { EntryCard } from '@/site/components/EntryCard';
import { fmtDate, type Photo } from '@/site/types';

const PAGE_SIZE = 20;
const BENTO = ['s-bento-xl', '', 's-bento-tall', '', 's-bento-wide', '', '', 's-bento-tall', '', 's-bento-wide'];

export function CarnetPage({ t, onOpen }: { t: Copy; onOpen: (entry: Photo) => void }) {
  const [entries, setEntries] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async () => {
    if (!supabase || loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    const { data, error } = await supabase
      .from('photos')
      .select('*, photo_images(id, image_url, caption, position)')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .range(entries.length, entries.length + PAGE_SIZE - 1);
    setLoading(false);
    if (error || !data) {
      setFailed(true);
      return;
    }
    setEntries((prev) => [...prev, ...data]);
    if (data.length < PAGE_SIZE) setHasMore(false);
  }, [entries.length, loading, hasMore]);

  useEffect(() => {
    if (!supabase) setHasMore(false);
  }, []);

  useEffect(() => {
    if (!hasMore || failed) return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((items) => { if (items[0].isIntersecting) void loadPage(); }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, failed, loadPage]);

  return (
    <div className="s-page">
      <PageIntro eyebrow={<><BookOpen size={14} /> CELEC</>} title={t.carnetTitle} lead={t.carnetPageLead} />

      <div className="s-bento">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            className={`s-bento-cell ${BENTO[i % BENTO.length]}`}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -8% 0px' }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: (i % 4) * 0.06 }}
          >
            <EntryCard
              entry={entry}
              cta={t.readEntry}
              onOpen={onOpen}
              showDescription={i % BENTO.length === 0}
              meta={`${entry.city || 'CELEC'} · ${fmtDate(entry.created_at)}`}
            />
          </motion.div>
        ))}
      </div>

      <div ref={sentinel} className="s-page-status">
        {loading && <span className="s-loader"><Loader2 size={18} className="s-spin" /></span>}
        {failed && (
          <div className="s-state s-state--error">
            <AlertCircle size={18} />
            <span>{t.carnetError}</span>
            <button className="s-btn s-btn--outline s-btn--sm" onClick={() => void loadPage()}><RotateCcw size={14} /> {t.retry}</button>
          </div>
        )}
        {!loading && !failed && !hasMore && (
          <span className="s-state">{entries.length === 0 ? t.carnetEmpty : t.carnetEnd}</span>
        )}
      </div>
    </div>
  );
}
