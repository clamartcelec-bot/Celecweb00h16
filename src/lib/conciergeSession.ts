const SESSION_KEY = 'celec.concierge.session';

export const CONCIERGE_SESSION_PARAM = 'concierge';

export function startConciergeSession(): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* storage unavailable, the id stays in memory for this call */
  }
  return id;
}

export function currentConciergeSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function endConciergeSession(id: string | null): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
  if (id) window.sessionStorage.setItem(`${SESSION_KEY}.last`, id);
}

export function carnetUrlForSession(id: string | null): string {
  if (!id) return '/carnet';
  return `/carnet?${CONCIERGE_SESSION_PARAM}=${encodeURIComponent(id)}`;
}
