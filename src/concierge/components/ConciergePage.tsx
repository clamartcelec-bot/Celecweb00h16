import { useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, ArrowLeft, AlertTriangle, RotateCcw } from 'lucide-react';
import { useRealtimeSession } from '../hooks/useRealtimeSession';
import { useConversationTimer } from '../hooks/useConversationTimer';
import '../concierge.css';

export function ConciergePage() {
  const {
    status,
    error,
    start,
    stop,
    injectSystemMessage,
  } = useRealtimeSession();

  const hasInjectedWarningRef = useRef(false);

  const onApproachingEnd = useCallback(() => {
    if (!hasInjectedWarningRef.current) {
      hasInjectedWarningRef.current = true;
      injectSystemMessage(
        'INSTRUCTION INTERNE : Il reste environ 2 minutes de conversation. Commence à conclure naturellement, résume ce qui a été compris et propose de transmettre la demande.'
      );
    }
  }, [injectSystemMessage]);

  const onCutoff = useCallback(() => {
    stop();
  }, [stop]);

  const timer = useConversationTimer(
    status === 'connected',
    onApproachingEnd,
    onCutoff,
  );

  useEffect(() => {
    if (status !== 'connected') {
      hasInjectedWarningRef.current = false;
    }
  }, [status]);

  const handleStart = () => {
    start();
  };

  const handleEnd = () => {
    stop();
  };

  const handleRetry = () => {
    start();
  };

  const handleGoBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="concierge-page">
      <header className="concierge-header">
        <button onClick={handleGoBack} className="concierge-back" aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <span className="concierge-logo">CELEC</span>
        <div className="concierge-header-spacer" />
      </header>

      <main className="concierge-main">
        {status === 'idle' && <IdleView onStart={handleStart} />}
        {status === 'requesting-mic' && <ConnectingView label="Autorisation du micro..." />}
        {status === 'connecting' && <ConnectingView label="Connexion en cours..." />}
        {status === 'connected' && (
          <ActiveView
            timer={timer}
            onEnd={handleEnd}
          />
        )}
        {status === 'error' && <ErrorView error={error} onRetry={handleRetry} />}
        {status === 'ended' && <EndedView onRestart={handleRetry} onBack={handleGoBack} />}
      </main>
    </div>
  );
}

function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <div className="concierge-idle">
      <div className="concierge-greeting">
        <h1>Bonjour.</h1>
        <p>Comment pouvons-nous vous aider ?</p>
      </div>

      <button onClick={onStart} className="concierge-start-btn">
        <Mic size={24} />
        Parler à CELEC
      </button>

      <div className="concierge-quick-topics">
        <button onClick={onStart} className="concierge-topic">J'ai une panne</button>
        <button onClick={onStart} className="concierge-topic">J'ai des travaux</button>
        <button onClick={onStart} className="concierge-topic">J'ai un projet</button>
        <button onClick={onStart} className="concierge-topic">Je ne sais pas vraiment</button>
      </div>

      <p className="concierge-disclosure">
        Vous allez parler avec le concierge numérique de CELEC. La conversation peut être retranscrite afin de transmettre correctement votre demande à l'équipe.
      </p>
    </div>
  );
}

function ConnectingView({ label }: { label: string }) {
  return (
    <div className="concierge-connecting">
      <div className="concierge-pulse" />
      <p>{label}</p>
    </div>
  );
}

interface ActiveViewProps {
  timer: { formatted: string; warningLevel: 'none' | 'approaching' | 'ending' };
  onEnd: () => void;
}

function ActiveView({ timer, onEnd }: ActiveViewProps) {
  return (
    <div className="concierge-active">
      <div className="concierge-status-row">
        <div className="concierge-live-dot" />
        <span>Conversation en cours</span>
        <span className={`concierge-timer ${timer.warningLevel !== 'none' ? 'concierge-timer--warn' : ''}`}>
          {timer.formatted}
        </span>
      </div>

      {timer.warningLevel === 'ending' && (
        <div className="concierge-ending-notice">
          <AlertTriangle size={16} />
          La conversation va se terminer
        </div>
      )}

      <div className="concierge-audio-viz">
        <div className="concierge-viz-column">
          <span className="concierge-viz-label">VOUS</span>
          <div className="concierge-viz-bars">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="concierge-viz-bar concierge-viz-bar--user" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
        <div className="concierge-viz-column">
          <span className="concierge-viz-label">CELEC</span>
          <div className="concierge-viz-bars">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="concierge-viz-bar concierge-viz-bar--celec" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>
      </div>

      <div className="concierge-controls">
        <button className="concierge-mic-btn concierge-mic-btn--active" aria-label="Micro actif">
          <Mic size={20} />
        </button>
        <button onClick={onEnd} className="concierge-end-btn">
          <PhoneOff size={20} />
          Terminer
        </button>
      </div>
    </div>
  );
}

function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="concierge-error">
      <MicOff size={48} className="concierge-error-icon" />
      <p className="concierge-error-msg">{error || 'Une erreur est survenue.'}</p>
      <button onClick={onRetry} className="concierge-retry-btn">
        <RotateCcw size={18} />
        Réessayer
      </button>
    </div>
  );
}

function EndedView({ onRestart, onBack }: { onRestart: () => void; onBack: () => void }) {
  return (
    <div className="concierge-ended">
      <h2>Merci pour votre appel.</h2>
      <p>Si vous avez transmis une demande, l'équipe CELEC la traitera dans les meilleurs délais.</p>
      <div className="concierge-ended-actions">
        <button onClick={onRestart} className="concierge-restart-btn">
          <RotateCcw size={18} />
          Nouvel appel
        </button>
        <button onClick={onBack} className="concierge-back-btn">
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
