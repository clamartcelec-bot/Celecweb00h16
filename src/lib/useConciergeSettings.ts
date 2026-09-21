import { useEffect, useState } from 'react';
import {
  DEFAULT_CONCIERGE_SETTINGS,
  loadConciergeSettings,
  type ConciergeSettings,
} from '@/concierge/services/config';

export function useConciergeSettings() {
  const [settings, setSettings] = useState<ConciergeSettings>(DEFAULT_CONCIERGE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadConciergeSettings()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
