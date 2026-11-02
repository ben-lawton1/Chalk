// postMessage bridge for embed mode (Atlas contract D13, see docs/HACKING.md). Active only inside a frame started with ?embed=1.
// Inbound: validated by core/embed.parseInbound (origin allow-list + source). Outbound: only to the parent's origin.
import { cleanOrigins, isEmbedded, isTerminalToggleKey, originOf, parseInbound, targetOrigins } from '../../core/embed';
import type { EmbedOutbound } from '../../core/embed';
import { setSidebarOpen, toggleSidebar } from '../../state/actions';
import { getState, notify, subscribe } from '../../state/store';
import { api, ApiError } from '../../persistence/api';
import { openBoard } from '../../persistence/boards';
import { onLibraryChanged, reloadAfterExternalChange } from '../../persistence/library';

/** The parent's origin as far as the browser tells us (Chromium: ancestorOrigins; others: the referrer). */
function guessParentOrigin(): string | null {
  try {
    const ao = window.location.ancestorOrigins;
    if (ao && ao.length > 0 && ao[0] && ao[0] !== 'null') return ao[0];
  } catch {
    /* ignore */
  }
  return originOf(document.referrer);
}

/** Starts the bridge when embedded; returns a stop function (tests and hot reload). */
export function startEmbedBridge(): () => void {
  if (typeof window === 'undefined' || !isEmbedded(window.location.search, window)) return () => {};
  let stopped = false;
  let unsub: (() => void) | null = null;
  let unsubLibrary: (() => void) | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let onMessage: ((e: MessageEvent) => void) | null = null;

  void (async () => {
    let allowed: string[] = [];
    try {
      allowed = cleanOrigins((await api.getConfig()).embedOrigins);
    } catch {
      /* no config: stay silent (fail closed) */
    }
    if (stopped || allowed.length === 0) return;

    // Learned from the browser first; otherwise from the first valid message; otherwise every allowed origin is a target.
    let parent: string | null = guessParentOrigin();
    const send = (msg: EmbedOutbound): void => {
      for (const o of targetOrigins(allowed, parent)) {
        try {
          window.parent.postMessage(msg, o);
        } catch {
          /* ignore */
        }
      }
    };

    let ready = false;
    let lastSidebar: boolean | null = null;
    let lastBoard = '';
    const publish = (): void => {
      const s = getState();
      if (!ready) {
        if (!s.board) return; // "ready" means loaded: a page is open
        ready = true;
        send({ source: 'chalk', type: 'chalk:ready' });
      }
      if (s.sidebarOpen !== lastSidebar) {
        lastSidebar = s.sidebarOpen;
        send({ source: 'chalk', type: 'chalk:sidebar', open: s.sidebarOpen });
      }
      if (s.board) {
        const key = s.board.id + '\u0000' + s.board.name;
        if (key !== lastBoard) {
          lastBoard = key;
          send({ source: 'chalk', type: 'chalk:board', id: s.board.id, name: s.board.name });
        }
      }
    };

    onMessage = (e: MessageEvent): void => {
      if (e.source !== window.parent) return;
      const cmd = parseInbound(e, allowed);
      if (!cmd) return;
      parent = e.origin; // verified: allowed origin and sent by our actual parent window
      switch (cmd.kind) {
        case 'set-sidebar':
          setSidebarOpen(cmd.open);
          break;
        case 'toggle-sidebar':
          toggleSidebar();
          break;
        case 'library-changed':
          reloadAfterExternalChange().catch(() => notify('Could not reload the library', 'error'));
          break;
        case 'open-board':
          if (getState().board?.id === cmd.id) break;
          openBoard(cmd.id).catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 404) notify('Page not found');
            else notify('Could not open that page', 'error');
          });
          break;
      }
    };
    window.addEventListener('message', onMessage);
    onKey = (e: KeyboardEvent): void => {
      if (!isTerminalToggleKey(e)) return;
      e.preventDefault();
      send({ source: 'chalk', type: 'chalk:toggle-terminal' });
    };
    window.addEventListener('keydown', onKey, true);
    unsubLibrary = onLibraryChanged(() => send({ source: 'chalk', type: 'chalk:library-changed' }));
    unsub = subscribe(publish);
    publish();
  })();

  return () => {
    stopped = true;
    if (onMessage) window.removeEventListener('message', onMessage);
    if (unsub) unsub();
    if (unsubLibrary) unsubLibrary();
    if (onKey) window.removeEventListener('keydown', onKey, true);
  };
}
