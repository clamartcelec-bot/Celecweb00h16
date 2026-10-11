import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, MapPin, Wrench, Zap } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_SOFT, fadeUp, stagger, viewportOnce } from '@/site/motion';
import { SectionHead } from '@/site/components/SectionHead';
import { MapExplorer } from '@/site/map/MapExplorer';
import { FAMILY_ICONS, ENTRETIEN_ICON } from '@/site/components/familyIcons';
import { FAMILIES, familiesOf, topicsOf, topicsOfFamily, type FamilyId } from '@/site/taxonomy';
import { coverOf, type ContactCategory, type Photo } from '@/site/types';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

interface FamiliesProps {
  photos: Photo[];
  onFamily: (id: FamilyId) => void;
  onEntretien: () => void;
  onCategory: (c: ContactCategory) => void;
  onBlockTech: () => void;
  blocktechNote: string;
}

export function FamiliesSection({ photos, onFamily, onEntretien, onCategory, onBlockTech, blocktechNote }: FamiliesProps) {
  const proof = useMemo(() => {
    const map = new Map<FamilyId, Photo[]>();
    FAMILIES.forEach((f) => map.set(f.id, []));
    photos.forEach((p) => familiesOf(p).forEach((f) => map.get(f)?.push(p)));
    return map;
  }, [photos]);
  const entretienCount = useMemo(() => photos.filter((p) => topicsOf(p).includes('entretien')).length, [photos]);
  const EntretienIcon = ENTRETIEN_ICON;

  return (
    <section className="s-sec" id="familles">
      <SectionHead
        index="01"
        title="Ce que nous faisons"
        lead="Cinq familles qui se croisent souvent : une alarme passe par le réseau, une borne par le tableau. On part de votre besoin, pas d’une case."
      />
      <motion.div className="s-fam-grid" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={viewportOnce}>
        {FAMILIES.map((f) => {
          const Icon = FAMILY_ICONS[f.id];
          const entries = proof.get(f.id) ?? [];
          const cover = entries.map(coverOf).find(Boolean);
          const topics = topicsOfFamily(f.id).filter((tp) => !tp.pending && tp.id !== 'entretien').slice(0, 4);
          const isElec = f.id === 'electricite';
          return (
            <motion.article
              key={f.id}
              className={`s-fam ${isElec ? 's-fam--lead' : ''} ${cover ? 'has-cover' : ''}`}
              style={{ ['--fam' as string]: f.accent }}
              variants={fadeUp}
            >
              {cover && <img className="s-fam-cover" src={cover} alt="" loading="lazy" />}
              <span className="s-fam-shade" aria-hidden="true" />
              <div className="s-fam-body">
                <span className="s-fam-icon"><Icon size={18} /></span>
                <h3>{f.name}</h3>
                <p className="s-fam-tagline">{f.tagline}</p>
                <ul className="s-fam-topics">
                  {topics.map((tp) => <li key={tp.id}>{tp.name}</li>)}
                </ul>
                {isElec && (
                  <div className="s-fam-entries">
                    <button onClick={() => onCategory('depannage')}><Zap size={15} /> J’ai une panne</button>
                    <button onClick={() => onCategory('chantier')}><Wrench size={15} /> J’ai un projet de travaux</button>
                  </div>
                )}
                <button className="s-fam-go" onClick={() => onFamily(f.id)}>
                  <span>{entries.length > 0 ? plural(entries.length, 'réalisation au Carnet', 'réalisations au Carnet') : 'Découvrir'}</span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </motion.article>
          );
        })}
      </motion.div>

      <motion.button className="s-entretien" onClick={onEntretien} variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <span className="s-entretien-icon"><EntretienIcon size={20} /></span>
        <span className="s-entretien-copy">
          <strong>Entretien, pour les cinq familles</strong>
          <span>Une installation se conçoit, puis s’entretient et évolue. On revient voir, on met à jour, on garde le fil.</span>
        </span>
        <span className="s-entretien-go">
          {entretienCount > 0 ? plural(entretienCount, 'billet', 'billets') : 'En savoir plus'}
          <ArrowRight size={15} />
        </span>
      </motion.button>

      <motion.div className="s-bt-line" variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <p>{blocktechNote}</p>
        <button className="s-link" onClick={onBlockTech}>BlockTech <ArrowRight size={14} /></button>
      </motion.div>
    </section>
  );
}

const COMMUNES = [
  { name: 'Clamart', match: ['clamart'], base: true },
  { name: 'Meudon', match: ['meudon'] },
  { name: 'Issy-les-Moulineaux', match: ['issy'] },
  { name: 'Paris Sud', match: ['paris'] },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function TerritorySection({ t, photos, onOpen, onExpand }: { t: Copy; photos: Photo[]; onOpen: (p: Photo) => void; onExpand: () => void }) {
  const reduce = useReducedMotion();
  const counts = useMemo(
    () => COMMUNES.map((c) => photos.filter((p) => p.city && c.match.some((m) => norm(p.city).includes(m))).length),
    [photos],
  );

  return (
    <section className="s-sec s-sec--map" id="carte">
      <SectionHead index="03" title={t.mapTitle} lead={t.mapLead} />
      <div className="s-terr">
        <motion.div
          className="s-terr-van"
          initial={reduce ? false : { x: '-35%', opacity: 0 }}
          whileInView={{ x: '0%', opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 1.4, ease: EASE_SOFT }}
        >
          <img src="/pink-van.webp" alt="La camionnette rose CELEC" loading="lazy" />
        </motion.div>
        <div className="s-terr-copy">
          <p className="s-terr-lead">Une équipe de terrain basée à Clamart. On la rencontre sur place : ce sont nos chantiers qui parlent pour nous.</p>
          <ul className="s-terr-communes">
            {COMMUNES.map((c, i) => (
              <li key={c.name} className={c.base ? 'is-base' : ''}>
                <MapPin size={13} />
                <span>{c.name}</span>
                {counts[i] > 0 && <em>{counts[i]}</em>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={viewportOnce}>
        <MapExplorer t={t} photos={photos} variant="home" onOpen={onOpen} onExpand={onExpand} />
      </motion.div>
    </section>
  );
}
