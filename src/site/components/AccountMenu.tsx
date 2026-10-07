import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { History, LogOut, UserRound } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_SOFT } from '@/site/motion';

interface Props {
  t: Copy;
  userEmail: string | null;
  userName: string | null;
  onSignIn: () => void;
  onSpace: () => void;
  onHistory: () => void;
  onLogout: () => void;
}

export function AccountMenu({ t, userEmail, userName, onSignIn, onSpace, onHistory, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!userEmail) {
    return (
      <motion.button className="s-acct s-acct--guest" onClick={onSignIn} aria-label={t.account.signIn} whileTap={{ scale: 0.94 }}>
        <span className="s-acct-ico"><UserRound size={17} /></span>
        <span className="s-acct-label">{t.account.signIn}</span>
      </motion.button>
    );
  }

  const display = userName || userEmail.split('@')[0];
  const initial = display.trim().charAt(0).toUpperCase() || 'C';
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="s-acct-wrap" ref={ref}>
      <motion.button
        className={`s-acct s-acct--member ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={t.account.space}
        aria-expanded={open}
        whileTap={{ scale: 0.94 }}
      >
        <span className="s-acct-avatar" aria-hidden="true">
          {initial}
          <span className="s-acct-live" />
        </span>
        <span className="s-acct-label">{display}</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="s-pop s-acct-pop"
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: EASE_SOFT }}
          >
            <div className="s-acct-card">
              <span className="s-acct-avatar s-acct-avatar--lg" aria-hidden="true">{initial}</span>
              <div className="s-acct-id">
                <strong>{display}</strong>
                <small>{userEmail}</small>
              </div>
            </div>
            <span className="s-acct-status"><span className="s-acct-live s-acct-live--inline" />{t.account.connected}</span>
            <button role="menuitem" className="s-pop-row" onClick={pick(onSpace)}>
              <UserRound size={16} />{t.account.space}
            </button>
            <button role="menuitem" className="s-pop-row" onClick={pick(onHistory)}>
              <History size={16} />{t.account.history}
            </button>
            <button role="menuitem" className="s-pop-row s-pop-row--danger" onClick={pick(onLogout)}>
              <LogOut size={16} />{t.account.logout}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
