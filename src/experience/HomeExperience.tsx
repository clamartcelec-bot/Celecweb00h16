import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, Phone, Plus } from 'lucide-react';
import { GuideRobot } from './GuideRobot';
import { presentToGuide } from './events';
import { DESIGN_PREVIEW } from './preview';

export interface SiteProject { id: string; title: string; city: string; description: string | null; image_url: string; detected_brands?: string[] | null }
interface SitePartner { id: string; name: string; logo_url: string; description: string }
interface Props {
  projects: SiteProject[]; partners: SitePartner[]; map: ReactNode; companionOpen: boolean;
  onProject: (project: SiteProject) => void; onCarnet: () => void;
  onPartner: (partner: SitePartner) => void; onCallback: () => void; onMap: () => void;
}
const EASE = [0.22, 1, 0.36, 1] as const;

export function HomeExperience({ projects, partners, map, companionOpen, onProject, onCarnet, onPartner, onCallback, onMap }: Props) {
  const reduced = useReducedMotion();
  const reveal = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.12 }, transition: { duration: reduced ? 0 : 0.65, ease: EASE } };
  return (
    <div className="ce-home">
      <section className="ce-welcome">
        <motion.div className="ce-welcome-copy" {...reveal}>
          <span className="ce-eyebrow">Électricité · éclairage · installations connectées</span>
          <h1>Les électriciens<br /><em>CELEC.</em></h1>
          <p>Des lieux à imaginer.<br />Des installations à faire vivre.</p>
          <div className="ce-welcome-actions">
            <Link to="/decouvrir" className="ce-button ce-button--dark" onClick={() => presentToGuide({ title: 'Notre savoir-faire', prompt: 'Le visiteur souhaite découvrir notre savoir-faire. Présente les réalisations pertinentes.' })}>Découvrir notre savoir-faire <ArrowUpRight size={17} /></Link>
            <button className="ce-text-link" onClick={onCallback}><Phone size={15} /> Être rappelé</button>
          </div>
          <div className="ce-intentions" aria-label="Votre besoin">
            {['Dépannage', 'Travaux', 'Projet'].map((label) => <Link key={label} to={`/concierge?topic=${encodeURIComponent(label)}`}>{label}<ArrowRight size={12} /></Link>)}
          </div>
        </motion.div>
        <motion.div className="ce-journey" {...reveal} transition={{ duration: reduced ? 0 : 0.85, ease: EASE, delay: 0.12 }}>
          <div className="ce-map-wash">{map}</div>
          <svg className="ce-journey-path" viewBox="0 0 600 500" fill="none" aria-hidden="true"><motion.path d="M30 390 C100 475 235 380 208 300 C180 220 435 320 472 194 C495 120 390 20 559 43" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 6" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 2.5, ease: 'easeInOut' }} /></svg>
          {projects.slice(0, 3).map((p, i) => <motion.button className={`ce-waypoint ce-waypoint--${i}`} key={p.id} onClick={() => onProject(p)} aria-label={`Découvrir ${p.title}`} whileHover={reduced ? undefined : { y: -6, rotate: 0 }} whileTap={{ scale: 0.98 }}>
            <img src={p.image_url} alt={p.title} loading={i === 0 ? 'eager' : 'lazy'} /><span>{i === 0 ? 'Les lieux' : i === 1 ? 'Les projets' : 'Les détails'}<ArrowUpRight size={13} /></span>
          </motion.button>)}
          {!projects.length && <div className="ce-journey-empty"><span>Du premier trait<br />aux derniers détails.</span><Plus size={22} /></div>}
          <motion.img className="ce-nemo" src="/pink-van.webp" alt="Le petit fourgon rose CELEC" animate={reduced ? undefined : { y: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
          <button className="ce-map-invite" onClick={onMap}><MapPin size={15} /><span>Nos projets sur la carte<small>Découvrez le Carnet par lieu</small></span><ArrowUpRight size={15} /></button>
        </motion.div>
        <button className="ce-scroll-hint" onClick={() => document.getElementById('ce-home-carnet')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}><ArrowDown size={14} /> Le fil de nos projets</button>
      </section>

      <motion.section {...reveal} className="ce-section ce-home-carnet" id="ce-home-carnet">
        <div className="ce-section-heading"><div><span className="ce-eyebrow">Des idées. Du terrain. Du savoir.</span><h2>Le Carnet<br /><em>de projets.</em></h2></div><div><p>Ce qu’on fait, ce qu’on apprend,<br />ce qu’on aime partager.</p><button className="ce-text-link" onClick={onCarnet}>Ouvrir le Carnet <ArrowUpRight size={16} /></button></div></div>
        {DESIGN_PREVIEW && <p className="ce-preview-note">Photos et projets d’illustration pour cet aperçu.</p>}
        <div className="ce-project-bento">
          {projects.slice(0, 6).map((p, i) => <motion.button {...reveal} transition={{ ...reveal.transition, delay: (i % 3) * 0.07 }} key={p.id} className={`ce-project ce-project--${i % 6}`} onClick={() => onProject(p)} whileHover={reduced ? undefined : { y: -5 }}>
            <div className="ce-project-picture">{p.image_url ? <img src={p.image_url} alt={p.title} loading="lazy" /> : <span className="ce-project-placeholder"><Plus size={26} /></span>}<span className="ce-project-open"><ArrowUpRight size={20} /></span></div>
            <div className="ce-project-caption"><small>{p.city || 'Carnet CELEC'}</small><h3>{p.title}</h3>{p.detected_brands?.length ? <span>{p.detected_brands.slice(0, 2).join(' · ')}</span> : null}</div>
          </motion.button>)}
        </div>
        {!projects.length && <p className="ce-empty">Les prochains projets seront à découvrir ici.</p>}
      </motion.section>

      <motion.section {...reveal} className="ce-section ce-home-partners">
        <div className="ce-section-heading"><div><span className="ce-eyebrow">Les liens qui font les projets</span><h2>Bien entourés.</h2></div><p>Des marques, des personnes,<br />et une expérience à partager.</p></div>
        <div className="ce-partner-row">{partners.slice(0, 4).map((p, i) => <motion.button key={p.id} className="ce-partner" onClick={() => onPartner(p)} whileHover={reduced ? undefined : { y: -4 }}><span className="ce-partner-index">0{i + 1}</span>{p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : <strong>{p.name}</strong>}<span className="ce-partner-link">Notre expérience <ArrowUpRight size={14} /></span></motion.button>)}</div>
      </motion.section>
      <motion.section {...reveal} className="ce-section ce-human"><span className="ce-eyebrow">Et derrière le numérique, les électriciens.</span><h2>On garde <em>le fil.</em></h2><p>Une question, des travaux, une idée à préciser ?<br />Laissez-nous votre numéro. L’équipe reprend le relais.</p><button className="ce-button ce-button--dark" onClick={onCallback}><Phone size={16} /> Être rappelé par l’équipe <ArrowRight size={17} /></button></motion.section>
      {!companionOpen && <SiteGuide />}
    </div>
  );
}

export function SiteGuide() {
  const [compact, setCompact] = useState(window.scrollY > 180);
  const reduced = useReducedMotion();
  useEffect(() => {
    const scroll = () => setCompact(window.scrollY > 180);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  return <motion.aside layout={!reduced} layoutId="celec-companion" className={`ce-site-guide ${compact ? 'ce-site-guide--compact' : ''}`} aria-label="Concierge numérique">
    <Link to="/concierge" className="ce-guide-link"><GuideRobot /><span className="ce-guide-invitation">{compact ? 'Je vous accompagne ?' : 'Laissez-moi vous montrer ce qu’on fait chez CELEC.'}<small><Phone size={12} /> Concierge IA · échange vocal · 24 h/24</small></span><span className="ce-guide-call"><ArrowUpRight size={16} /></span></Link>
  </motion.aside>;
}
