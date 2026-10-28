// Bottom dock terminal panel and the top-right toggle button. State and sessions live in terminalStore.ts; xterm is lazy-loaded there.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { TERMINAL_TOGGLE_EVENT } from '../../input/keyboard';
import { TID } from '../../testids';
import { Icon } from '../icons';
import {
  checkBridge, closeTab, ensureReady, fitActiveTerminal, getTerminalState, initTerminal, killAll, newTab, restartTab, selectTab, setBody,
  setOpen, setTerminalHeight, subscribeTerminal, toggleTerminal,
} from './terminalStore';

export function useTerminalState() {
  return useSyncExternalStore(subscribeTerminal, getTerminalState, getTerminalState);
}

export function TerminalButton() {
  const open = useTerminalState().open;
  return (
    <button
      type="button"
      className="island terminal-button"
      data-testid={TID.terminalButton}
      aria-label="Terminal"
      aria-pressed={open}
      title="Terminal — Ctrl+`"
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggleTerminal}
    >
      <Icon name="terminal" size={20} />
    </button>
  );
}

export function TerminalPanel() {
  const s = useTerminalState();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const active = s.tabs.find((t) => t.id === s.activeId) ?? null;

  useEffect(() => {
    setBody(bodyRef.current);
    initTerminal();
    const onToggle = (): void => toggleTerminal();
    window.addEventListener(TERMINAL_TOGGLE_EVENT, onToggle);
    return () => { window.removeEventListener(TERMINAL_TOGGLE_EVENT, onToggle); setBody(null); };
  }, []);

  // Keep the height inside [min, 70vh] when the window changes, and fit the shell to the body whenever it resizes.
  useEffect(() => {
    const onResize = (): void => setTerminalHeight(getTerminalState().height, false);
    window.addEventListener('resize', onResize);
    const el = bodyRef.current;
    const ro = el ? new ResizeObserver(() => fitActiveTerminal()) : null;
    if (el) ro?.observe(el);
    return () => { window.removeEventListener('resize', onResize); ro?.disconnect(); };
  }, []);

  useEffect(() => { if (!s.open) setMenu(false); }, [s.open]);

  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: getTerminalState().height };
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (d) setTerminalHeight(d.startH + (d.startY - e.clientY), false);
  };
  const onResizeUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setTerminalHeight(getTerminalState().height, true);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const showOffline = s.open && s.bridge === 'offline';
  const showEnded = active !== null && active.message !== null && active.status !== 'running' && active.status !== 'connecting';

  return (
    <div className="terminal-panel" data-testid={TID.terminalPanel} data-open={s.open} hidden={!s.open}
      onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false); }}>
      <div className="terminal-resize" data-testid={TID.terminalResize} role="separator" aria-orientation="horizontal" aria-label="Resize terminal"
        onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />
      <div className="terminal-tabs" data-testid={TID.terminalTabs}>
        <div className="terminal-tablist" role="tablist">
          {s.tabs.map((t) => (
            <div key={t.id} className="terminal-tab" role="tab" aria-selected={t.id === s.activeId} data-testid={TID.terminalTab}
              data-active={t.id === s.activeId} data-status={t.status} title={t.name} onClick={() => selectTab(t.id)}>
              <span className="terminal-tab-name">{t.name}</span>
              <button type="button" className="terminal-tab-close" data-testid={TID.terminalTabClose} aria-label={`Close ${t.name}`}
                tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="icon-btn terminal-tool" data-testid={TID.terminalNew} aria-label="New terminal" title="New terminal"
          onMouseDown={(e) => e.preventDefault()} onClick={() => { void newTab(); }}>
          <Icon name="plus" size={16} />
        </button>
        <div className="terminal-menu-wrap">
          <button type="button" className="icon-btn terminal-tool" data-testid={TID.terminalProfiles} aria-label="Choose a profile" title="Choose a profile"
            aria-haspopup="menu" aria-expanded={menu} onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setMenu((m) => !m); if (s.profiles.length === 0) void checkBridge(); }}>
            <Icon name="chevronDown" size={16} />
          </button>
          {menu && (
            <div className="island terminal-menu" role="menu" data-testid={TID.terminalMenu}>
              {s.profiles.length === 0 && <div className="terminal-menu-empty">No profiles (is the helper running?)</div>}
              {s.profiles.map((p) => (
                <button key={p.id} type="button" role="menuitem" className="menu-item" data-testid={`${TID.terminalProfile}-${p.id}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(false); void newTab(p.id); }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="terminal-spacer" />
        <button type="button" className="icon-btn terminal-tool" data-testid={TID.terminalKillAll} aria-label="Kill all terminals" title="Kill all terminals"
          onMouseDown={(e) => e.preventDefault()} onClick={killAll}>
          <Icon name="trash" size={16} />
        </button>
        <button type="button" className="icon-btn terminal-tool" data-testid={TID.terminalMinimise} aria-label="Hide terminal" title="Hide terminal — Ctrl+`"
          onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
          <Icon name="minimise" size={16} />
        </button>
      </div>
      <div className="terminal-body">
        <div className="terminal-hosts" ref={bodyRef} />
        {showEnded && active && (
          <div className="terminal-ended" data-testid={TID.terminalEnded}>
            <span>{active.message}</span>
            <button type="button" className="text-btn" data-testid={TID.terminalRestart} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { void restartTab(active.id); }}>
              Restart
            </button>
          </div>
        )}
        {showOffline && (
          <div className="terminal-offline" data-testid={TID.terminalOffline} role="alert">
            <strong>The terminal helper isn't running</strong>
            <p>Start it on this PC, then this panel connects by itself:</p>
            <code>bridge\dist\chalk-terminal.exe</code>
            <p>
              First time? See the <a href="https://github.com/ben-lawton1/Chalk#terminal" target="_blank" rel="noreferrer">Terminal section of the README</a> for how to build it.
            </p>
            <button type="button" className="text-btn primary" data-testid={TID.terminalRetry} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { void ensureReady(); }}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
