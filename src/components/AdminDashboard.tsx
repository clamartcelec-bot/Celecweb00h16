import { useState, useEffect, useRef } from 'react';
import {
  X, ShieldCheck, Users, Mail, Phone, Calendar, ChevronDown, ChevronUp,
  MessageSquare, LayoutDashboard, MapPin, ArrowUpRight,
  Receipt, PhoneCall, StickyNote, Search, Camera, Plus, Trash2,
  Pencil, Upload, Image as ImageIcon, Eye, EyeOff, Save, Handshake
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* ── Types ── */

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

interface RequestRow {
  id: string;
  category: string;
  description: string | null;
  commune: string | null;
  contact_preference: string | null;
  status: string;
  created_at: string;
  user_id: string | null;
  callback_requested: boolean;
}

interface Invoice {
  id: string;
  user_id: string;
  number: string;
  label: string;
  amount: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
}

interface Exchange {
  id: string;
  user_id: string;
  type: string;
  summary: string;
  details: string | null;
  author: string;
  happened_at: string;
}

interface PhotoRow {
  id: string;
  title: string;
  city: string;
  lat: number;
  lng: number;
  description: string | null;
  author: string;
  image_url: string;
  published: boolean;
  created_at: string;
  images?: PhotoImage[];
}

interface PhotoImage {
  id: string;
  photo_id: string;
  image_url: string;
  caption: string;
  position: number;
}

interface AdminDashboardProps {
  onClose: () => void;
}

type Tab = 'overview' | 'clients' | 'requests' | 'invoices' | 'exchanges' | 'carnet' | 'partners';

interface PartnerRow {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  position: number;
  published: boolean;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  new: 'Nouveau', to_call: 'A rappeler', in_progress: 'En cours',
  waiting_client: 'En attente', scheduled: 'Planifie', done: 'Termine',
  draft: 'Brouillon', sent: 'Envoyee', paid: 'Payee', overdue: 'En retard',
};

const statusColor: Record<string, string> = {
  new: '#e8336a', to_call: '#f59e0b', in_progress: '#3b82f6',
  waiting_client: '#a78bfa', scheduled: '#10b981', done: '#6b7280',
  draft: '#6b7280', sent: '#3b82f6', paid: '#10b981', overdue: '#ef4444',
};

const typeIcons: Record<string, typeof Phone> = {
  call: PhoneCall, email: Mail, visit: MapPin, sms: MessageSquare, note: StickyNote,
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtAmount = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [partnersList, setPartnersList] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const [pRes, rRes, iRes, eRes, phRes, piRes, partRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('requests').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').order('issued_at', { ascending: false }),
      supabase.from('exchanges').select('*').order('happened_at', { ascending: false }),
      supabase.from('photos').select('*').order('created_at', { ascending: false }),
      supabase.from('photo_images').select('*').order('position', { ascending: true }),
      supabase.from('partners').select('*').order('position', { ascending: true }),
    ]);
    if (pRes.error) { setError(pRes.error.message); setLoading(false); return; }
    const allImages: PhotoImage[] = piRes.data ?? [];
    const photosWithImages = (phRes.data ?? []).map((p: PhotoRow) => ({
      ...p,
      images: allImages.filter(i => i.photo_id === p.id),
    }));
    setProfiles(pRes.data ?? []);
    setRequests(rRes.data ?? []);
    setInvoices(iRes.data ?? []);
    setExchanges(eRes.data ?? []);
    setPhotos(photosWithImages);
    setPartnersList(partRes.data ?? []);
    setLoading(false);
  };

  const nameOf = (uid: string | null) => {
    const p = profiles.find(pr => pr.id === uid);
    return p ? (p.full_name || p.email.split('@')[0]) : '—';
  };

  const clientProfiles = profiles.filter(p => p.role !== 'admin');
  const activeRequests = requests.filter(r => r.status !== 'done');
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);

  const filteredProfiles = clientProfiles.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.email.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q) || (p.phone ?? '').includes(q);
  });

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'overview', label: 'Apercu', icon: LayoutDashboard },
    { key: 'clients', label: 'Clients', icon: Users },
    { key: 'requests', label: 'Demandes', icon: Mail },
    { key: 'invoices', label: 'Factures', icon: Receipt },
    { key: 'exchanges', label: 'Echanges', icon: MessageSquare },
    { key: 'carnet', label: 'Carnet', icon: Camera },
    { key: 'partners', label: 'Partenaires', icon: Handshake },
  ];

  return (
    <div className="overlay admin-overlay" onClick={onClose}>
      <div className="adm" onClick={e => e.stopPropagation()}>

        <div className="adm-head">
          <div className="adm-brand">
            <ShieldCheck size={22} />
            <div>
              <h2>Espace CELEC</h2>
              <span className="adm-sub">Administration</span>
            </div>
          </div>
          <button className="modal-x" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="adm-tabs">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={`adm-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                <Icon size={15} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="adm-body">
          {loading && <p className="adm-msg">Chargement...</p>}
          {error && <p className="adm-msg adm-err">{error}</p>}

          {!loading && tab === 'overview' && (
            <>
              <div className="adm-kpi-row">
                <KpiCard label="Clients" value={clientProfiles.length} color="#3b82f6" onClick={() => setTab('clients')} />
                <KpiCard label="Demandes actives" value={activeRequests.length} color="#e8336a" onClick={() => setTab('requests')} />
                <KpiCard label="Factures en attente" value={unpaidInvoices.length} color="#f59e0b" onClick={() => setTab('invoices')} />
                <KpiCard label="CA encaisse" value={fmtAmount(totalRevenue)} color="#10b981" onClick={() => setTab('invoices')} />
              </div>
              <div className="adm-kpi-row" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <KpiCard label="Photos au carnet" value={photos.length} color="#8b5cf6" onClick={() => setTab('carnet')} />
                <KpiCard label="Echanges" value={exchanges.length} color="#06b6d4" onClick={() => setTab('exchanges')} />
              </div>
              <div className="adm-recent-grid">
                <div className="adm-recent">
                  <h3>Dernieres demandes</h3>
                  {requests.slice(0, 5).map(r => (
                    <div key={r.id} className="adm-recent-item">
                      <span className="adm-dot" style={{ background: statusColor[r.status] }} />
                      <span className="adm-ri-desc">{r.description || r.category}</span>
                      <span className="adm-ri-who">{nameOf(r.user_id)}</span>
                      <span className="adm-ri-date">{fmtDate(r.created_at)}</span>
                    </div>
                  ))}
                  {requests.length === 0 && <p className="adm-empty-sm">Aucune demande.</p>}
                </div>
                <div className="adm-recent">
                  <h3>Derniers echanges</h3>
                  {exchanges.slice(0, 5).map(ex => {
                    const Icon = typeIcons[ex.type] || MessageSquare;
                    return (
                      <div key={ex.id} className="adm-recent-item">
                        <Icon size={13} className="adm-ri-icon" />
                        <span className="adm-ri-desc">{ex.summary}</span>
                        <span className="adm-ri-who">{nameOf(ex.user_id)}</span>
                        <span className="adm-ri-date">{fmtDate(ex.happened_at)}</span>
                      </div>
                    );
                  })}
                  {exchanges.length === 0 && <p className="adm-empty-sm">Aucun echange.</p>}
                </div>
              </div>
            </>
          )}

          {!loading && tab === 'clients' && (
            <>
              <div className="adm-search">
                <Search size={15} />
                <input placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="adm-list">
                {filteredProfiles.length === 0 && <p className="adm-msg">Aucun client trouve.</p>}
                {filteredProfiles.map(p => {
                  const uReqs = requests.filter(r => r.user_id === p.id);
                  const uInvs = invoices.filter(i => i.user_id === p.id);
                  const uExs = exchanges.filter(ex => ex.user_id === p.id);
                  const isOpen = expandedUser === p.id;
                  return (
                    <div key={p.id} className="adm-client-card">
                      <div className="adm-client-row" onClick={() => setExpandedUser(isOpen ? null : p.id)}>
                        <div className="adm-client-left">
                          <div className="adm-avatar">{p.email.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="adm-client-name">{p.full_name || p.email.split('@')[0]}</div>
                            <div className="adm-client-email">{p.email}</div>
                          </div>
                        </div>
                        <div className="adm-client-right">
                          <span className="adm-pill">{uReqs.length} dem.</span>
                          <span className="adm-pill">{uInvs.length} fact.</span>
                          <span className="adm-pill">{uExs.length} ech.</span>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="adm-client-detail">
                          <div className="adm-detail-meta">
                            <span><Calendar size={12} /> Inscrit le {fmtDate(p.created_at)}</span>
                            {p.phone && <span><Phone size={12} /> {p.phone}</span>}
                          </div>
                          {uReqs.length > 0 && (
                            <div className="adm-detail-section">
                              <h4>Demandes ({uReqs.length})</h4>
                              {uReqs.map(r => (
                                <div key={r.id} className="adm-mini">
                                  <span className="adm-mini-tag">{r.category}</span>
                                  <span style={{ color: statusColor[r.status], fontWeight: 600, fontSize: 11 }}>{statusLabel[r.status] || r.status}</span>
                                  <span className="adm-mini-date">{fmtDate(r.created_at)}</span>
                                  {r.description && <p className="adm-mini-desc">{r.description}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                          {uInvs.length > 0 && (
                            <div className="adm-detail-section">
                              <h4>Factures ({uInvs.length})</h4>
                              {uInvs.map(inv => (
                                <div key={inv.id} className="adm-mini">
                                  <span className="adm-mini-tag">{inv.number}</span>
                                  <span style={{ color: statusColor[inv.status], fontWeight: 600, fontSize: 11 }}>{statusLabel[inv.status] || inv.status}</span>
                                  <span className="adm-mini-amount">{fmtAmount(inv.amount)}</span>
                                  <span className="adm-mini-date">{fmtDate(inv.issued_at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {uExs.length > 0 && (
                            <div className="adm-detail-section">
                              <h4>Echanges ({uExs.length})</h4>
                              {uExs.map(ex => {
                                const Icon = typeIcons[ex.type] || MessageSquare;
                                return (
                                  <div key={ex.id} className="adm-mini">
                                    <span className="adm-mini-type"><Icon size={12} /> {ex.type}</span>
                                    <span className="adm-mini-desc">{ex.summary}</span>
                                    <span className="adm-mini-date">{fmtDate(ex.happened_at)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {uReqs.length === 0 && uInvs.length === 0 && uExs.length === 0 && (
                            <p className="adm-empty-sm">Aucune activite pour ce client.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!loading && tab === 'requests' && (
            <div className="adm-list">
              {requests.length === 0 && <p className="adm-msg">Aucune demande.</p>}
              {requests.map(r => {
                const owner = profiles.find(p => p.id === r.user_id);
                return (
                  <div key={r.id} className="adm-req-card">
                    <div className="adm-req-top">
                      <span className="adm-mini-tag">{r.category}</span>
                      <span style={{ color: statusColor[r.status], fontWeight: 600, fontSize: 11 }}>{statusLabel[r.status] || r.status}</span>
                      {r.commune && <span className="adm-req-commune"><MapPin size={11} /> {r.commune}</span>}
                      <span className="adm-mini-date" style={{ marginLeft: 'auto' }}>{fmtDate(r.created_at)}</span>
                    </div>
                    {r.description && <p className="adm-req-desc">{r.description}</p>}
                    <div className="adm-req-foot">
                      {owner && <span className="adm-req-owner">{owner.full_name || owner.email}</span>}
                      {r.callback_requested && <span className="adm-badge-sm">Rappel demande</span>}
                      {r.contact_preference && <span className="adm-req-pref">{r.contact_preference}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && tab === 'invoices' && (
            <div className="adm-list">
              <div className="adm-inv-summary">
                <div className="adm-inv-stat">
                  <span className="adm-inv-n">{invoices.length}</span>
                  <span>Total factures</span>
                </div>
                <div className="adm-inv-stat">
                  <span className="adm-inv-n" style={{ color: '#10b981' }}>{fmtAmount(totalRevenue)}</span>
                  <span>Encaisse</span>
                </div>
                <div className="adm-inv-stat">
                  <span className="adm-inv-n" style={{ color: '#f59e0b' }}>{unpaidInvoices.length}</span>
                  <span>En attente</span>
                </div>
              </div>
              {invoices.length === 0 && <p className="adm-msg">Aucune facture.</p>}
              {invoices.map(inv => (
                <div key={inv.id} className="adm-inv-card">
                  <div className="adm-inv-top">
                    <span className="adm-inv-num">{inv.number}</span>
                    <span style={{ color: statusColor[inv.status], fontWeight: 600, fontSize: 12 }}>{statusLabel[inv.status] || inv.status}</span>
                    <span className="adm-inv-amount">{fmtAmount(inv.amount)}</span>
                  </div>
                  <p className="adm-inv-label">{inv.label}</p>
                  <div className="adm-inv-foot">
                    <span className="adm-req-owner">{nameOf(inv.user_id)}</span>
                    <span className="adm-mini-date"><Calendar size={11} /> {fmtDate(inv.issued_at)}</span>
                    {inv.paid_at && <span className="adm-inv-paid">Payee le {fmtDate(inv.paid_at)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'exchanges' && (
            <div className="adm-list">
              {exchanges.length === 0 && <p className="adm-msg">Aucun echange.</p>}
              {exchanges.map(ex => {
                const Icon = typeIcons[ex.type] || MessageSquare;
                return (
                  <div key={ex.id} className="adm-ex-card">
                    <div className="adm-ex-top">
                      <span className="adm-ex-type"><Icon size={13} /> {ex.type}</span>
                      <span className="adm-ex-author">{ex.author}</span>
                      <span className="adm-req-owner">{nameOf(ex.user_id)}</span>
                      <span className="adm-mini-date" style={{ marginLeft: 'auto' }}>{fmtDate(ex.happened_at)}</span>
                    </div>
                    <p className="adm-ex-summary">{ex.summary}</p>
                    {ex.details && <p className="adm-ex-details">{ex.details}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && tab === 'carnet' && (
            <CarnetTab photos={photos} onRefresh={loadData} />
          )}
          {!loading && tab === 'partners' && (
            <PartnersTab partners={partnersList} onRefresh={loadData} />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, onClick }: { label: string; value: string | number; color: string; onClick: () => void }) {
  return (
    <button className="adm-kpi" onClick={onClick}>
      <span className="adm-kpi-val" style={{ color }}>{value}</span>
      <span className="adm-kpi-label">{label}</span>
      <ArrowUpRight size={14} className="adm-kpi-arrow" />
    </button>
  );
}

/* ── Carnet Tab (multi-image support) ── */

interface FrenchCity {
  id: number;
  name: string;
  postal_code: string;
  department: string | null;
  lat: number;
  lng: number;
}

interface PhotoForm {
  title: string;
  author: string;
  city: string;
  cityLat: number;
  cityLng: number;
  description: string;
  published: boolean;
  date: string;
}

const emptyForm: PhotoForm = { title: '', author: '', city: '', cityLat: 0, cityLng: 0, description: '', published: true, date: new Date().toISOString().slice(0, 10) };

function CarnetTab({ photos, onRefresh }: { photos: PhotoRow[]; onRefresh: () => Promise<void> }) {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PhotoForm>(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<PhotoImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [allCities, setAllCities] = useState<FrenchCity[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<FrenchCity[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityInputRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from('french_cities').select('*').order('name').then(({ data }) => {
      if (data) setAllCities(data);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cityInputRef.current && !cityInputRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCityInput = (val: string) => {
    setForm(f => ({ ...f, city: val, cityLat: 0, cityLng: 0 }));
    if (val.trim().length >= 1) {
      const q = val.toLowerCase();
      const matches = allCities.filter(c =>
        c.name.toLowerCase().includes(q) || c.postal_code.startsWith(q)
      ).slice(0, 12);
      setCitySuggestions(matches);
      setShowCityDropdown(matches.length > 0);
    } else {
      setCitySuggestions([]);
      setShowCityDropdown(false);
    }
  };

  const selectCity = (c: FrenchCity) => {
    setForm(f => ({ ...f, city: c.name, cityLat: c.lat, cityLng: c.lng }));
    setShowCityDropdown(false);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setFiles([]);
    setPreviews([]);
    setExistingImages([]);
    setEditId(null);
    setErr('');
    setMode('add');
  };

  const openEdit = (p: PhotoRow) => {
    setForm({
      title: p.title,
      author: p.author,
      city: p.city,
      cityLat: p.lat,
      cityLng: p.lng,
      description: p.description ?? '',
      published: p.published,
      date: p.created_at.slice(0, 10),
    });
    setFiles([]);
    setPreviews([]);
    setExistingImages(p.images ?? []);
    setEditId(p.id);
    setErr('');
    setMode('edit');
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (!newFiles.length) return;
    setFiles(prev => [...prev, ...newFiles]);
    setPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeNewFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const removeExistingImage = async (imgId: string) => {
    if (!supabase) return;
    await supabase.from('photo_images').delete().eq('id', imgId);
    setExistingImages(prev => prev.filter(i => i.id !== imgId));
  };

  const uploadImage = async (f: File): Promise<string> => {
    if (!supabase) throw new Error('Supabase non disponible');
    const ext = f.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('photos').upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!supabase) return;
    if (!form.title.trim()) { setErr('Titre requis.'); return; }
    setSaving(true);
    setErr('');
    try {
      const row = {
        title: form.title.trim(),
        author: form.author.trim(),
        city: form.city.trim(),
        lat: form.cityLat,
        lng: form.cityLng,
        description: form.description.trim() || null,
        published: form.published,
        created_at: new Date(form.date).toISOString(),
      };

      let entryId = editId;

      if (mode === 'add') {
        const { data, error } = await supabase.from('photos').insert({ ...row, image_url: '' }).select('id').single();
        if (error) throw new Error(error.message);
        entryId = data.id;
      } else if (entryId) {
        const { error } = await supabase.from('photos').update(row).eq('id', entryId);
        if (error) throw new Error(error.message);
      }

      if (files.length > 0 && entryId) {
        const startPos = existingImages.length;
        for (let i = 0; i < files.length; i++) {
          const url = await uploadImage(files[i]);
          await supabase.from('photo_images').insert({
            photo_id: entryId,
            image_url: url,
            position: startPos + i,
          });
          if (i === 0 && existingImages.length === 0) {
            await supabase.from('photos').update({ image_url: url }).eq('id', entryId);
          }
        }
      }

      await onRefresh();
      setMode('list');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setDeleting(id);
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) { setErr(error.message); setDeleting(null); return; }
    await onRefresh();
    setDeleting(null);
  };

  if (mode === 'add' || mode === 'edit') {
    const allPreviews = [
      ...existingImages.map(i => ({ type: 'existing' as const, url: i.image_url, id: i.id })),
      ...previews.map((url, idx) => ({ type: 'new' as const, url, id: String(idx) })),
    ];

    return (
      <div className="crn-form">
        <div className="crn-form-head">
          <h3>{mode === 'add' ? 'Nouveau billet' : 'Modifier le billet'}</h3>
          <button className="crn-back" onClick={() => setMode('list')}>Annuler</button>
        </div>

        {/* Images gallery */}
        <div className="crn-gallery">
          {allPreviews.map((p, idx) => (
            <div key={`${p.type}-${p.id}`} className="crn-gallery-item">
              <img src={p.url} alt={`Photo ${idx + 1}`} />
              <button
                className="crn-gallery-rm"
                onClick={() => p.type === 'existing' ? removeExistingImage(p.id) : removeNewFile(Number(p.id))}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button className="crn-gallery-add" onClick={() => fileRef.current?.click()}>
            <Plus size={20} />
            <span>Ajouter</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden />
        </div>
        <p className="crn-hint">Les images sont optionnelles. Vous pouvez en ajouter plusieurs.</p>

        <div className="crn-fields">
          <div className="crn-row2">
            <label>
              <span>Titre</span>
              <input className="field" placeholder="Ex: Renovation tableau" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              <span>Auteur</span>
              <input className="field" placeholder="Nom de la personne" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            </label>
          </div>
          <div className="crn-row2">
            <label>
              <span>Ville</span>
              <div className="city-autocomplete" ref={cityInputRef}>
                <input
                  className="field"
                  placeholder="Tapez un nom ou code postal..."
                  value={form.city}
                  onChange={e => handleCityInput(e.target.value)}
                  onFocus={() => { if (form.city.trim().length >= 1) handleCityInput(form.city); }}
                />
                {form.cityLat !== 0 && <MapPin size={13} className="city-check" />}
                {showCityDropdown && (
                  <div className="city-dropdown">
                    {citySuggestions.map(c => (
                      <button
                        key={c.id}
                        className="city-option"
                        type="button"
                        onClick={() => selectCity(c)}
                      >
                        <span className="city-option-name">{c.name}</span>
                        <span className="city-option-code">{c.postal_code}</span>
                        {c.department && <span className="city-option-dept">{c.department}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label>
              <span>Date</span>
              <input className="field" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea className="field crn-textarea" placeholder="Ce qu'on a fait, ce qu'on a trouve..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="crn-check">
            <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} />
            <span>Publier sur le site</span>
          </label>
        </div>

        {err && <p className="adm-msg adm-err">{err}</p>}

        <button className="btn-pink crn-save" onClick={handleSave} disabled={saving}>
          <Save size={15} />
          {saving ? 'Enregistrement...' : mode === 'add' ? 'Creer le billet' : 'Enregistrer'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="crn-head">
        <span className="crn-count">{photos.length} billet{photos.length > 1 ? 's' : ''}</span>
        <button className="btn-pink crn-add" onClick={openAdd}>
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {photos.length === 0 && (
        <div className="crn-empty">
          <ImageIcon size={40} />
          <p>Aucun billet dans le carnet.</p>
          <span>Ajoutez votre premier billet pour commencer.</span>
        </div>
      )}

      <div className="crn-grid">
        {photos.map(p => {
          const imgCount = (p.images?.length ?? 0) + (p.image_url && !p.images?.length ? 1 : 0);
          const thumbUrl = p.images?.[0]?.image_url || p.image_url;
          return (
            <div key={p.id} className="crn-card">
              {thumbUrl ? (
                <div className="crn-img-wrap">
                  <img src={thumbUrl} alt={p.title} className="crn-img" />
                  {imgCount > 1 && <span className="crn-img-count">{imgCount} photos</span>}
                </div>
              ) : (
                <div className="crn-img crn-img-empty"><ImageIcon size={24} /></div>
              )}
              <div className="crn-card-body">
                <div className="crn-card-top">
                  <h4>{p.title}</h4>
                  <span className="crn-pub">{p.published ? <Eye size={13} /> : <EyeOff size={13} />}</span>
                </div>
                <div className="crn-card-meta">
                  {p.author && <span>{p.author}</span>}
                  {p.city && <span><MapPin size={10} /> {p.city}</span>}
                  <span>{fmtDate(p.created_at)}</span>
                </div>
                {p.description && <p className="crn-card-desc">{p.description}</p>}
                <div className="crn-card-actions">
                  <button className="crn-btn-edit" onClick={() => openEdit(p)}><Pencil size={13} /> Modifier</button>
                  <button className="crn-btn-del" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}>
                    <Trash2 size={13} /> {deleting === p.id ? '...' : 'Supprimer'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Partners Tab ── */
function PartnersTab({ partners, onRefresh }: { partners: PartnerRow[]; onRefresh: () => Promise<void> }) {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const resetForm = () => { setName(''); setDescription(''); setPublished(true); setLogoFile(null); setLogoPreview(''); setEditId(null); setErr(''); };

  const openAdd = () => { resetForm(); setMode('add'); };
  const openEdit = (p: PartnerRow) => {
    setName(p.name);
    setDescription(p.description);
    setPublished(p.published);
    setLogoPreview(p.logo_url);
    setEditId(p.id);
    setErr('');
    setMode('edit');
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
      const row = { name: name.trim(), description: description.trim(), published, logo_url: logoUrl, position: partners.length };
      if (mode === 'add') {
        const { error } = await supabase.from('partners').insert(row);
        if (error) throw new Error(error.message);
      } else if (editId) {
        const { error } = await supabase.from('partners').update(row).eq('id', editId);
        if (error) throw new Error(error.message);
      }
      await onRefresh();
      setMode('list');
      resetForm();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setDeleting(id);
    await supabase.from('partners').delete().eq('id', id);
    await onRefresh();
    setDeleting(null);
  };

  if (mode === 'add' || mode === 'edit') {
    return (
      <div className="crn-form">
        <div className="crn-form-head">
          <h3>{mode === 'add' ? 'Nouveau partenaire' : 'Modifier le partenaire'}</h3>
          <button className="crn-back" onClick={() => { setMode('list'); resetForm(); }}>Annuler</button>
        </div>
        {logoPreview && <div className="crn-gallery"><div className="crn-gallery-item"><img src={logoPreview} alt="Logo" /></div></div>}
        <label className="crn-gallery-add" style={{ display: 'inline-flex', marginBottom: 12 }}>
          <Upload size={16} /> Logo
          <input type="file" accept="image/*" onChange={handleLogoFile} hidden />
        </label>
        <div className="crn-fields">
          <label><span>Nom</span><input className="field" placeholder="Ex: Legrand" value={name} onChange={e => setName(e.target.value)} /></label>
          <label><span>Description</span><textarea className="field crn-textarea" placeholder="Pourquoi on travaille avec eux..." value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label className="crn-check"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /><span>Visible sur le site</span></label>
        </div>
        {err && <p className="adm-msg adm-err">{err}</p>}
        <button className="btn-pink crn-save" onClick={handleSave} disabled={saving}>
          <Save size={15} /> {saving ? 'Enregistrement...' : mode === 'add' ? 'Creer' : 'Enregistrer'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="crn-head">
        <span className="crn-count">{partners.length} partenaire{partners.length > 1 ? 's' : ''}</span>
        <button className="btn-pink crn-add" onClick={openAdd}><Plus size={15} /> Ajouter</button>
      </div>
      {partners.length === 0 && (
        <div className="crn-empty"><Handshake size={40} /><p>Aucun partenaire.</p><span>Ajoutez votre premier partenaire.</span></div>
      )}
      <div className="crn-grid">
        {partners.map(p => (
          <div key={p.id} className="crn-card">
            {p.logo_url ? (
              <div className="crn-img-wrap"><img src={p.logo_url} alt={p.name} className="crn-img" style={{ objectFit: 'contain', padding: 12 }} /></div>
            ) : (
              <div className="crn-img crn-img-empty"><Handshake size={24} /></div>
            )}
            <div className="crn-card-body">
              <div className="crn-card-top"><h4>{p.name}</h4><span className="crn-pub">{p.published ? <Eye size={13} /> : <EyeOff size={13} />}</span></div>
              {p.description && <p className="crn-card-desc">{p.description}</p>}
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
