import { useEffect, useState } from 'react';
import { Bot, Check, Handshake, Info, Save, Settings, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_CONCIERGE_SETTINGS,
  saveConciergeSettings,
  type ConciergeSettings,
} from '@/concierge/services/config';
import { loadConciergeKnowledge } from '@/concierge/services/knowledge';

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const voiceOptions = [
  { value: 'coral', label: 'Coral (chaleureuse)' },
  { value: 'alloy', label: 'Alloy (neutre)' },
  { value: 'sage', label: 'Sage (calme)' },
  { value: 'shimmer', label: 'Shimmer (claire)' },
];

export function ConciergeTab() {
  const [settings, setSettings] = useState<ConciergeSettings | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState<{ entries: number; brands: number; partners: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.from('concierge_settings').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setErr(error.message); setLoading(false); return; }
      setSettings(data ? { ...DEFAULT_CONCIERGE_SETTINGS, ...data } : DEFAULT_CONCIERGE_SETTINGS);
      setLoading(false);
    });

    loadConciergeKnowledge().then((knowledge) => {
      setKnowledgeCount({
        entries: knowledge.entries.length,
        brands: knowledge.brands.length,
        partners: knowledge.partners.length,
      });
    });
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await saveConciergeSettings(settings);
      setMsg('Reglages du concierge enregistres.');
      setTimeout(() => setMsg(''), 3000);
    } catch (saveError) {
      setErr(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.');
    }
    setSaving(false);
  };

  if (loading) return <p className="adm-msg ai-inline-load">Chargement des reglages du concierge...</p>;
  if (!settings) return <p className="adm-msg adm-err">Impossible de charger les reglages. {err}</p>;

  return (
    <div className="ai-settings">
      <div className="ai-settings-head">
        <Bot size={18} />
        <div>
          <h3>Concierge numerique</h3>
          <p className="ai-settings-sub">
            Ces reglages pilotent la conversation vocale : le ton, la base de travail sur le carnet
            publie et les informations du site que le concierge peut citer.
          </p>
        </div>
      </div>

      {knowledgeCount && (
        <div className="cgs-knowledge">
          <Info size={15} />
          <span>
            Base de travail actuelle : {knowledgeCount.entries} billet(s) publie(s), {knowledgeCount.brands} marque(s) detectee(s),
            {' '}{knowledgeCount.partners} partenaire(s). Seuls les billets publies sont accessibles au concierge.
          </span>
        </div>
      )}

      <div className="crn-fields">
        <label className="cgs-switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
          />
          <span>
            <strong>Concierge actif</strong>
            <em>Quand il est desactive, la page concierge affiche un message et invite a ecrire a l'equipe.</em>
          </span>
        </label>

        <label>
          <span>Phrase d'accueil</span>
          <input
            className="field"
            value={settings.greeting}
            onChange={e => setSettings({ ...settings, greeting: e.target.value })}
            placeholder="Bonjour, vous etes bien chez CELEC. Que puis-je faire pour vous ?"
          />
        </label>

        <label>
          <span>Ton du concierge</span>
          <textarea
            className="field crn-textarea"
            value={settings.tone}
            onChange={e => setSettings({ ...settings, tone: e.target.value })}
            placeholder="Un artisan qui conseille, pas un vendeur..."
          />
        </label>

        <label>
          <span>Prompt du concierge</span>
          <textarea
            className="field ai-prompt-field"
            value={settings.prompt}
            onChange={e => setSettings({ ...settings, prompt: e.target.value })}
            placeholder="Comportement general du concierge..."
          />
        </label>

        <label>
          <span>Informations du site (horaires, zones, coordonnees, tarifs)</span>
          <textarea
            className="field cgs-site-info"
            value={settings.site_info}
            onChange={e => setSettings({ ...settings, site_info: e.target.value })}
            placeholder="Ces informations sont citees a l'oral, sans affichage de carte..."
          />
        </label>

        <label>
          <span>Message de passage en mode rendez-vous</span>
          <textarea
            className="field crn-textarea"
            value={settings.focus_message}
            onChange={e => setSettings({ ...settings, focus_message: e.target.value })}
            placeholder="Phrase utilisee quand le concierge se concentre sur le rendez-vous..."
          />
        </label>

        <div className="crn-row2">
          <label>
            <span>Voix</span>
            <select
              className="field"
              value={settings.voice}
              onChange={e => setSettings({ ...settings, voice: e.target.value })}
            >
              {voiceOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Cartes affichees par reponse</span>
            <select
              className="field"
              value={String(settings.max_cards)}
              onChange={e => setSettings({ ...settings, max_cards: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map(count => (
                <option key={count} value={count}>{count} carte{count > 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="ai-toggles">
          <label className="crn-check">
            <input
              type="checkbox"
              checked={settings.show_brand_cards}
              onChange={e => setSettings({ ...settings, show_brand_cards: e.target.checked })}
            />
            <span>Afficher une carte quand une marque est citee</span>
          </label>
        </div>

        <div className="cgs-note">
          <Handshake size={14} />
          <span>
            Les marques affichables sont deduites du carnet publie et des partenaires.
            Une marque sans billet publie ne sera jamais presentee.
          </span>
        </div>
      </div>

      {err && <p className="adm-msg adm-err">{err}</p>}
      {msg && <p className="adm-msg ai-success"><Check size={13} /> {msg}</p>}

      <button className="btn-pink crn-save" onClick={handleSave} disabled={saving}>
        <Save size={15} />
        {saving ? 'Enregistrement...' : 'Enregistrer les reglages'}
      </button>

      {settings.updated_at && (
        <p className="ai-last-update"><Sparkles size={12} /> Derniere modification : {fmtDate(settings.updated_at)}</p>
      )}

      <p className="ai-settings-note"><Settings size={12} /> Les modifications prennent effet au prochain appel du concierge.</p>
    </div>
  );
}
