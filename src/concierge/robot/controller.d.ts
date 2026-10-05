export type RobotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'success' | 'error' | 'sleeping';
export interface RobotElement extends HTMLElement {
  setState(state: RobotState, options?: {duration?: number}): void;
  setPose(pose: Record<string, number | string>, options?: {duration?: number}): void;
  setAmplitude(value: number): void;
  greet(): Promise<unknown>;
  nod(): Promise<unknown>;
  hands(): Promise<unknown>;
  tipHat(): Promise<unknown>;
  wiggleAntenna(): Promise<unknown>;
  getState(): {state: RobotState; pose: Record<string, number>};
}
