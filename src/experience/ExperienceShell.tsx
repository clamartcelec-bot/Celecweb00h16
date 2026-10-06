import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutGroup, MotionConfig } from 'motion/react';
import App from '@/App';
import { ConciergePage } from '@/concierge/components/ConciergePage';
import { DESIGN_PREVIEW } from './preview';
import './experience.css';

export function ExperienceShell() {
  const { pathname } = useLocation();
  const isConcierge = pathname === '/concierge';
  // The same robot and voice engine stay mounted while the page changes around them.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return <MotionConfig reducedMotion="user">
    {DESIGN_PREVIEW && <div className="ce-preview-banner">Aperçu de l’interface · contenus d’illustration · les appels et envois réels se testent dans Bolt</div>}
    <LayoutGroup id="celec-guide">
      <div hidden={isConcierge}><App /></div>
      <ConciergePage embedded={!isConcierge} />
    </LayoutGroup>
  </MotionConfig>;
}
