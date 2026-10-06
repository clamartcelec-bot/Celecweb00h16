export type Placement = { x: number; y: number; width: number; progress: number; mode: 'hero' | 'presenting' | 'docked' | 'full' | 'compact' };
type Rect = { left: number; top: number; width: number; height: number; bottom: number };
type Input = { viewportWidth: number; viewportHeight: number; viewportLeft?: number; viewportTop?: number; headerBottom: number; scrollY: number; embedded: boolean; anchor?: Rect; stage?: Rect };
export const ROBOT_RATIO = 458 / 552;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function guidePlacement(input: Input): Placement {
  const { viewportWidth: vw, viewportHeight: vh, headerBottom, scrollY, embedded, anchor, stage } = input;
  const left = (input.viewportLeft ?? 0) + 10;
  const top = (input.viewportTop ?? 0) + 10;
  const bottom = (input.viewportTop ?? 0) + vh - 46; // room for call controls and safe edge
  const safeTop = clamp(headerBottom + 12, top, Math.max(top, bottom - 100));
  const mobile = vw <= 760;
  const dockWidth = Math.min(mobile ? 122 : 170, vw - 20, (bottom - safeTop) / ROBOT_RATIO);
  const dock = { x: left + vw - 20 - dockWidth, y: bottom - dockWidth * ROBOT_RATIO, width: dockWidth };
  const fit = (p: Placement): Placement => {
    const width = Math.max(1, Math.min(p.width, vw - 20, (bottom - safeTop) / ROBOT_RATIO));
    return { ...p, width, x: clamp(p.x, left, left + vw - 20 - width), y: clamp(p.y, safeTop, bottom - width * ROBOT_RATIO) };
  };
  if (!embedded) return fit({ x: anchor?.left ?? left, y: anchor?.top ?? safeTop, width: anchor?.width ?? 225, mode: 'full', progress: 0 });
  if (stage && !mobile && stage.height > 0 && stage.top < top + vh - 100 && stage.bottom > safeTop + 100) {
    return fit({ x: stage.left, y: stage.top + 170, width: 225, mode: 'presenting', progress: 0 });
  }
  if (!anchor) return fit({ ...dock, mode: 'docked', progress: 1 });
  const pageTop = anchor.top + scrollY;
  // Decide from the document anchor, not its current scroll position: no threshold jumps.
  const compact = pageTop + anchor.width * ROBOT_RATIO > bottom || pageTop < safeTop;
  const startWidth = compact ? dockWidth : anchor.width;
  const departure = compact ? 0 : Math.max(0, pageTop - (top + vh * .72));
  const progress = clamp((scrollY - departure) / Math.max(360, vh * .65));
  const start = fit({ x: compact ? dock.x : anchor.left, y: compact ? safeTop : (scrollY < departure ? anchor.top : pageTop - departure), width: startWidth, progress: 0, mode: 'hero' });
  return fit({ x: mix(start.x, dock.x, smooth(progress / .8)), y: mix(start.y, dock.y, smooth((progress - .18) / .82)), width: mix(start.width, dockWidth, smooth(progress)), progress, mode: progress === 1 ? 'docked' : compact ? 'compact' : 'hero' });
}
