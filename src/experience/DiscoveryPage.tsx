import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, House, Lightbulb, Network, Phone } from 'lucide-react';
import { presentToGuide } from './events';
import { SiteGuide, type SiteProject } from './HomeExperience';

const PATHS = [
  { key: 'maison', label: 'Une maison, un appartement', icon: House, title: 'Penser les lieux dans leur ensemble.', text: 'Électricité, rénovation, éclairage : partons de vos usages pour comprendre votre projet.', tokens: /maison|appartement|renov|cuisine|logement/i },
  { key: 'collectif', label: 'Une copropriété, un local', icon: Building2, title: 'Des installations pour des usages partagés.', text: 'Parties communes, locaux professionnels, installations à reprendre : découvrez les projets du Carnet.', tokens: /copro|local|bureau|immeuble|commerce/i },
  { key: 'connecte', label: 'Une installation connectée', icon: Network, title: 'Relier les équipements au quotidien.', text: 'Réseau, domotique, automatismes : je peux vous présenter ce que nous avons documenté.', tokens: /reseau|réseau|knx|domot|unifi|automat|connect/i },
  { key: 'decouvrir', label: 'Je suis simplement curieux', icon: Lightbulb, title: 'Suivez le fil de nos projets.', text: 'Un lieu, une contrainte, un choix technique. Le Carnet raconte le travail des électriciens.', tokens: /./ },
];
export function DiscoveryPage({ projects, onProject, companionOpen }: { projects: SiteProject[]; onProject: (project: SiteProject) => void; companionOpen: boolean }) {
  const [selected, setSelected] = useState(PATHS[3]);
  const reduced = useReducedMotion();
  const filtered = projects.filter(p => selected.tokens.test(`${p.title} ${p.description} ${p.detected_brands?.join(' ')}`));
  const choose = (path: typeof PATHS[number]) => {
    setSelected(path);
    presentToGuide({ title: path.title, description: path.text, prompt: `Le visiteur a choisi « ${path.label} » dans notre savoir-faire. Présente cette activité à partir des informations CELEC disponibles et affiche des projets pertinents, sans imposer une prise de contact.` });
  };
  return <section className="ce-discovery ce-section">
    <Link to="/" className="ce-text-link"><ArrowLeft size={15} /> Accueil</Link>
    <motion.div className="ce-discovery-heading" initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }}><span className="ce-eyebrow">Notre savoir-faire · découverte guidée</span><h1>Qu’avez-vous<br /><em>en tête ?</em></h1><p>Un besoin précis ou l’envie de découvrir ?<br />Choisissez un fil. Je vous montre la suite.</p></motion.div>
    <div className="ce-discovery-paths" aria-label="Choisissez ce que vous souhaitez découvrir">{PATHS.map(path => <motion.button key={path.key} className={`ce-discovery-path ${selected.key === path.key ? 'is-selected' : ''}`} aria-pressed={selected.key === path.key} onClick={() => choose(path)} whileHover={reduced ? undefined : { y: -3 }} whileTap={reduced ? undefined : { scale: 0.98 }}><path.icon size={20} /><span>{path.label}</span><ArrowRight size={16} /></motion.button>)}</div>
    <AnimatePresence mode="wait"><motion.div key={selected.key} className="ce-discovery-result" initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.3 }}>
      <div className="ce-discovery-intro"><span className="ce-eyebrow">Je vous montre</span><h2>{selected.title}</h2><p>{selected.text}</p><Link to={`/concierge?topic=${encodeURIComponent(selected.label)}`} className="ce-text-link"><Phone size={15} /> Le découvrir avec le concierge <ArrowUpRight size={15} /></Link></div>
      <div className="ce-discovery-projects">{filtered.slice(0, 3).map(p => <button key={p.id} className="ce-discovery-project" onClick={() => onProject(p)}>{p.image_url && <img src={p.image_url} alt={p.title} />}<span><small>{p.city}</small><strong>{p.title}</strong><ArrowUpRight size={16} /></span></button>)}{!filtered.length && <p className="ce-empty">Le concierge peut vous renseigner sur ce sujet. Les exemples du Carnet apparaîtront ici lorsqu’ils seront publiés.</p>}</div>
    </motion.div></AnimatePresence>
    {!companionOpen && <SiteGuide />}
  </section>;
}
