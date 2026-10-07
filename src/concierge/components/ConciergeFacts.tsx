import { AnimatePresence, motion } from 'motion/react';
import { Clock, Info, MapPin, Phone, ShieldCheck, Zap } from 'lucide-react';
import type { CompanyFact } from '../services/companyFacts';

const ICONS: Record<string, typeof Clock> = { clock: Clock, map: MapPin, phone: Phone, zap: Zap, shield: ShieldCheck, info: Info };

interface ConciergeFactsProps {
  facts: CompanyFact[];
  latestKey: string | null;
  onOpen: (fact: CompanyFact) => void;
}

/** Pinned company facts ("balises"): once the concierge cites one, it stays framed on screen for the rest of the call. */
export function ConciergeFacts({ facts, latestKey, onOpen }: ConciergeFactsProps) {
  if (!facts.length) return null;

  return (
    <section className="cf-rail" aria-label="Informations CELEC épinglées">
      <span className="cf-rail-label">Fiche CELEC</span>
      <div className="cf-list">
        <AnimatePresence initial={false}>
          {facts.map((fact) => {
            const Icon = ICONS[fact.icon] ?? Info;
            const fresh = fact.key === latestKey;
            return (
              <motion.button
                key={fact.key}
                type="button"
                layout
                className="cf-tag"
                data-fresh={fresh || undefined}
                onClick={() => onOpen(fact)}
                initial={{ opacity: 0, scale: 0.86, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                <span className="cf-icon"><Icon size={14} /></span>
                <span className="cf-text">
                  <span className="cf-label">{fact.label}</span>
                  <span className="cf-value">{fact.value}</span>
                </span>
                {fresh && (
                  <motion.span
                    className="cf-frame"
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 1.18 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 28 }}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
