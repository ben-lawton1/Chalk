// Terminal panel state and session lifecycle. Lives outside the app store: sessions and xterm instances are not serializable
// and must outlive page switches. The React side (TerminalPanel.tsx) renders `getTerminalState()` and calls these functions.
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { api } from '../../persistence/api';
import { TID } from '../../testids';
import { clampTerminalHeight, readTerminalPrefs, writeTerminalPrefs } from './prefs';
import { sessionUrl, TerminalSession, type SessionStatus } from './session';

export interface ProfileInfo { id: string; name: string }
export type BridgeStatus = 'unknown' | 'checking' | 'online' | 'offline';
export interface TabInfo {
  id: number;
  profile: string;
  name: string;
  status: SessionStatus;
  /** "[process exited with code N]" etc., shown under the terminal when the session is over. */
  message: string | null;
}
export interface TerminalState {
  open: boolean;
  height: number;
  bridge: BridgeStatus;
  profiles: ProfileInfo[];
  defaultProfile: string | null;
  tabs: TabInfo[];
  activeId: number | null;
}

interface Runtime {
  term: Terminal;
  fit: FitAddon;
  host: HTMLElement;
  session: TerminalSession | null;
}

const FONT = '"Cascadia Mono", Consolas, ui-monospace, monospace';
const THEME = {
  background: '#16181d', foreground: '#e6e8eb', cursor: '#5fd3a0', cursorAccent: '#16181d', selectionBackground: 'rgba(95, 211, 160, 0.3)',
  black: '#1f2228', red: '#ff6b6b', green: '#3fb984', yellow: '#f2a541', blue: '#6ea8fe', magenta: '#c792ea', cyan: '#5fd3d3', white: '#e6e8eb',
  brightBlack: '#6b727d', brightRed: '#ff8f8f', brightGreen: '#5fd3a0', brightYellow: '#ffc069', brightBlue: '#8fbcff', brightMagenta: '#d9b0f2', brightCyan: '#8ae5e5', brightWhite: '#ffffff',
};

const prefs = readTerminalPrefs();
let state: TerminalState = {
  open: prefs.open, height: prefs.height, bridge: 'unknown', profiles: [], defaultProfile: null, tabs: [], activeId: null,
};
const listeners = new Set<() => void>();
const runtimes = new Map<number, Runtime>();
let body: HTMLElement | null = null;
let nextId = 1;
let terminalUrl: string | null = null;
let xtermLibs: Promise<{ Terminal: typeof Terminal; FitAddon: typeof FitAddon; WebLinksAddon: new () => { activate(t: Terminal): void } }> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function getTerminalState(): TerminalState { return state; }
export function subscribeTerminal(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function set(patch: Partial<TerminalState>): void {
  state = { ...state, ...patch };
  applyLayout();
  for (const fn of Array.from(listeners)) fn();
}
function patchTab(id: number, patch: Partial<TabInfo>): void {
  set({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/** --terminal-h on <html>: 0 when hidden. The stage and all bottom-anchored chrome read it. */
function applyLayout(): void {
  document.documentElement.style.setProperty('--terminal-h', state.open ? `${state.height}px` : '0px');
}
applyLayout();

function persist(): void { writeTerminalPrefs({ open: state.open, height: state.height }); }

// ---------------------------------------------------------------- xterm (lazy)

function loadXterm() {
  xtermLibs ??= Promise.all([
    import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/addon-web-links'), import('@xterm/xterm/css/xterm.css'),
  ]).then(([x, f, w]) => ({ Terminal: x.Terminal, FitAddon: f.FitAddon, WebLinksAddon: w.WebLinksAddon as unknown as new () => { activate(t: Terminal): void } }));
  return xtermLibs;
}

/** Copies text with a hidden textarea: navigator.clipboard does not exist on plain-http origins. */
function copyText(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* nothing to do */ }
  ta.remove();
}

function fitTab(id: number): void {
  const rt = runtimes.get(id);
  if (!rt || rt.host.offsetParent === null) return;
  try { rt.fit.fit(); } catch { /* not measurable yet */ }
}

/** Re-fits the visible terminal (panel resized, tab switched, panel shown). */
export function fitActiveTerminal(): void {
  if (state.activeId !== null) fitTab(state.activeId);
}

function focusActive(): void {
  if (state.activeId !== null) runtimes.get(state.activeId)?.term.focus();
}

// ---------------------------------------------------------------- bridge

async function bridgeUrl(): Promise<string> {
  if (terminalUrl) return terminalUrl;
  const cfg = await api.getConfig();
  terminalUrl = cfg.terminalUrl.replace(/\/+$/, '');
  return terminalUrl;
}

/** Asks the bridge for /health and /profiles; sets bridge online or offline. Resolves to whether it is online. */
export async function checkBridge(): Promise<boolean> {
  if (state.bridge !== 'offline') set({ bridge: 'checking' });
  try {
    const url = await bridgeUrl();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    try {
      const h = await fetch(`${url}/health`, { signal: ctl.signal });
      if (!h.ok) throw new Error(`health ${h.status}`);
      const p = (await (await fetch(`${url}/profiles`, { signal: ctl.signal })).json()) as { default?: string; profiles?: ProfileInfo[] };
      set({ bridge: 'online', profiles: p.profiles ?? [], defaultProfile: p.default ?? p.profiles?.[0]?.id ?? null });
    } finally {
      clearTimeout(timer);
    }
    return true;
  } catch {
    set({ bridge: 'offline' });
    return false;
  }
}

function stopPolling(): void {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
}
function updatePolling(): void {
  const want = state.open && state.bridge === 'offline';
  if (!want) { stopPolling(); return; }
  if (pollTimer === null) pollTimer = setInterval(() => { void ensureReady(); }, 3000);
}

/** Opening must end with a usable bridge and at least one session. */
export async function ensureReady(): Promise<void> {
  if (!state.open) return;
  const ok = await checkBridge();
  updatePolling();
  if (ok && state.open && state.tabs.length === 0) await newTab();
}

// ---------------------------------------------------------------- sessions

async function startSession(id: number): Promise<void> {
  const tab = state.tabs.find((t) => t.id === id);
  const rt = runtimes.get(id);
  if (!tab || !rt) return;
  patchTab(id, { status: 'connecting', message: null });
  let url: string;
  try { url = await bridgeUrl(); } catch { patchTab(id, { status: 'error', message: '[could not reach the Chalk server]' }); return; }
  fitTab(id);
  const { term } = rt;
  const session: TerminalSession = new TerminalSession(sessionUrl(url, tab.profile, term.cols, term.rows), {
    onData: (bytes) => term.write(bytes),
    onStatus: (status, detail) => {
      if (rt.session !== session) return;
      if (status === 'exited') {
        const msg = `[process exited with code ${detail}]`;
        term.write(`\r\n\x1b[90m${msg}\x1b[0m\r\n`);
        patchTab(id, { status, message: msg });
      } else if (status === 'error' || status === 'closed') {
        const msg = status === 'error' ? `[error: ${detail}]` : `[${detail}]`;
        term.write(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
        patchTab(id, { status, message: msg });
        if (status === 'error' && detail === 'could not connect') void checkBridge().then(updatePolling);
      } else {
        patchTab(id, { status, message: null });
      }
    },
  });
  rt.session = session;
}

export async function newTab(profileId?: string): Promise<void> {
  if (!state.open) { set({ open: true }); persist(); }
  const profile = profileId ?? state.defaultProfile;
  if (!profile) { await ensureReady(); return; }
  const info = state.profiles.find((p) => p.id === profile);
  const id = nextId++;
  set({ tabs: [...state.tabs, { id, profile, name: info?.name ?? profile, status: 'connecting', message: null }], activeId: id });
  const { Terminal: Term, FitAddon: Fit, WebLinksAddon: Links } = await loadXterm();
  if (!state.tabs.some((t) => t.id === id)) return; // closed while loading
  const host = document.createElement('div');
  host.className = 'terminal-host';
  host.dataset.testid = TID.terminalHost;
  host.dataset.tab = String(id);
  const term = new Term({ fontFamily: FONT, fontSize: 14, theme: THEME, cursorBlink: true, scrollback: 5000, allowProposedApi: true });
  const fit = new Fit();
  term.loadAddon(fit);
  term.loadAddon(new Links() as never);
  const rt: Runtime = { term, fit, host, session: null };
  runtimes.set(id, rt);
  body?.appendChild(host);
  host.dataset.active = String(state.activeId === id);
  term.open(host);
  term.onData((d) => rt.session?.write(d));
  term.onBinary((d) => rt.session?.write(Uint8Array.from(d, (c) => c.charCodeAt(0))));
  term.onResize(({ cols, rows }) => rt.session?.resize(cols, rows));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && e.code === 'Backquote') return false; // global toggle, handled by keyboard.ts
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyC' && term.hasSelection()) {
      copyText(term.getSelection());
      term.clearSelection();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyV') return false; // the browser's paste event feeds xterm
    return true;
  });
  fitTab(id);
  syncActiveHost();
  await startSession(id);
  if (state.activeId === id) focusActive();
}

function syncActiveHost(): void {
  for (const [id, rt] of runtimes) rt.host.dataset.active = String(id === state.activeId);
  requestAnimationFrame(() => { fitActiveTerminal(); });
}

function disposeTab(id: number): void {
  const rt = runtimes.get(id);
  if (!rt) return;
  rt.session?.close();
  rt.session = null;
  rt.term.dispose();
  rt.host.remove();
  runtimes.delete(id);
}

export function selectTab(id: number): void {
  if (!state.tabs.some((t) => t.id === id)) return;
  set({ activeId: id });
  syncActiveHost();
  requestAnimationFrame(focusActive);
}

export function closeTab(id: number): void {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  disposeTab(id);
  const tabs = state.tabs.filter((t) => t.id !== id);
  const activeId = state.activeId === id ? (tabs[Math.min(idx, tabs.length - 1)]?.id ?? null) : state.activeId;
  set({ tabs, activeId });
  if (tabs.length === 0) {
    set({ open: false });
    persist();
    stopPolling();
  } else {
    syncActiveHost();
    requestAnimationFrame(focusActive);
  }
}

export function killAll(): void {
  for (const id of Array.from(runtimes.keys())) disposeTab(id);
  set({ tabs: [], activeId: null, open: false });
  persist();
  stopPolling();
}

export async function restartTab(id: number): Promise<void> {
  const rt = runtimes.get(id);
  if (!rt) return;
  rt.session?.close();
  rt.session = null;
  await startSession(id);
  focusActive();
}

// ---------------------------------------------------------------- panel

export function setBody(el: HTMLElement | null): void {
  body = el;
  if (el) for (const rt of runtimes.values()) el.appendChild(rt.host);
}

export function setOpen(open: boolean): void {
  if (state.open === open) return;
  set({ open, height: clampTerminalHeight(state.height, window.innerHeight) });
  persist();
  if (open) {
    requestAnimationFrame(() => { fitActiveTerminal(); focusActive(); });
    void ensureReady();
  } else {
    stopPolling();
  }
}
export function toggleTerminal(): void { setOpen(!state.open); }

export function setTerminalHeight(height: number, commit = true): void {
  set({ height: clampTerminalHeight(height, window.innerHeight) });
  if (commit) persist();
}

/** Called once at mount: a persisted open panel reconnects (a browser reload ended the old sessions). */
export function initTerminal(): void {
  set({ height: clampTerminalHeight(state.height, window.innerHeight) });
  if (state.open) void ensureReady();
}
