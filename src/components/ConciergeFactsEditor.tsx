import { useEffect, useState } from 'react';
import { Building2, Clock, Eye, EyeOff, Info, Loader2, MapPin, Phone, Plus, Save, Shield, Trash2, Zap } from 'lucide-react';
import {
  FACT_ICONS,
  deleteCompanyFact,
  loadCompanyFacts,
  saveCompanyFact,
  type CompanyFact,
  type CompanyFactDraft,
} from '@/concierge/services/companyFacts';

const ICONS = { clock: Clock, map: MapPin, phone: Phone, zap: Zap, shield: Shield, info: Info } as const;
const ICON_LABELS: Record<string, string> = { clock: 'Horloge', map: 'Lieu', phone: 'Téléphone', zap: 'Éclair', shield: 'Garantie', info: 'Info' };

type Row = CompanyFactDraft & { dirty?: boolean };

export function ConciergeFactsEditor() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCompanyFacts(true)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const update = (index: number, patch: Partial<Row>) =>
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch, dirty: true } : row)));

  const add = () =>
    setRows(prev => [
      ...prev,
      { key: '', label: '', value: '', detail: '', icon: 'info', position: (prev[prev.length - 1]?.position ?? 0) + 10, published: true, dirty: true },
    ]);

  const save = async (index: number) => {
    const row = rows[index];
    if (!row.label.trim() || !row.value.trim()) {
      setError('Le libellé et la valeur sont obligatoires.');
      return;
    }
    setBusy(`save-${index}`);
    setError('');
    try {
      const saved: CompanyFact = await saveCompanyFact(row);
      setRows(prev => prev.map((r, i) => (i === index ? saved : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (index: number) => {
    const row = rows[index];
    if (row.id && !window.confirm(`Supprimer « ${row.label} » de la fiche société ?`)) return;
    setBusy(`del-${index}`);
    setError('');
    try {
      if (row.id) await deleteCompanyFact(row.id);
      setRows(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="cfe">
      <div className="ai-settings-head">
        <Building2 size={18} />
        <div>
          <h3>Fiche société</h3>
          <p className="ai-settings-sub">
            Les informations officielles que le concierge cite et affiche dans un cadre pendant l'appel
            (horaires, zone, délais…). Il n'invente jamais ce qui n'est pas ici.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="adm-msg ai-inline-load">Chargement de la fiche…</p>
      ) : (
        <ul className="cfe-list">
          {rows.map((row, index) => {
            const Icon = ICONS[row.icon as keyof typeof ICONS] ?? Info;
            return (
              <li key={row.id ?? `new-${index}`} className="cfe-item" data-hidden={!row.published || undefined}>
                <span className="cfe-icon"><Icon size={16} /></span>
                <div className="cfe-fields">
                  <div className="crn-row2">
                    <label>
                      <span>Libellé</span>
                      <input className="field" value={row.label} onChange={e => update(index, { label: e.target.value })} placeholder="Horaires" />
                    </label>
                    <label>
                      <span>Valeur affichée</span>
                      <input className="field" value={row.value} onChange={e => update(index, { value: e.target.value })} placeholder="Lundi au vendredi, 8h – 19h" />
                    </label>
                  </div>
                  <label>
                    <span>Précision (dite à l'oral et visible en détail)</span>
                    <input className="field" value={row.detail} onChange={e => update(index, { detail: e.target.value })} placeholder="Fermé à 19h. Samedi sur rendez-vous." />
                  </label>
                  <div className="cfe-controls">
                    <select className="field cfe-select" value={row.icon} onChange={e => update(index, { icon: e.target.value })} aria-label="Icône">
                      {FACT_ICONS.map(icon => <option key={icon} value={icon}>{ICON_LABELS[icon]}</option>)}
                    </select>
                    <input
                      className="field cfe-pos"
                      type="number"
                      value={row.position}
                      onChange={e => update(index, { position: Number(e.target.value) || 0 })}
                      aria-label="Ordre"
                      title="Ordre d'affichage"
                    />
                    <button type="button" className="cva-btn" onClick={() => update(index, { published: !row.published })} title={row.published ? 'Visible par le concierge' : 'Masquée'}>
                      {row.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button type="button" className="cva-btn" onClick={() => void remove(index)} disabled={busy !== null} aria-label="Supprimer">
                      {busy === `del-${index}` ? <Loader2 size={14} className="cva-spin" /> : <Trash2 size={14} />}
                    </button>
                    <button type="button" className="btn-pink cfe-save" onClick={() => void save(index)} disabled={!row.dirty || busy !== null}>
                      {busy === `save-${index}` ? <Loader2 size={14} className="cva-spin" /> : <Save size={14} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="adm-msg adm-err">{error}</p>}
      <button type="button" className="cfe-add" onClick={add}>
        <Plus size={15} /> Ajouter une information
      </button>
    </section>
  );
}
