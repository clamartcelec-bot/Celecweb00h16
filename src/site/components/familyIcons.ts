import { Lightbulb, Plug, ShieldCheck, Wifi, Wrench, Zap, type LucideIcon } from 'lucide-react';
import type { FamilyId } from '@/site/taxonomy';

export const FAMILY_ICONS: Record<FamilyId, LucideIcon> = {
  electricite: Zap,
  confort: Lightbulb,
  securite: ShieldCheck,
  reseau: Wifi,
  energie: Plug,
};

export const ENTRETIEN_ICON = Wrench;
