import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowUp, Handshake, Mic, Volume2, VolumeX, X } from 'lucide-react';
import type { ConciergeApi, ConciergeTurn } from '@/site/concierge/useConcierge';
import { usePressToTalk } from '@/site/concierge/usePressToTalk';
import type { Partner, Photo } from '@/site/types';

interface Props {
  api: ConciergeApi;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
}

const PHASE_LABEL = { ready: 'Prêt', connecting: 'Connexion…', listening: 'Je vous écoute…', thinking: 'Je réfléchis…', speaking: 'Je réponds' } as const;

function TurnCards({ turn, photos, partners, onOpenEntry, onOpenPartner }: { turn: ConciergeTurn } & Omit<Props, 'api'>) {
  const entries = (turn.actions ?? []).flatMap((a) => (a.type === 'show_entries' ? a.ids : []))
    .map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => Boolean(p));
  const partner = (turn.actions ?? []).flatMap((a) => (a.type === 'show_partner' ? [a.id] : []))
    .map((id) => partners.find((p) => p.id === id)).find(Boolean);
  if (!entries.length && !partner) return null;
  return (
    <div className="s-cx-cards">
      {entries.map((e) => (
        <button key={e.id} className="s-cx-card" onClick={() => onOpenEntry(e)}>
          {e.image_url && <img src={e.image_url} alt="" loading="lazy" />}
          <span><strong>{e.title}</strong>{e.city && <em>{e.city}</em>}</span>
        </button>
      ))}
      {partner && (
        <button className="s-cx-card" onClick={() => onOpenPartner(partner)}>
          {partner.logo_url ? <img src={partner.logo_url} alt="" className="is-logo" /> : <Handshake size={20} />}
          <span><strong>{partner.name}</strong><em>Notre choix</em></span>
        </button>
      )}
    </div>
  );
}

export function ConciergeThread({ api, photos, partners, onOpenEntry, onOpenPartner }: Props) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const lastText = api.turns[api.turns.length - 1]?.text;
  const live = api.caption?.role === 'assistant' && api.phase !== 'ready' && api.caption.text.trim() !== lastText ? api.caption.text : '';
  const talk = usePressToTalk(api, useCallback(() => setHint(true), []));

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [api.turns.length, live, api.error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void api.sendText(text);
  };

  const listening = api.phase === 'listening';

  return (
    <div className="s-cx-thread">
      <div className="s-cx-status" aria-live="polite">
        <span className={`s-cx-dot is-${api.phase}`} />
        {PHASE_LABEL[api.phase]}
        <button
          className="s-cx-mute"
          onClick={() => api.setMuted(!api.muted)}
          aria-label={api.muted ? 'Réactiver la voix' : 'Couper la voix'}
          title={api.muted ? 'Réactiver la voix' : 'Couper la voix'}
        >
          {api.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>

      <div className="s-cx-list" ref={list}>
        {api.turns.length === 0 && (
          <p className="s-cx-empty">Bonjour ! Je peux vous montrer nos réalisations, vous emmener sur la bonne page ou préparer une demande de rappel.</p>
        )}
        {api.turns.map((turn, i) => (
          <div key={turn.id ?? `${turn.at}-${i}`} className={`s-cx-msg is-${turn.role}`}>
            <p>{turn.text || <span className="s-dock-dots" aria-label="Transcription en cours"><i /><i /><i /></span>}</p>
            {turn.role === 'assistant' && <TurnCards turn={turn} photos={photos} partners={partners} onOpenEntry={onOpenEntry} onOpenPartner={onOpenPartner} />}
          </div>
        ))}
        {live && <div className="s-cx-msg is-assistant is-live"><p>{live}</p></div>}
        {api.error && (
          <div className="s-cx-error" role="alert">
            <AlertCircle size={15} /><span>{api.error}</span>
            <button onClick={() => api.setError(null)} aria-label="Fermer"><X size={14} /></button>
          </div>
        )}
      </div>

      <form className="s-cx-compose" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setHint(false); }}
          placeholder={listening ? 'Je vous écoute…' : hint ? 'Restez appuyé sur le micro pour parler' : 'Écrire au robot…'}
          enterKeyHint="send"
          maxLength={1000}
          aria-label="Votre message"
        />
        {draft.trim() ? (
          <button type="submit" className="s-cx-send" aria-label="Envoyer"><ArrowUp size={18} /></button>
        ) : (
          <button
            type="button"
            className={`s-cx-send s-cx-hold ${listening ? 'is-rec' : ''} ${talk.far ? 'is-far' : ''}`}
            aria-label="Restez appuyé pour parler"
            {...talk.handlers}
          >
            <Mic size={17} />
          </button>
        )}
      </form>
    </div>
  );
}
