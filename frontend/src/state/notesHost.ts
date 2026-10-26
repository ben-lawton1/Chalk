// The seam between the actions/input layers and the mounted notes editor (ui/notes/NotesLayer.tsx registers itself here).
import type { Point } from '../types';

export interface NotesHost {
  /** Focus the editor with the caret at a world point (null: restore the remembered caret) and make it visible. */
  focusAt(world: Point | null): void;
  /** Save the caret and blur. */
  blur(): void;
}

let host: NotesHost | null = null;

export function registerNotesHost(h: NotesHost | null): void {
  host = h;
}
export function getNotesHost(): NotesHost | null {
  return host;
}
