import { Lock } from 'lucide-react';
import type { Copy } from '@/site/content';
import type { View } from '@/site/types';

export function SiteFooter({ t, onNavigate, onConcierge }: { t: Copy; onNavigate: (view: View, anchor?: string) => void; onConcierge: () => void }) {
  return (
    <footer className="s-ftr">
      <div className="s-ftr-top">
        <div className="s-ftr-brand">
          <span className="s-logo s-logo--static">CELEC<span>.</span></span>
          <p>{t.footer}</p>
        </div>
        <nav className="s-ftr-links">
          <button onClick={() => onNavigate('carnet')}>{t.navCarnet}</button>
          <button onClick={() => onNavigate('partners')}>{t.navPartners}</button>
          <button onClick={() => onNavigate('home', 'savoir-faire')}>{t.navServices}</button>
          <button onClick={() => onNavigate('blocktech')}>BlockTech</button>
          <button onClick={onConcierge}>{t.navConcierge}</button>
        </nav>
      </div>
      <div className="s-ftr-bottom">
        <span>© {new Date().getFullYear()} CELEC</span>
        <button className="s-ftr-admin" onClick={() => onNavigate('admin-login')}>
          <Lock size={11} /> {t.footerAdmin}
        </button>
      </div>
    </footer>
  );
}
