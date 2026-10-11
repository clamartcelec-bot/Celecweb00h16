import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowUp, Handshake, Loader2, Mic, Square, Volume2, VolumeX, X } from 'lucide-react';
import type { ConciergeApi, ConciergeTurn } from '@/site/concierge/useConcierge';
import type { useTalk } from '@/site/concierge/useTalk';
import type { Partner, Photo } from '@/site/types';

interface Props {
  api: ConciergeApi;
  talk: ReturnType<typeof useTalk>;
  onSendText: (text: string) => void;
  photos: Photo[];
  partners: Partner[];
  onOpenEntry: (entry: Photo) => void;
  onOpenPartner: (partner: Partner) => void;
  emptyHint?: string;
  limit?: number;
}

const PHASE_LABEL = { ready: 'Prêt', recording: 'Je vous écoute…', thinking: 'Je réfléchis…', speaking: 'Je réponds' } as const;

function TurnCards({ turn, photos, partners, onOpenEntry, onOpenPartner }: { turn: ConciergeTurn } & Pick<Props, 'photos' | 'partners' | 'onOpenEntry' | 'onOpenPartner'>) {
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

export function ConciergeThread({ api, talk, onSendText, photos, partners, onOpenEntry, onOpenPartner, emptyHint, limit }: Props) {
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const shown = limit ? api.turns.slice(-limit) : api.turns;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [api.turns.length, api.pending, api.error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || api.phase === 'thinking') return;
    setDraft('');
    onSendText(text);
  };

  const busy = api.phase === 'thinking';

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
        {shown.length === 0 && !api.pending && <p className="s-cx-empty">{emptyHint ?? 'Posez votre question : une panne, un projet, nos réalisations…'}</p>}
        {shown.map((turn, i) => (
          <div key={`${turn.at}-${i}`} className={`s-cx-msg is-${turn.role}`}>
            <p>{turn.text}</p>
            {turn.role === 'assistant' && <TurnCards turn={turn} photos={photos} partners={partners} onOpenEntry={onOpenEntry} onOpenPartner={onOpenPartner} />}
          </div>
        ))}
        {api.pending && (
          <>
            {api.pending !== '…' && <div className="s-cx-msg is-user"><p>{api.pending}</p></div>}
            <div className="s-cx-msg is-assistant is-pending">
              <Loader2 size={15} className="s-spin" /> Je prépare la réponse…
              <button className="s-link s-link--muted" onClick={api.cancel}>Annuler</button>
            </div>
          </>
        )}
        {api.replay && (
          <button className="s-cx-listen" onClick={api.listen}><Volume2 size={15} /> Écouter la réponse</button>
        )}
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
          onChange={(e) => setDraft(e.target.value)}
          placeholder={talk.recording ? 'Enregistrement en cours…' : 'Écrire au robot…'}
          enterKeyHint="send"
          disabled={talk.recording}
          maxLength={1000}
          aria-label="Votre message"
        />
        {draft.trim() ? (
          <button type="submit" className="s-cx-send" disabled={busy} aria-label="Envoyer"><ArrowUp size={18} /></button>
        ) : (
          <button
            type="button"
            className={`s-cx-send ${talk.recording ? 'is-rec' : ''}`}
            onClick={() => (talk.recording ? void talk.finish() : void talk.begin())}
            aria-label={talk.recording ? 'Arrêter et envoyer' : 'Démarrer l’enregistrement'}
            aria-pressed={talk.recording}
          >
            {talk.recording ? <Square size={14} /> : <Mic size={17} />}
          </button>
        )}
        {talk.recording && (
          <button type="button" className="s-link s-link--muted" onClick={talk.abort}>Annuler</button>
        )}
      </form>
    </div>
  );
}
