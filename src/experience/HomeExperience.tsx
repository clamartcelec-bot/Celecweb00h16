import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Phone, Plus } from 'lucide-react';
import { openInlineGuide } from './events';
import { DESIGN_PREVIEW } from './preview';
import { ProjectAtlas } from './ProjectAtlas';

export interface SiteProject {
  id: string; title: string; city: string; description: string | null; image_url: string;
  detected_brands?: string[] | null; lat?: number; lng?: number;
}
interface SitePartner { id: string; name: string; logo_url: string; description: string }
interface Props {
  projects: SiteProject[]; partners: SitePartner[];
  onProject: (project: SiteProject) => void; onCarnet: () => void;
  onPartner: (partner: SitePartner) => void; onPartners: () => void;
  onCallback: () => void; onMap: (city?: string) => void;
}
const EASE = [0.22, 1, 0.36, 1] as const;

export function HomeExperience({ projects, partners, onProject, onCarnet, onPartner, onPartners, onCallback, onMap }: Props) {
  const reduced = useReducedMotion();
  const reveal = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.1 }, transition: { duration: reduced ? 0 : 0.6, ease: EASE } };
  const invite = () => openInlineGuide({ title: 'Découvrir CELEC', prompt: 'Le visiteur a choisi de découvrir CELEC avec toi. Présente brièvement les électriciens et propose un premier projet du Carnet, sans imposer une prise de contact.' });
  return <div className="ce-home">
    <section className="ce-welcome">
      {projects[0]?.image_url && <div className="ce-welcome-photo" aria-hidden="true"><img src={projects[0].image_url} alt="" fetchPriority="high" /></div>}
      <motion.div className="ce-welcome-copy" {...reveal}>
        <h1>Les électriciens<br /><em>CELEC.</em></h1>
        <p>Électricité, rénovation et<br />installations techniques.</p>
        <div className="ce-welcome-actions">
          <button className="ce-button ce-button--pink" onClick={onCallback}><Phone size={20} /> Être rappelé par l’équipe <ArrowRight size={19} /></button>
          <button className="ce-button ce-button--outline" onClick={onCarnet}>Voir nos réalisations <ArrowRight size={17} /></button>
        </div>
        <div className="ce-intentions" aria-label="Votre besoin">
          {['Dépannage', 'Travaux', 'Projet'].map(label => <button key={label} onClick={() => openInlineGuide({ title: label, prompt: `Le visiteur souhaite parler de « ${label} ». Accueille son besoin et pose une première question utile.` })}>{label}<ArrowRight size={13} /></button>)}
        </div>
      </motion.div>
      <ProjectAtlas projects={projects} onProject={onProject} onExpand={onMap} />
      <div className="ce-guide-scene">
        {/* The live companion sits here at the top of the page, then moves with the visit. */}
        <div className="ce-guide-anchor" aria-hidden="true" />
        <svg className="ce-guide-trail" viewBox="0 0 340 310" fill="none" aria-hidden="true"><motion.path d="M30 60 C150 -5 295 10 267 93 C240 160 118 145 135 207 C148 253 287 229 270 285" stroke="currentColor" strokeWidth="1.4" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 2, ease: 'easeInOut' }} /><circle cx="30" cy="60" r="3" fill="currentColor" /><circle cx="270" cy="285" r="3" fill="currentColor" /></svg>
        {projects.slice(0, 3).map((p, i) => <motion.button key={p.id} className={`ce-trail-project ce-trail-project--${i}`} onClick={() => onProject(p)} aria-label={`Découvrir ${p.title}`} whileHover={reduced ? undefined : { y: -5, rotate: 0 }} whileTap={reduced ? undefined : { scale: 0.98 }}><img src={p.image_url} alt="" /><ArrowUpRight size={13} /></motion.button>)}
        <motion.img className="ce-scene-nemo" src="/pink-van.webp" alt="Le petit fourgon rose CELEC" animate={reduced ? undefined : { y: [0, -3, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
        <button className="ce-guide-invite" onClick={invite}>Découvrir CELEC avec moi <ArrowRight size={14} /></button>
        <span className="ce-guide-disclosure"><Phone size={12} /> Concierge IA · échange vocal · 24 h/24</span>
      </div>
    </section>

    <div id="ce-live-presentation" className="ce-live-presentation" />

    <motion.section {...reveal} className="ce-section ce-home-carnet" id="ce-home-carnet">
      <div className="ce-section-heading"><div><h2>Le Carnet de projets<span>.</span></h2><p>Des rénovations, des installations et des espaces bien pensés.</p></div><button className="ce-button ce-button--outline" onClick={onCarnet}>Voir tout le Carnet <ArrowRight size={17} /></button></div>
      {DESIGN_PREVIEW && <p className="ce-preview-note">Photos et projets d’illustration pour cet aperçu.</p>}
      <div className="ce-project-bento">
        {projects.slice(0, 6).map((p, i) => <motion.article {...reveal} transition={{ ...reveal.transition, delay: (i % 3) * 0.07 }} key={p.id} data-project-id={p.id} className={`ce-project ce-project--${i % 6}`} whileHover={reduced ? undefined : { y: -4 }}>
          <button className="ce-project-picture" onClick={() => onProject(p)} aria-label={`Voir le projet : ${p.title}`}>{p.image_url ? <img src={p.image_url} alt={p.title} loading="lazy" /> : <span className="ce-project-placeholder"><Plus size={26} /></span>}<span className="ce-project-caption"><small>{p.city || 'Carnet CELEC'}</small><strong>{p.title}</strong>{p.detected_brands?.length ? <em>{p.detected_brands.slice(0, 2).join(' · ')}</em> : null}</span><span className="ce-project-open"><ArrowUpRight size={18} /></span></button>
          {i === 0 && <button className="ce-project-guide" onClick={() => openInlineGuide({ title: p.title, description: p.description ?? '', prompt: `Explique le projet du Carnet « ${p.title} » (id : ${p.id}), affiche sa fiche et ses détails disponibles.` })}><Phone size={12} /> Le robot vous explique ce projet <ArrowRight size={13} /></button>}
        </motion.article>)}
      </div>
      {!projects.length && <p className="ce-empty">Les prochains projets seront à découvrir ici.</p>}
    </motion.section>

    <motion.section {...reveal} className="ce-section ce-home-partners">
      <div className="ce-section-heading"><div><h2>Avec qui nous travaillons<span>.</span></h2><p>Des rencontres, des choix techniques et des projets partagés.</p></div><button className="ce-button ce-button--outline" onClick={onPartners}>Découvrir nos partenaires <ArrowRight size={17} /></button></div>
      <div className="ce-partner-row">{partners.slice(0, 4).map(p => <motion.button key={p.id} className="ce-partner" onClick={() => onPartner(p)} whileHover={reduced ? undefined : { y: -4 }}>{p.logo_url ? <img src={p.logo_url} alt={p.name} loading="lazy" /> : <strong>{p.name}</strong>}<span className="ce-partner-link">Notre expérience <ArrowUpRight size={16} /></span></motion.button>)}</div>
    </motion.section>

    <motion.section {...reveal} className="ce-human">
      {projects[0]?.image_url && <img className="ce-human-photo" src={projects[0].image_url} alt="" loading="lazy" />}
      <div className="ce-human-copy"><h2>Vous avez quelque<br />chose en tête <em>?</em></h2><p>Parlons de votre projet. Notre équipe vous rappelle<br />pour comprendre vos besoins et vous conseiller.</p><button className="ce-button ce-button--pink" onClick={onCallback}><Phone size={20} /> Être rappelé par l’équipe CELEC <ArrowRight size={19} /></button><small>Sans compte obligatoire.</small></div>
    </motion.section>
  </div>;
}
