import { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';

export function AdminLogin({ t, onSuccess, onForgot }: { t: Copy; onSuccess: () => void; onForgot: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !pw || !supabase) return;
    setLoading(true);
    setError('');
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (err) { setError(err.message); setLoading(false); return; }
    const userId = signInData.user?.id;
    if (!userId) { setError('Erreur de connexion.'); setLoading(false); return; }
    const { data: prof, error: profErr } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profErr || prof?.role !== 'admin') {
      setError(t.teamOnly);
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="s-page s-login-page">
      <div className="s-aura s-aura--page" aria-hidden="true" />
      <motion.div className="s-login-card" initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE_OUT }}>
        <span className="s-login-icon"><Lock size={22} /></span>
        <h1>{t.loginTitle}</h1>
        <p>{t.loginSub}</p>
        <form onSubmit={(e) => { e.preventDefault(); void handleLogin(); }}>
          <label className="s-field">
            <span>{t.email}</span>
            <input className="s-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="s-field">
            <span>{t.password}</span>
            <input className="s-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <button className="s-btn s-btn--primary s-btn--block" type="submit" disabled={loading || !email.trim() || !pw}>
            {loading && <Loader2 size={16} className="s-spin" />}
            {t.signIn}
          </button>
        </form>
        <button className="s-link s-link--muted" onClick={onForgot}>{t.forgot}</button>
        {error && <p className="s-error">{error}</p>}
      </motion.div>
    </div>
  );
}
