export const GUIDE_CONTEXT_EVENT = 'celec:guide-context';
export const GUIDE_OPEN_EVENT = 'celec:guide-open';
export const GUIDE_REVEAL_EVENT = 'celec:guide-reveal';
export interface GuideContext {
  title: string;
  description?: string;
  prompt?: string;
}

// Reading a page updates context silently. Only an explicit invitation has a prompt.
export function presentToGuide(context: GuideContext) {
  window.dispatchEvent(new CustomEvent<GuideContext>(GUIDE_CONTEXT_EVENT, { detail: context }));
}

// A deliberate invitation starts the call in the current page, never a route change.
export function openInlineGuide(context?: GuideContext) {
  window.dispatchEvent(new CustomEvent<GuideContext | undefined>(GUIDE_OPEN_EVENT, { detail: context }));
}
