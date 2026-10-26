// The three pens, the active pen and the button swap, remembered in localStorage (v3). Best effort: storage may be blocked.
import type { PenSettings } from '../types';
import { DEFAULT_PENS, PEN_PREFS_STORAGE_KEY } from '../constants';
import { getState, setState, subscribe } from '../state/store';

export interface PenPrefs {
  pens: PenSettings[];
  activePen: number;
  penButtonsSwapped: boolean;
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function validPen(v: unknown): PenSettings | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Partial<PenSettings>;
  if (typeof p.color !== 'string' || p.color === '') return null;
  if (typeof p.size !== 'number' || !Number.isFinite(p.size) || p.size <= 0) return null;
  return { color: p.color, size: p.size };
}

/** Defaults for anything that is missing or invalid: exactly 3 pens, an active index in 0..2, a boolean swap flag. */
export function loadPenPrefs(): PenPrefs {
  const defaults: PenPrefs = { pens: DEFAULT_PENS.map((p) => ({ ...p })), activePen: 0, penButtonsSwapped: false };
  try {
    const raw = storage()?.getItem(PEN_PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return defaults;
    const o = v as Partial<Record<keyof PenPrefs, unknown>>;
    const list = Array.isArray(o.pens) ? o.pens.map(validPen) : [];
    // Three valid pens or the defaults: a half-valid list is not worth repairing.
    const pens = list.length === 3 && list.every((p) => p !== null) ? (list as PenSettings[]) : defaults.pens;
    const active = o.activePen;
    return {
      pens,
      activePen: typeof active === 'number' && Number.isInteger(active) && active >= 0 && active < 3 ? active : 0,
      penButtonsSwapped: o.penButtonsSwapped === true,
    };
  } catch {
    return defaults;
  }
}

export function savePenPrefs(prefs: PenPrefs): void {
  try {
    storage()?.setItem(PEN_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota exceeded or storage blocked: the pens simply are not remembered */
  }
}

/** Boot: loads the saved prefs into the store, then saves on every change. Returns the unsubscribe. */
export function startPenPrefs(): () => void {
  const prefs = loadPenPrefs();
  setState({ pens: prefs.pens, activePen: prefs.activePen, penButtonsSwapped: prefs.penButtonsSwapped });
  return subscribe((next, prev) => {
    if (next.pens === prev.pens && next.activePen === prev.activePen && next.penButtonsSwapped === prev.penButtonsSwapped) return;
    const s = getState();
    savePenPrefs({ pens: s.pens, activePen: s.activePen, penButtonsSwapped: s.penButtonsSwapped });
  });
}
