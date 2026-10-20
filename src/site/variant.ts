import { useCallback, useEffect, useState } from 'react';

export type SiteVariant = 'v1' | 'v2' | 'v3';
export const VARIANTS: SiteVariant[] = ['v1', 'v2', 'v3'];

const KEY = 'celec-site-variant';

function read(): SiteVariant {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'v1' || v === 'v2' || v === 'v3') return v;
  } catch { /* ignore */ }
  return 'v1';
}

export function useSiteVariant(): [SiteVariant, (v: SiteVariant) => void] {
  const [variant, setVariant] = useState<SiteVariant>(read);
  useEffect(() => {
    document.documentElement.dataset.variant = variant;
  }, [variant]);
  const set = useCallback((v: SiteVariant) => {
    setVariant(v);
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  }, []);
  return [variant, set];
}
