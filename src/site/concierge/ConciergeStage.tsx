import { motion } from 'motion/react';
import { ArrowUpRight, Check, CheckCircle2, Clock, Handshake, Info, ListChecks, MapPin, Phone, X } from 'lucide-react';
import type { Partner, Photo } from '@/site/types';
import type { ConciergeApi } from './useConcierge';
import type { Stage } from './conciergeTools';

interface Props {
  api: ConciergeApi;
  stage: Stage;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
}

const coverOf = (p: Photo) => p.image_url || p.photo_images?.[0]?.image_url || '';

function Entries({ stage, photos, onOpenEntry }: { stage: Extract<Stage, { kind: 'entries' }> } & Pick<Props, 'photos' | 'onOpenEntry'>) {
  const items = stage.ids.map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => Boolean(p));
  return (
    <>
      <p className="s-stage-kicker">{stage.intro || (items.length > 1 ? `${items.length} réalisations du carnet` : 'Une réalisation du carnet')}</p>
      <div className={`s-stage-entries ${items.length === 1 ? 'is-single' : ''}`}>
        {items.map((p, i) => (
          <motion.button
            key={p.id}
            className="s-stage-entry"
            onClick={() => onOpenEntry(p)}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.08 * i, type: 'spring', stiffness: 260, damping: 24 }}
          >
            <span className="s-stage-img">{coverOf(p) && <img src={coverOf(p)} alt="" loading="lazy" />}</span>
            <span className="s-stage-cap">
              <strong>{p.title}</strong>
              <em><MapPin size={12} /> {p.city}</em>
            </span>
            <ArrowUpRight size={16} className="s-stage-go" />
          </motion.button>
        ))}
      </div>
    </>
  );
}

function PartnerCard({ partner, onOpenPartner }: { partner: Partner; onOpenPartner: Props['onOpenPartner'] }) {
  return (
    <>
      <p className="s-stage-kicker">{partner.kind === 'pro' ? 'Un professionnel de confiance' : 'Une marque que nous avons choisie'}</p>
      <div className="s-stage-partner">
        <span className="s-stage-logo">{partner.logo_url ? <img src={partner.logo_url} alt="" /> : <Handshake size={26} />}</span>
        <div>
          <strong>{partner.name}</strong>
          <p>{(partner.why_story || partner.description).slice(0, 220)}</p>
        </div>
      </div>
      <button className="s-btn s-btn--primary s-btn--sm" onClick={() => onOpenPartner(partner)}>
        Voir la fiche <ArrowUpRight size={14} />
      </button>
    </>
  );
}

function RequestCard({ api, sent }: { api: ConciergeApi; sent: boolean }) {
  const d = api.draft;
  const rows = [
    ['Nom', [d.first_name, d.last_name].filter(Boolean).join(' ')],
    ['Téléphone', d.phone],
    ['Objet', d.summary],
    ['Lieu', d.location],
    ['Disponibilités', d.availability],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <>
      <p className="s-stage-kicker">{sent ? 'Demande transmise à l’équipe' : 'Votre demande'}</p>
      {sent && <p className="s-stage-sent"><CheckCircle2 size={18} /> Merci ! L’équipe vous recontacte rapidement.</p>}
      <dl className="s-stage-rows">
        {rows.length ? rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>)) : <p className="s-stage-note">Le robot remplit la fiche au fil de la conversation.</p>}
      </dl>
      {!sent && <p className="s-stage-note"><Phone size={13} /> Seul votre numéro est indispensable. Rien n’est envoyé sans votre accord.</p>}
      {api.appointment && !sent && (
        <button className="s-link s-link--muted" onClick={api.endAppointment}>Sortir de la prise de rendez-vous</button>
      )}
    </>
  );
}

export function ConciergeStage({ api, stage, photos, partners, onOpenEntry, onOpenPartner }: Props) {
  const partner = stage.kind === 'partner' ? partners.find((p) => p.id === stage.id) : null;
  return (
    <motion.section
      className={`s-stage is-${stage.kind}`}
      aria-label={stage.kind === 'request' ? 'Prise de rendez-vous' : 'Ce que le robot vous montre'}
      role={stage.kind === 'request' ? 'dialog' : undefined}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      {stage.kind === 'request' && <span className="s-stage-anchor" data-robot-anchor="modal" aria-hidden="true" />}
      <button className="s-stage-x" onClick={api.dismissStage} aria-label="Fermer"><X size={16} /></button>
      {stage.kind === 'entries' && <Entries stage={stage} photos={photos} onOpenEntry={onOpenEntry} />}
      {partner && <PartnerCard partner={partner} onOpenPartner={onOpenPartner} />}
      {stage.kind === 'info' && (
        <>
          <p className="s-stage-kicker">{stage.variant === 'steps' ? <ListChecks size={14} /> : <Info size={14} />} {stage.title}</p>
          <ol className={`s-stage-points is-${stage.variant}`}>
            {stage.points.map((pt, i) => (
              <motion.li key={pt} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}>
                <span>{stage.variant === 'steps' ? i + 1 : <Check size={13} />}</span>{pt}
              </motion.li>
            ))}
          </ol>
          {stage.note && <p className="s-stage-note">{stage.note}</p>}
        </>
      )}
      {stage.kind === 'facts' && (
        <div className="s-stage-facts">
          {stage.facts.map((f) => (
            <div key={f.id}><Clock size={16} /><span><em>{f.label}</em><strong>{f.value}</strong>{f.detail && <small>{f.detail}</small>}</span></div>
          ))}
        </div>
      )}
      {stage.kind === 'request' && <RequestCard api={api} sent={stage.sent} />}
    </motion.section>
  );
}
