import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { AlertCircle, ArrowRight, Bot, CheckCircle2, Lightbulb, Loader2, Mic, Send, Square, UserRound, Wrench, Zap } from 'lucide-react';
import { IMAGES, type Copy } from '@/site/content';
import { EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SplitTitle } from '@/site/components/Reveal';
import { notifyTeam } from '@/site/notify';
import type { ContactCategory } from '@/site/types';
import { useVoiceRecorder } from '@/site/concierge/useVoiceRecorder';

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
  prefill,
  transcribe,
}: {
  t: Copy;
  category: ContactCategory | null;
  onCategory: (c: ContactCategory | null) => void;
  userEmail: string | null;
  onLogin: () => void;
  prefill: { text: string; phone: string; nonce: number } | null;
  transcribe: (blob: Blob, mime: string) => Promise<string>;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const [voice, setVoice] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [fromRobot, setFromRobot] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [relayed, setRelayed] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.text) setText(prefill.text);
    if (prefill.phone) setPhone(prefill.phone);
    setFromRobot(true);
    setStatus('idle');
  }, [prefill]);

  const label = (c: ContactCategory) => (c === 'depannage' ? t.catDepannage : c === 'chantier' ? t.catChantier : t.catProjet);
  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const dictated = async (rec: { blob: Blob; mime: string; durationMs: number } | null) => {
    stopTimer();
    if (!rec || rec.durationMs < 600) { setVoice('idle'); if (rec) setVoiceError('Trop court, réessayez en parlant un peu plus longtemps.'); return; }
    setVoice('transcribing');
    try {
      const words = (await transcribe(rec.blob, rec.mime)).trim();
      if (!words) throw new Error('empty');
      setText((prev) => (prev.trim() ? `${prev.trim()} ${words}` : words));
      setUsedVoice(true);
    } catch {
      setVoiceError('Je n’ai pas réussi à transcrire. Réessayez ou écrivez votre message.');
    }
    setVoice('idle');
  };
  const recorder = useVoiceRecorder((rec) => void dictated(rec));

  const toggleVoice = async () => {
    setVoiceError(null);
    if (voice === 'recording') { void dictated(await recorder.stop()); return; }
    if (voice !== 'idle') return;
    const err = await recorder.start();
    if (err) {
      setVoiceError(err === 'denied' ? 'Le micro est bloqué : autorisez-le dans les réglages du navigateur, ou écrivez votre message.' : 'Le micro n’est pas disponible ici. Vous pouvez écrire votre message.');
      return;
    }
    setVoice('recording');
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((v) => v + 1), 1000);
  };
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const hasContent = Boolean(text.trim() || category);
  const canSend = hasContent && status !== 'sending' && voice === 'idle' && (Boolean(userEmail) || phone.replace(/\D/g, '').length >= 8);

  const send = async () => {
    if (!canSend) return;
    setStatus('sending');
    setRelayed(null);
    try {
      const result = await notifyTeam({
        category: category ?? 'question',
        description: text.trim() || (category ? label(category) : 'question'),
        source: fromRobot ? 'robot' : usedVoice ? 'voice' : 'chat',
        user_email: userEmail ?? undefined,
        guest_phone: userEmail ? undefined : phone.trim(),
      });
      setRelayed(result.telegram);
      setStatus('sent');
      setText('');
      setPhone('');
      onCategory(null);
      setUsedVoice(false);
      setFromRobot(false);
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
            <button type="button" className={`s-voice ${voice !== 'idle' ? `is-${voice}` : ''}`} onClick={() => void toggleVoice()} disabled={voice === 'transcribing'}>
              {voice === 'idle' && <><Mic size={15} /> {t.voice}</>}
              {voice === 'recording' && <><span className="s-rec-dot" /> {clock} <Square size={12} /> {t.voiceStop}</>}
              {voice === 'transcribing' && <><Loader2 size={15} className="s-spin" /> Transcription…</>}
            </button>
            {voice === 'recording' && <button type="button" className="s-link s-link--muted" onClick={() => { recorder.cancel(); stopTimer(); setVoice('idle'); }}>Annuler</button>}
          </div>
        </div>

        {voiceError && <p className="s-contact-hint s-contact-hint--error" role="alert"><AlertCircle size={14} /> {voiceError}</p>}
        {fromRobot && status !== 'sent' && (
          <p className="s-contact-hint"><Bot size={14} /> Le robot a pré-rempli votre demande. Vérifiez-la, puis appuyez sur « {t.send} » pour l’envoyer : rien n’est transmis sans votre confirmation.</p>
        )}

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
