import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { Check, History, LogOut, Menu, Moon, Settings2, ShieldCheck, Sparkles, Sun, UserRound, X } from 'lucide-react';
import { languages, type Copy } from '@/site/content';
import { EASE_SOFT } from '@/site/motion';
import { AccountMenu } from '@/site/components/AccountMenu';
import { VARIANTS, type SiteVariant } from '@/site/variant';
import type { Lang, Theme, View } from '@/site/types';

interface Props {
  t: Copy;
  lang: Lang;
  theme: Theme;
  variant: SiteVariant;
  onVariant: (v: SiteVariant) => void;
  view: View;
  userEmail: string | null;
  userName: string | null;
  isAdmin: boolean;
  onSignIn: () => void;
  onSpace: () => void;
  onHistory: () => void;
  onLogout: () => void;
  onLang: (lang: Lang) => void;
  onTheme: () => void;
  onNavigate: (view: View, anchor?: string) => void;
  onConcierge: () => void;
}

export function SiteHeader({ t, lang, theme, variant, onVariant, view, userEmail, userName, isAdmin, onSignIn, onSpace, onHistory, onLogout, onLang, onTheme, onNavigate, onConcierge }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  const links: { label: string; view: View; anchor?: string }[] = [
    { label: t.navServices, view: 'home', anchor: 'familles' },
    { label: 'Entretien', view: 'entretien' },
    { label: t.navCarnet, view: 'carnet' },
    { label: t.navMap, view: 'map' },
    { label: t.navPartners, view: 'partners' },
  ];

  // How many links fit next to the burger and the Concierge button.
  const [fit, setFit] = useState(links.length);

  useEffect(() => {
    const header = headerRef.current;
    const mirror = mirrorRef.current;
    if (!header || !mirror) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const width = header.clientWidth;
      const cs = getComputedStyle(header);
      const logo = header.querySelector<HTMLElement>('.s-logo');
      const actions = header.querySelector<HTMLElement>('.s-hdr-actions');
      const pad = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
      const gaps = parseFloat(cs.columnGap || '0') * 2;
      const kids = Array.from(mirror.children) as HTMLElement[];
      const linkW = kids.slice(0, links.length).map((el) => el.offsetWidth + 2);
      const conciergeW = (kids[kids.length - 1]?.offsetWidth ?? 0) + 6;
      const chrome = 50 + 8 + conciergeW;
      const base = width - pad - gaps - (logo?.offsetWidth ?? 0) - (actions?.offsetWidth ?? 0) - 24;
      let total = chrome;
      let k = 0;
      while (k < links.length && total + linkW[k] <= base) { total += linkW[k]; k++; }
      setFit(k);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(schedule);
    ro.observe(header);
    void document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [links.length]);

  const collapsed = fit < links.length;
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menuOpen]);

  const navigate = (target: View, anchor?: string) => {
    setMenuOpen(false);
    onNavigate(target, anchor);
  };

  const display = userName || userEmail?.split('@')[0] || null;
  const initial = display?.trim().charAt(0).toUpperCase() || 'C';

  return (
    <>
      <motion.header
        className={`s-hdr ${scrolled || menuOpen ? 's-hdr--solid' : ''}`}
        ref={headerRef}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE_SOFT, delay: 0.1 }}
      >
        <button className="s-logo" data-robot-target="nav-home" onClick={() => navigate('home')} aria-label="CELEC">
          CELEC<span>.</span>
        </button>

        <nav className="s-nav" aria-label="Navigation principale">
          <div className="s-nav-mirror" ref={mirrorRef} aria-hidden="true">
            {links.map((link) => (
              <span key={link.label} className="s-nav-link" tabIndex={-1}>{link.label}</span>
            ))}
            <span className="s-nav-concierge" tabIndex={-1}><Sparkles size={14} />{t.navConcierge}</span>
          </div>
          {links.slice(0, fit).map((link) => {
            const active = !link.anchor && view === link.view;
            return (
              <button key={link.label} data-robot-target={`nav-${link.anchor ?? link.view}`} className={`s-nav-link ${active ? 'is-active' : ''}`} onClick={() => navigate(link.view, link.anchor)}>
                {link.label}
                {active && <motion.span layoutId="nav-underline" className="s-nav-underline" />}
              </button>
            );
          })}
          <button className={`s-icon-btn s-burger ${collapsed ? 'is-needed' : ''}`} onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <button className="s-nav-concierge" onClick={onConcierge} aria-label={t.navConcierge}>
            <Sparkles size={14} />
            <span className="s-nav-concierge-label">{t.navConcierge}</span>
          </button>
        </nav>

        <div className="s-hdr-actions">
          <AccountMenu
            t={t}
            userEmail={userEmail}
            userName={userName}
            onSignIn={onSignIn}
            onSpace={onSpace}
            onHistory={onHistory}
            onLogout={onLogout}
          />

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
                  <span className="s-pop-label">Version du site</span>
                  <div className="s-lang-grid">
                    {VARIANTS.map((v) => (
                      <button
                        key={v}
                        className={`s-lang ${variant === v ? 'is-active' : ''}`}
                        onClick={() => { onVariant(v); setSettingsOpen(false); }}
                      >
                        <strong>{v.toUpperCase()}</strong>
                        <span>{v === 'v1' ? 'Originale' : v === 'v2' ? 'Sud parisien' : 'Panneau'}</span>
                        {variant === v && <Check size={13} />}
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
              transition={{ delay: 0.42, duration: 0.5, ease: EASE_SOFT }}
            >
              <Sparkles size={18} /> {t.navConcierge}
            </motion.button>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.52, duration: 0.5, ease: EASE_SOFT }}
            >
              <span className="s-mobile-sec">{userEmail ? t.account.connected : t.account.signIn}</span>
              {userEmail ? (
                <>
                  <div className="s-mobile-id">
                    <span className="s-acct-avatar" aria-hidden="true">{initial}</span>
                    <div className="s-mobile-id-text">
                      <strong>{display}</strong>
                      <small>{userEmail}</small>
                    </div>
                  </div>
                  <button className="s-mobile-row" onClick={() => { setMenuOpen(false); onSpace(); }}>
                    <UserRound size={17} /> {t.account.space}
                  </button>
                  <button className="s-mobile-row" onClick={() => { setMenuOpen(false); onHistory(); }}>
                    <History size={17} /> {t.account.history}
                  </button>
                  <button className="s-mobile-row s-mobile-row--danger" onClick={() => { setMenuOpen(false); onLogout(); }}>
                    <LogOut size={17} /> {t.account.logout}
                  </button>
                </>
              ) : (
                <button className="s-mobile-row" onClick={() => { setMenuOpen(false); onSignIn(); }}>
                  <UserRound size={17} /> {t.account.signIn}
                </button>
              )}

              <span className="s-mobile-sec">{t.language}</span>
              <div className="s-lang-grid">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    className={`s-lang ${lang === l.code ? 'is-active' : ''}`}
                    onClick={() => { onLang(l.code); setMenuOpen(false); }}
                  >
                    <strong>{l.short}</strong>
                    <span>{l.label}</span>
                    {lang === l.code && <Check size={13} />}
                  </button>
                ))}
              </div>
              <button className="s-mobile-row" onClick={() => { onTheme(); setMenuOpen(false); }}>
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                <span>{theme === 'light' ? t.themeDark : t.themeLight}</span>
              </button>
              {isAdmin && (
                <button className="s-mobile-row s-mobile-row--accent" onClick={() => navigate('admin')}>
                  <ShieldCheck size={17} /> Admin
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
