import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, BookOpen, Clock, MessagesSquare, Wrench, Zap } from 'lucide-react';
import { EASE_OUT, fadeUp, stagger } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';
import { EntryCard } from '@/site/components/EntryCard';
import { ENTRETIEN_ICON, FAMILY_ICONS } from '@/site/components/familyIcons';
import { FAMILIES, familyById, topicsOf, topicsOfFamily, type FamilyId, type FamilyKey, type Topic } from '@/site/taxonomy';
import { fmtDate, type ContactCategory, type Photo } from '@/site/types';

interface Props {
  family: FamilyKey;
  photos: Photo[];
  onOpen: (p: Photo) => void;
  onFamily: (id: FamilyKey) => void;
  onTopic: (topicId: string) => void;
  onCategory: (c: ContactCategory) => void;
}

const ENTRETIEN = {
  name: 'Entretien & suivi',
  tagline: 'Une installation se conçoit, puis s’entretient et évolue.',
  intro:
    'L’entretien traverse les cinq familles : un tableau qu’on revérifie, une alarme qu’on met à jour, un réseau qu’on remet au propre, une borne qu’on contrôle. On revient voir, on ajuste et on garde le fil de votre installation.',
  accent: '#e84a7f',
};

const ENTRETIEN_BY_FAMILY: Record<FamilyId, string> = {
  electricite: 'Tableau, protections, circuits : vérifier que tout reste sûr et adapté aux usages.',
  confort: 'Scénarios, commandes, éclairages : ajuster quand les habitudes changent.',
  securite: 'Alarme, caméras, interphonie : tester, mettre à jour, garder la main.',
  reseau: 'Wi-Fi, câblage, équipements : garder un réseau lisible et stable.',
  energie: 'Bornes, suivi des consommations, puissance : contrôler et réajuster.',
};

export function FamilyPage({ family, photos, onOpen, onFamily, onTopic, onCategory }: Props) {
  const isEntretien = family === 'entretien';
  const fam = isEntretien ? null : familyById(family);
  const meta = fam ?? ENTRETIEN;
  const Icon = isEntretien ? ENTRETIEN_ICON : FAMILY_ICONS[family];

  const topics: Topic[] = useMemo(
    () => (isEntretien ? [] : topicsOfFamily(family as FamilyId).filter((t) => t.id !== 'entretien')),
    [family, isEntretien],
  );

  const proof = useMemo(() => {
    const ids = isEntretien ? ['entretien'] : topics.map((t) => t.id);
    return photos.filter((p) => topicsOf(p).some((id) => ids.includes(id)));
  }, [photos, topics, isEntretien]);

  const countFor = (topicId: string) => photos.filter((p) => topicsOf(p).includes(topicId)).length;

  return (
    <div className="s-page s-famp" style={{ ['--fam' as string]: meta.accent }}>
      <PageIntro
        eyebrow={<><Icon size={14} /> {isEntretien ? 'Pour les cinq familles' : 'Famille'}</>}
        title={meta.name}
        lead={meta.intro}
      />

      {family === 'electricite' && (
        <motion.div className="s-famp-entries" variants={stagger(0.08)} initial="hidden" animate="show">
          <motion.button variants={fadeUp} onClick={() => onCategory('depannage')}>
            <span className="s-famp-entry-icon"><Zap size={20} /></span>
            <span><strong>J’ai une panne</strong><em>Un disjoncteur qui saute, une prise morte, une coupure : décrivez-nous la situation.</em></span>
            <ArrowRight size={18} />
          </motion.button>
          <motion.button variants={fadeUp} onClick={() => onCategory('chantier')}>
            <span className="s-famp-entry-icon"><Wrench size={20} /></span>
            <span><strong>J’ai un projet de travaux</strong><em>Rénovation, tableau, nouvelles lignes, projet avec architecte : parlons-en.</em></span>
            <ArrowRight size={18} />
          </motion.button>
        </motion.div>
      )}

      {topics.length > 0 && (
        <section className="s-famp-sec">
          <h2>Les sujets</h2>
          <motion.div className="s-famp-topics" variants={stagger(0.05)} initial="hidden" animate="show">
            {topics.map((tp) => {
              const n = countFor(tp.id);
              const shared = tp.families.filter((f) => f !== family).map((f) => familyById(f)?.name).filter(Boolean);
              return (
                <motion.button key={tp.id} variants={fadeUp} className="s-famp-topic" onClick={() => onTopic(tp.id)}>
                  <span className="s-famp-topic-head">
                    <strong>{tp.name}</strong>
                    <ArrowUpRight size={16} />
                  </span>
                  <span className="s-famp-topic-sum">{tp.summary}</span>
                  {tp.pending && <span className="s-famp-pending"><Clock size={12} /> Offre en cours de précision, posez-nous la question.</span>}
                  <span className="s-famp-topic-foot">
                    <span>{n > 0 ? `${n} au Carnet` : 'Pas encore au Carnet'}</span>
                    {shared.length > 0 && <span>Aussi : {shared.join(', ')}</span>}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </section>
      )}

      {isEntretien && (
        <section className="s-famp-sec">
          <h2>Dans chaque famille</h2>
          <div className="s-famp-topics">
            {FAMILIES.map((f) => {
              const FIcon = FAMILY_ICONS[f.id];
              return (
                <button key={f.id} className="s-famp-topic" style={{ ['--fam' as string]: f.accent }} onClick={() => onFamily(f.id)}>
                  <span className="s-famp-topic-head"><strong><FIcon size={15} /> {f.name}</strong><ArrowUpRight size={16} /></span>
                  <span className="s-famp-topic-sum">{ENTRETIEN_BY_FAMILY[f.id]}</span>
                </button>
              );
            })}
          </div>
          <p className="s-famp-note">Les conditions d’entretien (fréquence, contenu, tarif) se définissent avec vous, selon votre installation.</p>
        </section>
      )}

      <section className="s-famp-sec">
        <h2>Sur le terrain <span>{proof.length > 0 ? `${proof.length} réalisation${proof.length > 1 ? 's' : ''}` : ''}</span></h2>
        {proof.length > 0 ? (
          <div className="s-bento s-famp-proof">
            {proof.slice(0, 7).map((p, i) => (
              <motion.div
                key={p.id}
                className={`s-bento-cell ${i === 0 ? 's-bento-xl' : ''}`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: EASE_OUT, delay: (i % 4) * 0.06 }}
              >
                <EntryCard entry={p} cta="Voir le billet" onOpen={onOpen} showDescription={i === 0} meta={`${p.city || 'CELEC'} · ${fmtDate(p.created_at)}`} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="s-empty">
            <BookOpen size={20} />
            <p>Pas encore de réalisation publiée ici. Le Carnet s’enrichit au fil des chantiers.</p>
          </div>
        )}
        {proof.length > 7 && (
          <button className="s-btn s-btn--outline s-famp-more" onClick={() => onTopic(isEntretien ? 'entretien' : topics[0].id)}>
            Tout voir dans le Carnet <ArrowRight size={15} className="s-btn-arrow" />
          </button>
        )}
      </section>

      <section className="s-famp-cta">
        <div>
          <strong>Un besoin qui touche à {isEntretien ? 'l’entretien' : meta.name.toLowerCase()} ?</strong>
          <span>Racontez-le avec vos mots, on vous recontacte.</span>
        </div>
        <button className="s-btn s-btn--primary" onClick={() => onCategory(family === 'electricite' ? 'chantier' : 'projet')}>
          <MessagesSquare size={16} /> En parler
        </button>
      </section>

      <nav className="s-famp-others" aria-label="Autres familles">
        {[...FAMILIES.map((f) => f.id as FamilyKey), 'entretien' as FamilyKey].filter((id) => id !== family).map((id) => {
          const f = id === 'entretien' ? ENTRETIEN : familyById(id)!;
          const OIcon = id === 'entretien' ? ENTRETIEN_ICON : FAMILY_ICONS[id];
          return (
            <button key={id} style={{ ['--fam' as string]: f.accent }} onClick={() => onFamily(id)}>
              <OIcon size={15} /> {f.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
