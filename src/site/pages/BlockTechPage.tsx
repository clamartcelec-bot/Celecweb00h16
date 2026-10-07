import { motion } from 'motion/react';
import { Cpu, Zap } from 'lucide-react';
import type { Copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { PageIntro } from '@/site/components/PageIntro';

export function BlockTechPage({ t }: { t: Copy }) {
  const cards = [
    { name: 'CELEC', role: t.btField, items: t.btFieldItems, icon: Zap, accent: false },
    { name: 'BLOCKTECH', role: t.btArch, items: t.btArchItems, icon: Cpu, accent: true },
  ];
  return (
    <div className="s-page">
      <PageIntro eyebrow="CELEC × BlockTech" title="BlockTech" lead={t.blocktechNote} />
      <div className="s-bt-duo">
        {cards.map((c, i) => (
          <motion.article
            key={c.name}
            className={`s-bt-card ${c.accent ? 's-bt-card--accent' : ''}`}
            initial={{ opacity: 0, x: i === 0 ? -40 : 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.4 + i * 0.1 }}
          >
            <c.icon size={22} />
            <strong>{c.name}</strong>
            <span>{c.role}</span>
            <ul>{c.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </motion.article>
        ))}
        <motion.span className="s-bt-x" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.8 }}>
          ×
        </motion.span>
      </div>
    </div>
  );
}
