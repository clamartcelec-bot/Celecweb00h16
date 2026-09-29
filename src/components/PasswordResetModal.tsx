import { useState, useEffect } from 'react';
import { X, KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Lang } from './types';

interface PasswordResetModalProps {
  lang: Lang;
  mode: 'request' | 'update';
  linkExpired?: boolean;
  onClose: () => void;
  onAuthed: () => void;
}

const labels = {
  fr: {
    requestTitle: 'Mot de passe oublié',
    requestSub: 'Indiquez votre e-mail\u202f: nous vous envoyons un lien pour choisir un nouveau mot de passe.',
    email: 'Votre e-mail',
    send: 'Envoyer le lien',
    sentTitle: 'Lien envoyé',
    sentText: 'Si un compte existe pour cette adresse, le lien vient de partir. Pensez à regarder dans les spams.',
    close: 'Fermer',
    updateTitle: 'Nouveau mot de passe',
    updateSub: 'Choisissez un nouveau mot de passe pour retrouver votre compte et vos demandes.',
    newPassword: 'Nouveau mot de passe',
    confirm: 'Confirmer le mot de passe',
    update: 'Valider le nouveau mot de passe',
    updated: 'Mot de passe mis à jour. Vous êtes connecté.',
    continue: 'Continuer',
    pwTooShort: 'Le mot de passe doit faire au moins 6 caractères.',
    pwMismatch: 'Les mots de passe ne correspondent pas.',
    invalidLink: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    backToLogin: 'Retour à la connexion',
  },
  en: {
    requestTitle: 'Forgot password',
    requestSub: 'Enter your e-mail and we\u2019ll send you a link to choose a new password.',
    email: 'Your e-mail',
    send: 'Send the link',
    sentTitle: 'Link sent',
    sentText: 'If an account exists for this address, the link is on its way. Remember to check your spam folder.',
    close: 'Close',
    updateTitle: 'New password',
    updateSub: 'Choose a new password to get back to your account and requests.',
    newPassword: 'New password',
    confirm: 'Confirm password',
    update: 'Set my new password',
    updated: 'Password updated. You are signed in.',
    continue: 'Continue',
    pwTooShort: 'Password must be at least 6 characters.',
    pwMismatch: 'Passwords do not match.',
    invalidLink: 'This link has expired or was already used. Request a new one.',
    backToLogin: 'Back to login',
  },
  es: {
    requestTitle: 'Contrase\u00f1a olvidada',
    requestSub: 'Indique su e-mail y le enviaremos un enlace para elegir una nueva contrase\u00f1a.',
    email: 'Su e-mail',
    send: 'Enviar el enlace',
    sentTitle: 'Enlace enviado',
    sentText: 'Si existe una cuenta para esta direcci\u00f3n, el enlace ya sali\u00f3. Revise tambi\u00e9n el correo no deseado.',
    close: 'Cerrar',
    updateTitle: 'Nueva contrase\u00f1a',
    updateSub: 'Elija una nueva contrase\u00f1a para recuperar su cuenta y sus solicitudes.',
    newPassword: 'Nueva contrase\u00f1a',
    confirm: 'Confirmar contrase\u00f1a',
    update: 'Confirmar la nueva contrase\u00f1a',
    updated: 'Contrase\u00f1a actualizada. Ha iniciado sesi\u00f3n.',
    continue: 'Continuar',
    pwTooShort: 'La contrase\u00f1a debe tener al menos 6 caracteres.',
    pwMismatch: 'Las contrase\u00f1as no coinciden.',
    invalidLink: 'Este enlace ha caducado o ya se us\u00f3. Solicite uno nuevo.',
    backToLogin: 'Volver al inicio de sesi\u00f3n',
  },
  ar: {
    requestTitle: '\u0646\u0633\u064a\u062a \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    requestSub: '\u0623\u062f\u062e\u0644 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0648\u0633\u0646\u0631\u0633\u0644 \u0644\u0643 \u0631\u0627\u0628\u0637\u0627\u064b \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629.',
    email: '\u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
    send: '\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0627\u0628\u0637',
    sentTitle: '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0627\u0628\u0637',
    sentText: '\u0625\u0630\u0627 \u0648\u062c\u062f \u062d\u0633\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0641\u0642\u062f \u0623\u064f\u0631\u0633\u0644 \u0627\u0644\u0631\u0627\u0628\u0637. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0645\u062c\u0644\u062f \u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u063a\u064a\u0631 \u0627\u0644\u0645\u0631\u063a\u0648\u0628 \u0641\u064a\u0647\u0627.',
    close: '\u0625\u063a\u0644\u0627\u0642',
    updateTitle: '\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629',
    updateSub: '\u0627\u062e\u062a\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629 \u0644\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u062d\u0633\u0627\u0628\u0643.',
    newPassword: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629',
    confirm: '\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    update: '\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    updated: '\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631. \u0623\u0646\u062a \u0645\u062a\u0635\u0644 \u0627\u0644\u0622\u0646.',
    continue: '\u0645\u062a\u0627\u0628\u0639\u0629',
    pwTooShort: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064a\u062c\u0628 \u0623\u0646 \u062a\u062d\u062a\u0648\u064a \u0639\u0644\u0649 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.',
    pwMismatch: '\u0643\u0644\u0645\u062a\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0645\u062a\u0637\u0627\u0628\u0642\u062a\u064a\u0646.',
    invalidLink: '\u0627\u0646\u062a\u0647\u062a \u0635\u0644\u0627\u062d\u064a\u0629 \u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637. \u0627\u0637\u0644\u0628 \u0631\u0627\u0628\u0637\u0627\u064b \u062c\u062f\u064a\u062f\u0627\u064b.',
    backToLogin: '\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
  },
};

export function PasswordResetModal({ lang, mode, linkExpired, onClose, onAuthed }: PasswordResetModalProps) {
  const l = labels[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (linkExpired) setError(l.invalidLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkExpired]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const requestReset = async () => {
    if (!email.trim() || !supabase) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  const submitNewPassword = async () => {
    if (!supabase) return;
    if (password.length < 6) { setError(l.pwTooShort); return; }
    if (password !== confirmPw) { setError(l.pwMismatch); return; }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message.includes('session') ? l.invalidLink : err.message);
      return;
    }
    window.history.replaceState(null, '', window.location.pathname);
    setDone(true);
    onAuthed();
  };

  const close = () => {
    window.history.replaceState(null, '', window.location.pathname);
    onClose();
  };

  return (
    <div className="overlay" onClick={close}>
      <div className="modal login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={close}><X size={18} /></button>

        {mode === 'request' && (
          <>
            <KeyRound size={26} className="modal-top-icon" />
            <h2>{l.requestTitle}</h2>
            {sent ? (
              <>
                <MailCheck size={30} className="pw-reset-success-icon" />
                <h3 className="pw-reset-success-title">{l.sentTitle}</h3>
                <p className="modal-p">{l.sentText}</p>
                <button className="btn-pink full" onClick={close}>{l.close}</button>
              </>
            ) : (
              <>
                <p className="modal-p">{l.requestSub}</p>
                <input
                  className="field"
                  type="email"
                  placeholder={l.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') requestReset(); }}
                  autoFocus
                />
                <button className="btn-pink full" onClick={requestReset} disabled={loading || !email.trim()}>
                  {loading ? '...' : l.send}
                </button>
              </>
            )}
          </>
        )}

        {mode === 'update' && (
          <>
            <ShieldCheck size={26} className="modal-top-icon" />
            <h2>{l.updateTitle}</h2>
            {done ? (
              <>
                <p className="confirm-txt">{l.updated}</p>
                <button className="btn-pink full" onClick={close}>{l.continue}</button>
              </>
            ) : (
              <>
                <p className="modal-p">{l.updateSub}</p>
                <input
                  className="field"
                  type="password"
                  placeholder={l.newPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <input
                  className="field"
                  type="password"
                  placeholder={l.confirm}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitNewPassword(); }}
                />
                <button className="btn-pink full" onClick={submitNewPassword} disabled={loading || !password || !confirmPw}>
                  {loading ? '...' : l.update}
                </button>
                <p className="login-switch">
                  <button className="link-btn" onClick={close}>{l.backToLogin}</button>
                </p>
              </>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
