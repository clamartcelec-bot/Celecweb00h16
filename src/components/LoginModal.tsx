import { useState, useEffect } from 'react';
import { X, Mail, UserRound, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Lang } from './types';

interface LoginModalProps {
  lang: Lang;
  onClose: () => void;
  onAuthed: () => void;
}

const labels = {
  fr: {
    title: 'Se connecter',
    sub: 'Retrouvez vos demandes et l\u2019historique de votre installation.',
    email: 'Votre e-mail',
    password: 'Mot de passe',
    login: 'Se connecter',
    signup: 'Cr\u00e9er un compte',
    back: 'Retour',
    noAccount: 'Pas encore de compte\u202f?',
    haveAccount: 'D\u00e9j\u00e0 un compte\u202f?',
    signupTitle: 'Cr\u00e9er un compte',
    signupSub: 'Activez votre suivi et retrouvez votre historique.',
    confirm: 'Confirmer le mot de passe',
    create: 'Cr\u00e9er mon compte',
    pwTooShort: 'Le mot de passe doit faire au moins 6 caract\u00e8res.',
    pwMismatch: 'Les mots de passe ne correspondent pas.',
  },
  en: {
    title: 'Log in',
    sub: 'Find your requests and installation history.',
    email: 'Your e-mail',
    password: 'Password',
    login: 'Log in',
    signup: 'Create account',
    back: 'Back',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    signupTitle: 'Create account',
    signupSub: 'Activate your follow-up and find your history.',
    confirm: 'Confirm password',
    create: 'Create my account',
    pwTooShort: 'Password must be at least 6 characters.',
    pwMismatch: 'Passwords do not match.',
  },
  es: {
    title: 'Iniciar sesi\u00f3n',
    sub: 'Encuentre sus solicitudes y el historial de su instalaci\u00f3n.',
    email: 'Su e-mail',
    password: 'Contrase\u00f1a',
    login: 'Iniciar sesi\u00f3n',
    signup: 'Crear cuenta',
    back: 'Volver',
    noAccount: '\u00bfSin cuenta a\u00fan?',
    haveAccount: '\u00bfYa tiene cuenta?',
    signupTitle: 'Crear cuenta',
    signupSub: 'Active su seguimiento y encuentre su historial.',
    confirm: 'Confirmar contrase\u00f1a',
    create: 'Crear mi cuenta',
    pwTooShort: 'La contrase\u00f1a debe tener al menos 6 caracteres.',
    pwMismatch: 'Las contrase\u00f1as no coinciden.',
  },
  ar: {
    title: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
    sub: '\u0627\u0639\u062b\u0631 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062a\u0643 \u0648\u062a\u0627\u0631\u064a\u062e \u062a\u0631\u0643\u064a\u0628\u0643.',
    email: '\u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
    password: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    login: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
    signup: '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628',
    back: '\u0631\u062c\u0648\u0639',
    noAccount: '\u0644\u064a\u0633 \u0644\u062f\u064a\u0643 \u062d\u0633\u0627\u0628\u061f',
    haveAccount: '\u0644\u062f\u064a\u0643 \u062d\u0633\u0627\u0628 \u0628\u0627\u0644\u0641\u0639\u0644\u061f',
    signupTitle: '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628',
    signupSub: '\u0641\u0639\u0651\u0644 \u0645\u062a\u0627\u0628\u0639\u062a\u0643 \u0648\u0627\u0639\u062b\u0631 \u0639\u0644\u0649 \u0633\u062c\u0644\u0643.',
    confirm: '\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    create: '\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628\u064a',
    pwTooShort: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064a\u062c\u0628 \u0623\u0646 \u062a\u062d\u062a\u0648\u064a \u0639\u0644\u0649 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.',
    pwMismatch: '\u0643\u0644\u0645\u062a\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0645\u062a\u0637\u0627\u0628\u0642\u062a\u064a\u0646.',
  },
};

export function LoginModal({ lang, onClose, onAuthed }: LoginModalProps) {
  const l = labels[lang];
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password || !supabase) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onAuthed();
    onClose();
  };

  const handleSignup = async () => {
    if (!email.trim() || !password || !supabase) return;
    if (password.length < 6) { setError(l.pwTooShort); return; }
    if (password !== confirmPw) { setError(l.pwMismatch); return; }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (data.session) {
      onAuthed();
      onClose();
    } else {
      setError('Compte cr\u00e9\u00e9. V\u00e9rifiez votre bo\u00eete mail pour confirmer.');
    }
  };

  useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t); } }, [error]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal login-modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}><X size={18} /></button>
        <UserRound size={26} className="modal-top-icon" />
        <h2>{mode === 'login' ? l.title : l.signupTitle}</h2>
        <p className="modal-p">{mode === 'login' ? l.sub : l.signupSub}</p>

        <input className="field" type="email" placeholder={l.email} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <input className="field" type="password" placeholder={l.password} value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && mode === 'login') handleLogin(); }} />

        {mode === 'signup' && (
          <input className="field" type="password" placeholder={l.confirm} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSignup(); }} />
        )}

        {mode === 'login' ? (
          <>
            <button className="btn-pink full" onClick={handleLogin} disabled={loading || !email.trim() || !password}>
              {loading ? '...' : l.login}
            </button>
            <p className="login-switch">{l.noAccount} <button className="link-btn" onClick={() => { setMode('signup'); setError(''); }}>{l.signup}</button></p>
          </>
        ) : (
          <>
            <button className="btn-pink full" onClick={handleSignup} disabled={loading || !email.trim() || !password}>
              {loading ? '...' : l.create}
            </button>
            <p className="login-switch">{l.haveAccount} <button className="link-btn" onClick={() => { setMode('login'); setError(''); }}>{l.login}</button></p>
          </>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
