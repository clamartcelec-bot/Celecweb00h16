import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Mic, MicOff, RotateCcw, ShieldCheck } from 'lucide-react';
import type { RequestCategory } from '../types';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const TOPICS: Array<{ label: string; category: RequestCategory }> = [
  { label: "J'ai une panne", category: 'depannage' },
  { label: "J'ai des travaux", category: 'travaux' },
  { label: "J'ai un projet", category: 'projet' },
  { label: 'Je ne sais pas vraiment', category: 'question' },
];

function useRise() {
  const reduce = useReducedMotion();
  return (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: reduce ? 0 : 0.8, ease: EASE, delay: reduce ? 0 : delay },
  });
}

function Headline({ lead, accent }: { lead: string; accent: string }) {
  const rise = useRise();
  return (
    <motion.h1 className="concierge-title" {...rise(0.05)}>
      {lead} <em>{accent}</em>
    </motion.h1>
  );
}

export function IdleView({
  greeting,
  knowledgeReady,
  onStart,
}: {
  greeting: string;
  knowledgeReady: boolean;
  onStart: (topic?: { label: string; category: RequestCategory }) => void;
}) {
  const rise = useRise();
  return (
    <div className="concierge-idle">
      <motion.span className="concierge-eyebrow" {...rise(0)}>
        <span className="concierge-eyebrow-dot" />
        Concierge vocal · 24/7
      </motion.span>
      <Headline lead="Bonjour," accent="parlons de votre projet." />
      <motion.p className="concierge-lead" {...rise(0.15)}>{greeting}</motion.p>

      <motion.div className="concierge-orb-wrap" {...rise(0.25)}>
        <span className="concierge-orb-ring" aria-hidden="true" />
        <span className="concierge-orb-ring concierge-orb-ring--2" aria-hidden="true" />
        <motion.button
          onClick={() => onStart()}
          className="concierge-start-btn"
          disabled={!knowledgeReady}
          whileHover={knowledgeReady ? { scale: 1.03 } : undefined}
          whileTap={knowledgeReady ? { scale: 0.97 } : undefined}
        >
          <span className="concierge-start-icon">
            {knowledgeReady ? <Mic size={22} /> : <Loader2 size={22} className="concierge-spin" />}
          </span>
          {knowledgeReady ? 'Parler à CELEC' : 'Préparation du carnet…'}
        </motion.button>
      </motion.div>

      <motion.div className="concierge-quick-topics" {...rise(0.35)}>
        <span className="concierge-topics-label">Ou commencez par</span>
        <div className="concierge-topics-row">
          {TOPICS.map((topic, index) => (
            <motion.button
              key={topic.category}
              onClick={() => onStart(topic)}
              className="concierge-topic"
              disabled={!knowledgeReady}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.45 + index * 0.06 }}
            >
              {topic.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      <motion.p className="concierge-disclosure" {...rise(0.5)}>
        <ShieldCheck size={15} />
        <span>
          Vous allez parler avec le concierge numérique de CELEC. Il s’appuie sur notre carnet d’interventions publié et sur nos partenaires pour vous répondre, et affiche à l’écran les éléments dont il parle.
        </span>
      </motion.p>
    </div>
  );
}

export function UnavailableView() {
  const rise = useRise();
  return (
    <div className="concierge-idle">
      <Headline lead="Bonjour." accent="Petite pause." />
      <motion.p className="concierge-lead" {...rise(0.15)}>
        Le concierge numérique est momentanément indisponible.
      </motion.p>
      <motion.a className="concierge-ghost-btn" href="/#contact-box" {...rise(0.25)}>
        Nous écrire
      </motion.a>
    </div>
  );
}

export function ConnectingView({ label }: { label: string }) {
  return (
    <div className="concierge-connecting" role="status">
      <div className="concierge-pulse" aria-hidden="true">
        <span />
        <span />
        <span />
        <Mic size={24} />
      </div>
      <motion.p key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {label}
      </motion.p>
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const rise = useRise();
  return (
    <div className="concierge-error">
      <motion.span className="concierge-error-icon" {...rise(0)}>
        <MicOff size={28} />
      </motion.span>
      <motion.p className="concierge-error-msg" {...rise(0.1)}>{error || 'Une erreur est survenue.'}</motion.p>
      <motion.button onClick={onRetry} className="concierge-primary-btn" {...rise(0.2)} whileTap={{ scale: 0.97 }}>
        <RotateCcw size={18} />
        Réessayer
      </motion.button>
    </div>
  );
}
