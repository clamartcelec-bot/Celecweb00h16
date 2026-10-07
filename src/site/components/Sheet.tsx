import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { EASE_SOFT } from '@/site/motion';

/** Full-height side sheet on desktop, bottom sheet on mobile. Wrap in AnimatePresence. */
export function Sheet({
  onClose,
  children,
  label,
  size = 'wide',
  closeLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  label: string;
  size?: 'wide' | 'narrow';
  closeLabel: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      className="s-sheet-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="s-sheet-scrim" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`s-sheet s-sheet--${size}`}
        initial={{ x: '8%', y: 0, opacity: 0, scale: 0.98 }}
        animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
        exit={{ x: '6%', opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.6, ease: EASE_SOFT }}
      >
        <button className="s-sheet-x" onClick={onClose} aria-label={closeLabel}>
          <X size={18} />
        </button>
        <div className="s-sheet-scroll">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
