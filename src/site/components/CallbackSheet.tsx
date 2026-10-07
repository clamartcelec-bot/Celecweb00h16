import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Loader2, Phone } from 'lucide-react';
import type { Copy } from '@/site/content';
import { Sheet } from '@/site/components/Sheet';
import { notifyTeam } from '@/site/notify';

export function CallbackSheet({ t, initialPhone = '', onClose }: { t: Copy; initialPhone?: string; onClose: () => void }) {
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const valid = phone.replace(/\D/g, '').length >= 8;

  const send = async () => {
    if (!valid) return;
    setStatus('sending');
    try {
      await notifyTeam({
        category: 'callback',
        description: `Rappel demandé - Tél : ${phone.trim()}`,
        source: 'callback',
        callback_requested: true,
      });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Sheet onClose={onClose} label={t.callbackTitle} size="narrow" closeLabel={t.close}>
      <div className="s-sheet-body s-callback">
        <motion.span className="s-callback-icon" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.2 }}>
          <Phone size={22} />
        </motion.span>
        <h2 className="s-sheet-title">{t.callbackTitle}</h2>
        <p className="s-sheet-text">{t.callbackText}</p>
        <AnimatePresence mode="wait">
          {status === 'sent' ? (
            <motion.div key="done" className="s-toast" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <CheckCircle2 size={18} /> <span>{t.callbackDone}</span>
            </motion.div>
          ) : (
            <motion.div key="form" className="s-callback-form" exit={{ opacity: 0, y: -8 }}>
              <input
                className="s-input s-input--lg"
                inputMode="tel"
                autoFocus
                placeholder="06 00 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              />
              <button className="s-btn s-btn--primary s-btn--block" onClick={() => void send()} disabled={!valid || status === 'sending'}>
                {status === 'sending' ? <Loader2 size={16} className="s-spin" /> : <Phone size={16} />}
                {t.callbackSend}
              </button>
              {status === 'error' && <p className="s-error">{t.callbackError}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
