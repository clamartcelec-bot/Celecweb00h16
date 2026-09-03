import { useState, useEffect } from 'react';
import {
  X, UserRound, FileText, Phone, MessageSquare,
  Calendar, ChevronDown, ChevronUp, LogOut, Mail, Clock,
  MapPin, Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Invoice {
  id: string;
  number: string;
  label: string;
  amount: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
}

interface Exchange {
  id: string;
  type: string;
  summary: string;
  details: string | null;
  author: string;
  happened_at: string;
}

interface RequestRow {
  id: string;
  category: string;
  description: string | null;
  status: string;
  created_at: string;
  callback_requested: boolean;
}

interface Profile {
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

interface ClientSpaceProps {
  onClose: () => void;
  onLogout: () => void;
}

type Tab = 'overview' | 'requests' | 'invoices' | 'exchanges';

const statusLabel: Record<string, string> = {
  new: 'Nouveau',
  to_call: 'A rappeler',
  in_progress: 'En cours',
  waiting_client: 'En attente',
  scheduled: 'Planifie',
  done: 'Termine',
  draft: 'Brouillon',
  sent: 'Envoyee',
  paid: 'Payee',
  overdue: 'En retard',
};

const statusColor: Record<string, string> = {
  new: '#e8336a',
  to_call: '#f59e0b',
  in_progress: '#3b82f6',
  waiting_client: '#a78bfa',
  scheduled: '#10b981',
  done: '#6b7280',
  draft: '#6b7280',
  sent: '#3b82f6',
  paid: '#10b981',
  overdue: '#ef4444',
};

const typeIcon: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  visit: MapPin,
  sms: MessageSquare,
  note: FileText,
};

export function ClientSpace({ onClose, onLogout }: ClientSpaceProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [profRes, reqRes, invRes, exRes] = await Promise.all([
      supabase.from('profiles').select('email, full_name, phone, created_at').eq('id', user.id).maybeSingle(),
      supabase.from('requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('user_id', user.id).order('issued_at', { ascending: false }),
      supabase.from('exchanges').select('*').eq('user_id', user.id).order('happened_at', { ascending: false }),
    ]);

    if (profRes.data) setProfile(profRes.data);
    setRequests(reqRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setExchanges(exRes.data ?? []);
    setLoading(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    onLogout();
    onClose();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtAmount = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'overview', label: 'Apercu', count: 0 },
    { key: 'requests', label: 'Demandes', count: requests.length },
    { key: 'invoices', label: 'Factures', count: invoices.length },
    { key: 'exchanges', label: 'Echanges', count: exchanges.length },
  ];

  return (
    <div className="overlay cs-overlay" onClick={onClose}>
      <div className="cs-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cs-header">
          <div className="cs-header-left">
            <div className="cs-avatar">
              {profile?.email?.charAt(0).toUpperCase() ?? 'C'}
            </div>
            <div>
              <div className="cs-name">{profile?.full_name || profile?.email?.split('@')[0] || 'Client'}</div>
              <div className="cs-email">{profile?.email}</div>
            </div>
          </div>
          <div className="cs-header-actions">
            <button className="cs-logout" onClick={handleLogout}>
              <LogOut size={15} /> Deconnexion
            </button>
            <button className="modal-x" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="cs-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`cs-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.count > 0 && <span className="cs-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="cs-content">
          {loading && <p className="cs-loading">Chargement...</p>}

          {!loading && tab === 'overview' && (
            <div className="cs-overview">
              <div className="cs-stat-row">
                <div className="cs-stat">
                  <span className="cs-stat-n">{requests.length}</span>
                  <span className="cs-stat-label">Demandes</span>
                </div>
                <div className="cs-stat">
                  <span className="cs-stat-n">{invoices.length}</span>
                  <span className="cs-stat-label">Factures</span>
                </div>
                <div className="cs-stat">
                  <span className="cs-stat-n">{exchanges.length}</span>
                  <span className="cs-stat-label">Echanges</span>
                </div>
              </div>

              {requests.length === 0 && invoices.length === 0 && exchanges.length === 0 && (
                <div className="cs-empty-main">
                  <UserRound size={40} />
                  <p>Votre espace client est pret.</p>
                  <p className="cs-empty-sub">Vos demandes, factures et echanges avec CELEC apparaitront ici.</p>
                </div>
              )}

              {/* Last 3 items of each */}
              {requests.length > 0 && (
                <div className="cs-section">
                  <div className="cs-section-head">
                    <h3>Dernieres demandes</h3>
                    <button className="cs-see-all" onClick={() => setTab('requests')}>Tout voir</button>
                  </div>
                  {requests.slice(0, 3).map(r => (
                    <div key={r.id} className="cs-item">
                      <span className="cs-item-status" style={{ color: statusColor[r.status] }}>{statusLabel[r.status] || r.status}</span>
                      <span className="cs-item-desc">{r.description || r.category}</span>
                      <span className="cs-item-date">{fmtDate(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {invoices.length > 0 && (
                <div className="cs-section">
                  <div className="cs-section-head">
                    <h3>Dernieres factures</h3>
                    <button className="cs-see-all" onClick={() => setTab('invoices')}>Tout voir</button>
                  </div>
                  {invoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="cs-item">
                      <span className="cs-item-status" style={{ color: statusColor[inv.status] }}>{statusLabel[inv.status] || inv.status}</span>
                      <span className="cs-item-desc">{inv.number} - {inv.label}</span>
                      <span className="cs-item-amount">{fmtAmount(inv.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {exchanges.length > 0 && (
                <div className="cs-section">
                  <div className="cs-section-head">
                    <h3>Derniers echanges</h3>
                    <button className="cs-see-all" onClick={() => setTab('exchanges')}>Tout voir</button>
                  </div>
                  {exchanges.slice(0, 3).map(ex => {
                    const Icon = typeIcon[ex.type] || MessageSquare;
                    return (
                      <div key={ex.id} className="cs-item">
                        <Icon size={14} className="cs-item-icon" />
                        <span className="cs-item-desc">{ex.summary}</span>
                        <span className="cs-item-date">{fmtDate(ex.happened_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!loading && tab === 'requests' && (
            <div className="cs-list">
              {requests.length === 0 && <p className="cs-empty">Aucune demande pour le moment.</p>}
              {requests.map(r => (
                <div key={r.id} className={`cs-card ${expandedReq === r.id ? 'expanded' : ''}`} onClick={() => setExpandedReq(expandedReq === r.id ? null : r.id)}>
                  <div className="cs-card-top">
                    <span className="cs-tag">{r.category}</span>
                    <span className="cs-card-status" style={{ color: statusColor[r.status] }}>{statusLabel[r.status] || r.status}</span>
                    <span className="cs-card-date">{fmtDate(r.created_at)}</span>
                    {expandedReq === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {r.description && <p className="cs-card-desc">{r.description}</p>}
                  {expandedReq === r.id && (
                    <div className="cs-card-detail">
                      {r.callback_requested && <span className="cs-badge">Rappel demande</span>}
                      <span className="cs-card-meta"><Clock size={12} /> Cree le {fmtDate(r.created_at)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'invoices' && (
            <div className="cs-list">
              {invoices.length === 0 && <p className="cs-empty">Aucune facture pour le moment.</p>}
              {invoices.map(inv => (
                <div key={inv.id} className="cs-card">
                  <div className="cs-card-top">
                    <span className="cs-tag">{inv.number}</span>
                    <span className="cs-card-status" style={{ color: statusColor[inv.status] }}>{statusLabel[inv.status] || inv.status}</span>
                    <span className="cs-card-amount">{fmtAmount(inv.amount)}</span>
                  </div>
                  <p className="cs-card-desc">{inv.label}</p>
                  <div className="cs-card-detail">
                    <span className="cs-card-meta"><Calendar size={12} /> Emise le {fmtDate(inv.issued_at)}</span>
                    {inv.paid_at && <span className="cs-card-meta cs-paid">Payee le {fmtDate(inv.paid_at)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'exchanges' && (
            <div className="cs-list">
              {exchanges.length === 0 && <p className="cs-empty">Aucun echange pour le moment.</p>}
              {exchanges.map(ex => {
                const Icon = typeIcon[ex.type] || MessageSquare;
                return (
                  <div key={ex.id} className="cs-card">
                    <div className="cs-card-top">
                      <span className="cs-ex-type"><Icon size={13} /> {ex.type}</span>
                      <span className="cs-card-author">{ex.author}</span>
                      <span className="cs-card-date">{fmtDate(ex.happened_at)}</span>
                    </div>
                    <p className="cs-card-desc">{ex.summary}</p>
                    {ex.details && <p className="cs-card-details">{ex.details}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
