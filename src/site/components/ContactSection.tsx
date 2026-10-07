import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { AlertCircle, ArrowRight, CheckCircle2, Lightbulb, Loader2, Mic, RotateCcw, Send, Square, UserRound, Wrench, Zap } from 'lucide-react';
import { IMAGES, type Copy } from '@/site/content';
import { EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';
import { notifyTeam } from '@/site/notify';
import type { ContactCategory } from '@/site/types';

const CATS: { id: ContactCategory; icon: typeof Zap }[] = [
  { id: 'depannage', icon: Zap },
  { id: 'chantier', icon: Wrench },
  { id: 'projet', icon: Lightbulb },
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function ContactSection({
  t,
  category,
  onCategory,
  userEmail,
  onLogin,
}: {
  t: Copy;
  category: ContactCategory | null;
  onCategory: (c: ContactCategory | null) => void;
  userEmail: string | null;
  onLogin: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const [voice, setVoice] = useState<'idle' | 'recording' | 'done'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [relayed, setRelayed] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const label = (c: ContactCategory) => (c === 'depannage' ? t.catDepannage : c === 'chantier' ? t.catChantier : t.catProjet);
  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const toggleVoice = () => {
    if (voice === 'idle') {
      setVoice('recording');
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (voice === 'recording') {
      stopTimer();
      setVoice('done');
    } else {
      stopTimer();
      setVoice('idle');
      setSeconds(0);
    }
  };
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const hasContent = Boolean(text.trim() || category || voice === 'done');
  const canSend = hasContent && status !== 'sending' && (Boolean(userEmail) || phone.replace(/\D/g, '').length >= 8);

  const send = async () => {
    if (!canSend) return;
    setStatus('sending');
    setRelayed(null);
    try {
      const result = await notifyTeam({
        category: category ?? 'question',
        description: text.trim() || (category ? label(category) : 'question'),
        source: voice === 'done' ? 'voice' : 'chat',
        user_email: userEmail ?? undefined,
        guest_phone: userEmail ? undefined : phone.trim(),
      });
      setRelayed(result.telegram);
      setStatus('sent');
      setText('');
      setPhone('');
      onCategory(null);
      stopTimer();
      setVoice('idle');
      setSeconds(0);
      window.setTimeout(() => setStatus('idle'), 6000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="s-contact" id="contact-box" ref={ref}>
      <div className="s-contact-bg" aria-hidden="true">
        <motion.img src={IMAGES.contact} alt="" style={{ y: bgY }} loading="lazy" />
        <span />
      </div>

      <motion.div className="s-contact-copy" variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <SplitTitle className="s-contact-title" text={t.contactTitle} />
        <motion.p variants={fadeUp}>{t.contactLead}</motion.p>
        <motion.span className="s-contact-note" variants={fadeUp}>{t.noAccount}</motion.span>
      </motion.div>

      <motion.div
        className="s-contact-card"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewportOnce}
        transition={{ duration: 1, ease: EASE_SOFT, delay: 0.15 }}
      >
        <span className="s-contact-label">{t.contactFor}</span>
        <div className="s-segment">
          {CATS.map(({ id, icon: Icon }) => (
            <button key={id} className={`s-seg ${category === id ? 'is-active' : ''}`} onClick={() => onCategory(category === id ? null : id)}>
              {category === id && <motion.span layoutId="seg-pill" className="s-seg-pill" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
              <Icon size={15} />
              <span>{label(id)}</span>
            </button>
          ))}
        </div>

        <div className="s-compose">
          <textarea placeholder={t.orType} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <div className="s-compose-bar">
            <button className={`s-voice ${voice !== 'idle' ? `is-${voice}` : ''}`} onClick={toggleVoice}>
              {voice === 'idle' && <><Mic size={15} /> {t.voice}</>}
              {voice === 'recording' && <><span className="s-rec-dot" /> {clock} <Square size={12} /> {t.voiceStop}</>}
              {voice === 'done' && <><CheckCircle2 size={15} /> {clock} <RotateCcw size={12} /> {t.voiceRetry}</>}
            </button>
          </div>
        </div>

        {userEmail ? (
          <div className="s-contact-foot">
            <span className="s-signed"><UserRound size={14} /> {t.signedAs} {userEmail.split('@')[0]}</span>
            <motion.button className="s-btn s-btn--primary" onClick={send} disabled={!canSend} whileTap={{ scale: 0.97 }}>
              {status === 'sending' ? <Loader2 size={16} className="s-spin" /> : <Send size={16} />}
              {t.send}
            </motion.button>
          </div>
        ) : (
          <>
            <div className="s-phone-row">
              <input inputMode="tel" placeholder={t.guestPhone} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <motion.button className="s-btn s-btn--primary" onClick={send} disabled={!canSend} whileTap={{ scale: 0.97 }}>
                {status === 'sending' ? <Loader2 size={16} className="s-spin" /> : <Send size={16} />}
                {t.send}
              </motion.button>
            </div>
            <button className="s-link s-link--muted" onClick={onLogin}>
              <UserRound size={14} /> {t.orConnect} <ArrowRight size={13} />
            </button>
          </>
        )}

        <AnimatePresence>
          {(status === 'sent' || status === 'error') && (
            <motion.div
              className={`s-toast ${status === 'error' ? 's-toast--error' : ''}`}
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {status === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              <span>
                {status === 'error' ? t.sendError : t.sent}
                {status === 'sent' && relayed !== null && <em> {relayed ? t.sentNotified : t.sentQueued}</em>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
