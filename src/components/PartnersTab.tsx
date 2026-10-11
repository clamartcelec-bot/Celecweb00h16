import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Handshake, Mic, Pencil, Plus, Save, Square, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface PartnerRow {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  position: number;
  published: boolean;
  created_at: string;
  kind: 'brand' | 'pro';
  trade: string | null;
  locality: string | null;
  why_story: string | null;
}

const KIND_LABEL: Record<PartnerRow['kind'], string> = { brand: 'Marque', pro: 'Professionnel local' };

function useStoryRecorder(onAudio: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); r.stream.getTracks().forEach(t => t.stop()); }
  }, []);

  const start = async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 1000) onAudio(blob);
        else setMicError('Enregistrement trop court.');
      };
      recorder.start();
      setRecording(true);
    } catch {
      setMicError('Micro inaccessible. Autorisez le micro dans votre navigateur.');
    }
  };

  const stop = () => recorderRef.current?.stop();
  return { recording, micError, start, stop };
}

export function PartnersTab({ partners, onRefresh }: { partners: PartnerRow[]; onRefresh: () => Promise<void> }) {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PartnerRow['kind']>('brand');
  const [trade, setTrade] = useState('');
  const [locality, setLocality] = useState('');
  const [description, setDescription] = useState('');
  const [whyStory, setWhyStory] = useState('');
  const [published, setPublished] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | PartnerRow['kind']>('all');

  const writeStory = async (audio: Blob) => {
    if (!supabase) return;
    setWriting(true); setErr('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Session expirée, reconnectez-vous.');
      const form = new FormData();
      form.append('audio', audio, 'voice.webm');
      form.append('current_description', whyStory);
      form.append('target', 'partner_story');
      form.append('subject', name.trim());
      form.append('language', 'fr');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/description-rewrite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Rédaction impossible.');
      const text = typeof json.description === 'string' ? json.description.trim() : '';
      if (!text) throw new Error('Aucun texte obtenu, réessayez.');
      setWhyStory(text);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setWriting(false); }
  };
  const recorder = useStoryRecorder((blob) => void writeStory(blob));

  const resetForm = () => {
    setName(''); setKind('brand'); setTrade(''); setLocality(''); setDescription(''); setWhyStory('');
    setPublished(true); setLogoFile(null); setLogoPreview(''); setEditId(null); setErr('');
  };

  const openAdd = () => { resetForm(); setMode('add'); };
  const openEdit = (p: PartnerRow) => {
    setName(p.name); setKind(p.kind); setTrade(p.trade ?? ''); setLocality(p.locality ?? '');
    setDescription(p.description); setWhyStory(p.why_story ?? ''); setPublished(p.published);
    setLogoPreview(p.logo_url); setEditId(p.id); setErr(''); setMode('edit');
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!supabase || !name.trim()) { setErr('Nom requis.'); return; }
    setSaving(true); setErr('');
    try {
      let logoUrl = logoPreview;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() ?? 'png';
        const path = `partners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('photos').upload(path, logoFile, { contentType: logoFile.type, upsert: false });
        if (error) throw new Error(error.message);
        const { data } = supabase.storage.from('photos').getPublicUrl(path);
        logoUrl = data.publicUrl;
      }
      const row = {
        name: name.trim(),
        kind,
        trade: kind === 'pro' ? trade.trim() || null : null,
        locality: kind === 'pro' ? locality.trim() || null : null,
        description: description.trim(),
        why_story: whyStory.trim() || null,
        published,
        logo_url: logoUrl,
      };
      if (mode === 'add') {
        const { error } = await supabase.from('partners').insert({ ...row, position: partners.length });
        if (error) throw new Error(error.message);
      } else if (editId) {
        const { error } = await supabase.from('partners').update(row).eq('id', editId);
        if (error) throw new Error(error.message);
      }
      await onRefresh(); setMode('list'); resetForm();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setDeleting(id);
    const { error } = await supabase.from('partners').delete().eq('id', id);
    if (error) setErr(error.message);
    await onRefresh(); setDeleting(null);
  };

  if (mode === 'add' || mode === 'edit') {
    return (
      <div className="crn-form">
        <div className="crn-form-head">
          <h3>{mode === 'add' ? 'Nouveau partenaire' : 'Modifier le partenaire'}</h3>
          <button className="crn-back" onClick={() => { recorder.stop(); setMode('list'); resetForm(); }}>Annuler</button>
        </div>
        <div className="crn-kind-switch" role="radiogroup" aria-label="Type de partenaire">
          {(Object.keys(KIND_LABEL) as PartnerRow['kind'][]).map(k => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        {logoPreview && <div className="crn-gallery"><div className="crn-gallery-item"><img src={logoPreview} alt="Logo" /></div></div>}
        <label className="crn-gallery-add" style={{ display: 'inline-flex', marginBottom: 12 }}>
          <Upload size={16} /> {kind === 'pro' ? 'Photo ou logo' : 'Logo'}
          <input type="file" accept="image/*" onChange={handleLogoFile} hidden />
        </label>
        <div className="crn-fields">
          <label><span>Nom</span><input className="field" placeholder={kind === 'pro' ? 'Ex : Atelier Dupont' : 'Ex : Legrand'} value={name} onChange={e => setName(e.target.value)} /></label>
          {kind === 'pro' && (
            <>
              <label><span>Métier</span><input className="field" placeholder="Ex : Portails et clôtures" value={trade} onChange={e => setTrade(e.target.value)} /></label>
              <label><span>Commune</span><input className="field" placeholder="Ex : Meudon" value={locality} onChange={e => setLocality(e.target.value)} /></label>
            </>
          )}
          <label><span>Présentation</span><textarea className="field crn-textarea" placeholder={kind === 'pro' ? 'Ce qu’ils font...' : 'Ce que fait la marque...'} value={description} onChange={e => setDescription(e.target.value)} /></label>
          <div className="crn-why">
            <div className="crn-why-head">
              <span>Pourquoi nous l’avons choisi</span>
              {recorder.recording ? (
                <button className="crn-dictate-stop" onClick={recorder.stop}><Square size={11} /> Terminer</button>
              ) : (
                <button className="crn-dictate-start" onClick={() => void recorder.start()} disabled={writing}>
                  <Mic size={13} /> {writing ? 'Rédaction…' : whyStory ? 'Réenregistrer le pourquoi' : 'Enregistrer le pourquoi'}
                </button>
              )}
            </div>
            {recorder.recording && <p className="crn-why-live"><span className="crn-rec-dot" /> Racontez simplement pourquoi vous les avez choisis, une petite histoire de terrain…</p>}
            <textarea className="field crn-textarea" placeholder="Racontez à l’oral, le texte s’écrit ici. Vous pouvez le retoucher." value={whyStory} onChange={e => setWhyStory(e.target.value)} />
            {recorder.micError && <span className="crn-mic-error">{recorder.micError}</span>}
          </div>
          <label className="crn-check"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /><span>Visible sur le site</span></label>
        </div>
        {err && <p className="adm-msg adm-err">{err}</p>}
        <button className="btn-pink crn-save" onClick={handleSave} disabled={saving || writing || recorder.recording}>
          <Save size={15} /> {saving ? 'Enregistrement...' : mode === 'add' ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    );
  }

  const shown = filter === 'all' ? partners : partners.filter(p => p.kind === filter);

  return (
    <>
      <div className="crn-head">
        <span className="crn-count">{partners.length} partenaire{partners.length > 1 ? 's' : ''}</span>
        <div className="crn-kind-switch crn-kind-switch--sm">
          <button className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>Tous</button>
          <button className={filter === 'brand' ? 'is-on' : ''} onClick={() => setFilter('brand')}>Marques</button>
          <button className={filter === 'pro' ? 'is-on' : ''} onClick={() => setFilter('pro')}>Professionnels</button>
        </div>
        <button className="btn-pink crn-add" onClick={openAdd}><Plus size={15} /> Ajouter</button>
      </div>
      {err && <p className="adm-msg adm-err">{err}</p>}
      {shown.length === 0 && <div className="crn-empty"><Handshake size={40} /><p>Aucun partenaire ici.</p><span>Ajoutez une marque ou un professionnel local.</span></div>}
      <div className="crn-grid">
        {shown.map(p => (
          <div key={p.id} className="crn-card">
            {p.logo_url ? <div className="crn-img-wrap"><img src={p.logo_url} alt={p.name} className="crn-img" style={{ objectFit: 'contain', padding: 12 }} /></div> : <div className="crn-img crn-img-empty"><Handshake size={24} /></div>}
            <div className="crn-card-body">
              <div className="crn-card-top"><h4>{p.name}</h4><span className="crn-pub">{p.published ? <Eye size={13} /> : <EyeOff size={13} />}</span></div>
              <span className="crn-kind-tag">{KIND_LABEL[p.kind]}{p.trade ? ` · ${p.trade}` : ''}{p.locality ? ` · ${p.locality}` : ''}</span>
              {p.why_story ? <p className="crn-card-desc">« {p.why_story} »</p> : <p className="crn-card-desc crn-card-desc--todo">Pourquoi ce choix : à enregistrer</p>}
              <div className="crn-card-actions">
                <button className="crn-btn-edit" onClick={() => openEdit(p)}><Pencil size={13} /> Modifier</button>
                <button className="crn-btn-del" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}><Trash2 size={13} /> {deleting === p.id ? '...' : 'Supprimer'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
