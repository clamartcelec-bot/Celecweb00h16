import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, MessageCircle, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Copy } from '@/site/content';
import { fmtDate, type Comment } from '@/site/types';

export function Reviews({
  t,
  targetType,
  targetId,
  userEmail,
  autoLoad,
}: {
  t: Copy;
  targetType: 'partner' | 'photo';
  targetId: string | null;
  userEmail: string | null;
  autoLoad: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !targetId) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('comments')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false });
    setLoading(false);
    setLoaded(true);
    if (!loadError && data) setComments(data);
  }, [targetType, targetId]);

  useEffect(() => {
    setComments([]);
    setLoaded(false);
    if (autoLoad) void load();
  }, [autoLoad, load]);

  const submit = async () => {
    if (!supabase || !targetId || !text.trim()) return;
    setSubmitting(true);
    setError(false);
    const { error: insertError } = await supabase.from('comments').insert({
      target_type: targetType,
      target_id: targetId,
      author_name: userEmail ? userEmail.split('@')[0] : 'Invite',
      content: text.trim(),
      rating: rating > 0 ? rating : null,
    });
    setSubmitting(false);
    if (insertError) { setError(true); return; }
    setText('');
    setRating(0);
    await load();
  };

  return (
    <div className="s-reviews">
      <h3 className="s-sheet-h3"><MessageCircle size={16} /> {t.reviews}{loaded ? ` (${comments.length})` : ''}</h3>

      {!loaded && (
        <button className="s-btn s-btn--outline s-btn--sm" onClick={() => void load()} disabled={loading || !targetId}>
          {loading && <Loader2 size={14} className="s-spin" />}
          {t.loadReviews}
        </button>
      )}
      {loaded && comments.length === 0 && <p className="s-muted">{t.noReviews}</p>}

      <div className="s-review-list">
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <motion.div key={c.id} className="s-review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="s-review-head">
                <span className="s-review-avatar">{c.author_name.charAt(0).toUpperCase()}</span>
                <strong>{c.author_name}</strong>
                <span>{fmtDate(c.created_at)}</span>
                {c.rating ? <span className="s-stars" aria-label={`${c.rating}/5`}>{'★'.repeat(c.rating)}<i>{'★'.repeat(5 - c.rating)}</i></span> : null}
              </div>
              <p>{c.content}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="s-review-form">
        <div className="s-rating">
          {[1, 2, 3, 4, 5].map((s) => (
            <motion.button
              key={s}
              className={s <= rating ? 'is-on' : ''}
              onClick={() => setRating(s === rating ? 0 : s)}
              whileTap={{ scale: 0.8 }}
              aria-label={`${s}/5`}
            >
              <Star size={18} />
            </motion.button>
          ))}
        </div>
        <textarea className="s-input" placeholder={t.writeComment} value={text} onChange={(e) => setText(e.target.value)} rows={2} />
        <button className="s-btn s-btn--primary s-btn--sm" onClick={() => void submit()} disabled={submitting || !text.trim() || !targetId}>
          {submitting && <Loader2 size={14} className="s-spin" />}
          {t.submitReview}
        </button>
        {error && <p className="s-error">{t.reviewError}</p>}
      </div>
    </div>
  );
}
