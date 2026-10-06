import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutGroup, MotionConfig } from 'motion/react';
import App from '@/App';
import { ConciergePage } from '@/concierge/components/ConciergePage';
import { DESIGN_PREVIEW } from './preview';
import './experience.css';

export function ExperienceShell() {
  const { pathname } = useLocation();
  const isConcierge = pathname === '/concierge';
  const [opened, setOpened] = useState(isConcierge);
  // Keep the voice session alive when navigating within the site.
  useEffect(() => { if (isConcierge) setOpened(true); }, [isConcierge]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return <MotionConfig reducedMotion="user">
    {DESIGN_PREVIEW && <div className="ce-preview-banner">Aperçu de l’interface · contenus d’illustration · les appels et envois réels se testent dans Bolt</div>}
    <LayoutGroup id="celec-guide">
      <div hidden={isConcierge}><App companionOpen={opened} /></div>
      {opened && <ConciergePage minimized={!isConcierge} />}
    </LayoutGroup>
  </MotionConfig>;
}
