export const GUIDE_CONTEXT_EVENT = 'celec:guide-context';
export interface GuideContext {
  title: string;
  description?: string;
  prompt?: string;
}

// Reading a page updates context silently. Only an explicit invitation has a prompt.
export function presentToGuide(context: GuideContext) {
  window.dispatchEvent(new CustomEvent<GuideContext>(GUIDE_CONTEXT_EVENT, { detail: context }));
}
