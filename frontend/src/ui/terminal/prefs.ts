// Terminal panel preferences in localStorage['chalk:terminal'] ({ open, height }); storage may be unavailable, so every access is guarded.
export const TERMINAL_STORAGE_KEY = 'chalk:terminal';
export const TERMINAL_MIN_HEIGHT = 120;
export const TERMINAL_DEFAULT_HEIGHT = 300;
export const TERMINAL_MAX_VH = 0.7;

export interface TerminalPrefs {
  open: boolean;
  height: number;
}

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = { open: false, height: TERMINAL_DEFAULT_HEIGHT };

/** Clamps a panel height to [TERMINAL_MIN_HEIGHT, 70% of the window]; a tiny window still gets the minimum. */
export function clampTerminalHeight(height: number, viewportHeight: number): number {
  const h = Number.isFinite(height) ? height : TERMINAL_DEFAULT_HEIGHT;
  const max = Math.max(TERMINAL_MIN_HEIGHT, Math.floor(viewportHeight * TERMINAL_MAX_VH));
  return Math.round(Math.min(max, Math.max(TERMINAL_MIN_HEIGHT, h)));
}

export function parseTerminalPrefs(raw: string | null): TerminalPrefs {
  if (!raw) return { ...DEFAULT_TERMINAL_PREFS };
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { ...DEFAULT_TERMINAL_PREFS };
    const o = v as Record<string, unknown>;
    const height = typeof o.height === 'number' && Number.isFinite(o.height) ? Math.max(TERMINAL_MIN_HEIGHT, o.height) : TERMINAL_DEFAULT_HEIGHT;
    return { open: o.open === true, height: Math.round(height) };
  } catch {
    return { ...DEFAULT_TERMINAL_PREFS };
  }
}

export function readTerminalPrefs(): TerminalPrefs {
  try {
    return parseTerminalPrefs(localStorage.getItem(TERMINAL_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_TERMINAL_PREFS };
  }
}

export function writeTerminalPrefs(prefs: TerminalPrefs): void {
  try {
    localStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the panel just forgets its state
  }
}
