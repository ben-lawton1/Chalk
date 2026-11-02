// Embed mode (Atlas contract D13): pure query parsing and postMessage validation. No DOM, no state, so it is unit-testable in node.

export type EmbedCommand =
  | { kind: 'set-sidebar'; open: boolean }
  | { kind: 'toggle-sidebar' }
  | { kind: 'open-board'; id: string };

export type EmbedOutbound =
  | { source: 'chalk'; type: 'chalk:ready' }
  | { source: 'chalk'; type: 'chalk:sidebar'; open: boolean }
  | { source: 'chalk'; type: 'chalk:board'; id: string; name: string };

/** Longest board id accepted from the parent (real ids are short; this only stops absurd input). */
export const MAX_EMBED_BOARD_ID_LENGTH = 200;

/** `?embed=1` (only the exact value "1"). */
export function parseEmbedFlag(search: string): boolean {
  try {
    return new URLSearchParams(search).get('embed') === '1';
  } catch {
    return false;
  }
}

/** `?board=<id>`, or null when absent or empty. */
export function parseBoardParam(search: string): string | null {
  try {
    return new URLSearchParams(search).get('board') || null;
  } catch {
    return null;
  }
}

/** True when running inside a frame AND started with embed=1. */
export function isEmbedded(search: string, win: { parent: unknown; self?: unknown } | undefined): boolean {
  if (!win || !parseEmbedFlag(search)) return false;
  return win.parent !== (win.self ?? win);
}

/** Keeps only well-formed origins ("scheme://host[:port]", no path, no wildcard). */
export function cleanOrigins(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const o of list) {
    if (typeof o !== 'string') continue;
    const t = o.trim().replace(/\/+$/, '');
    if (/^https?:\/\/[^\s/*;'"]+$/i.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Validates one incoming message event. Returns the command, or null for anything that must be ignored:
 * wrong origin, wrong `source`, unknown type, or malformed fields.
 */
export function parseInbound(event: { origin: string; data: unknown }, allowedOrigins: readonly string[]): EmbedCommand | null {
  if (!allowedOrigins.includes(event.origin)) return null;
  const d = event.data;
  if (!d || typeof d !== 'object') return null;
  const m = d as Record<string, unknown>;
  if (m.source !== 'atlas') return null;
  switch (m.type) {
    case 'chalk:set-sidebar':
      return typeof m.open === 'boolean' ? { kind: 'set-sidebar', open: m.open } : null;
    case 'chalk:toggle-sidebar':
      return { kind: 'toggle-sidebar' };
    case 'chalk:open-board':
      return typeof m.id === 'string' && m.id.length > 0 && m.id.length <= MAX_EMBED_BOARD_ID_LENGTH ? { kind: 'open-board', id: m.id } : null;
    default:
      return null;
  }
}

/**
 * Where to send outgoing messages. A known parent origin (from the browser's ancestor info, the referrer, or a
 * validated incoming message) wins; otherwise every allowed origin is tried (the browser drops a message whose
 * targetOrigin does not match the parent's real origin, so nothing leaks to the wrong site).
 */
export function targetOrigins(allowed: readonly string[], known: string | null): string[] {
  if (known && allowed.includes(known)) return [known];
  return [...allowed];
}

/** Origin of a URL string, or null. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const o = new URL(url).origin;
    return o === 'null' ? null : o;
  } catch {
    return null;
  }
}
