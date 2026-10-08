import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { Check, Menu, Moon, Settings2, ShieldCheck, Sparkles, Sun, X } from 'lucide-react';
import { languages, type Copy } from '@/site/content';
import { EASE_SOFT } from '@/site/motion';
import type { Lang, Theme, View } from '@/site/types';

interface Props {
  t: Copy;
  lang: Lang;
  theme: Theme;
  view: View;
  account: ReactNode;
  isAdmin: boolean;
  onLang: (lang: Lang) => void;
  onTheme: () => void;
  onNavigate: (view: View, anchor?: string) => void;
  onConcierge: () => void;
}

export function SiteHeader({ t, lang, theme, view, account, isAdmin, onLang, onTheme, onNavigate, onConcierge }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const links: { label: string; view: View; anchor?: string }[] = [
    { label: t.navCarnet, view: 'carnet' },
    { label: t.navMap, view: 'map' },
    { label: t.navPartners, view: 'partners' },
    { label: t.navServices, view: 'home', anchor: 'savoir-faire' },
  ];

  const navigate = (target: View, anchor?: string) => {
    setMenuOpen(false);
    onNavigate(target, anchor);
  };

  return (
    <>
      <motion.header
        className={`s-hdr ${scrolled || menuOpen ? 's-hdr--solid' : ''}`}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE_SOFT, delay: 0.1 }}
      >
        <button className="s-logo" onClick={() => navigate('home')} aria-label="CELEC">
          CELEC<span>.</span>
        </button>

        <nav className="s-nav" aria-label="Navigation principale">
          {links.map((link) => {
            const active = !link.anchor && view === link.view;
            return (
              <button key={link.label} className={`s-nav-link ${active ? 'is-active' : ''}`} onClick={() => navigate(link.view, link.anchor)}>
                {link.label}
                {active && <motion.span layoutId="nav-underline" className="s-nav-underline" />}
              </button>
            );
          })}
          <button className="s-nav-concierge" onClick={onConcierge}>
            <Sparkles size={14} />
            {t.navConcierge}
          </button>
        </nav>

        <div className="s-hdr-actions">
          {account}

          <div className="s-settings" ref={settingsRef}>
            <button
              className={`s-icon-btn ${settingsOpen ? 'is-on' : ''}`}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Réglages"
              aria-expanded={settingsOpen}
            >
              <Settings2 size={17} />
            </button>
            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  className="s-pop"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.28, ease: EASE_SOFT }}
                >
                  <span className="s-pop-label">{t.language}</span>
                  <div className="s-lang-grid">
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        className={`s-lang ${lang === l.code ? 'is-active' : ''}`}
                        onClick={() => { onLang(l.code); setSettingsOpen(false); }}
                      >
                        <strong>{l.short}</strong>
                        <span>{l.label}</span>
                        {lang === l.code && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                  <div className="s-pop-divider" />
                  <button className="s-pop-row" onClick={() => { onTheme(); setSettingsOpen(false); }}>
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    <span>{theme === 'light' ? t.themeDark : t.themeLight}</span>
                  </button>
                  {isAdmin && (
                    <button className="s-pop-row s-pop-row--accent" onClick={() => { navigate('admin'); setSettingsOpen(false); }}>
                      <ShieldCheck size={16} />
                      <span>Admin</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button className="s-icon-btn s-burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="s-mobile-menu"
            initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0 round 0 0 28px 28px)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0 round 0 0 28px 28px)' }}
            exit={{ opacity: 0, clipPath: 'inset(0 0 100% 0 round 0 0 28px 28px)' }}
            transition={{ duration: 0.55, ease: EASE_SOFT }}
          >
            {links.map((link, i) => (
              <motion.button
                key={link.label}
                className="s-mobile-link"
                onClick={() => navigate(link.view, link.anchor)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.06, duration: 0.5, ease: EASE_SOFT }}
              >
                {link.label}
              </motion.button>
            ))}
            <motion.button
              className="s-mobile-link s-mobile-link--accent"
              onClick={() => { setMenuOpen(false); onConcierge(); }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.5, ease: EASE_SOFT }}
            >
              <Sparkles size={18} /> {t.navConcierge}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
