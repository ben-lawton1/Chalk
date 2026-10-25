// Boards dialog: list, open, create and two-click delete of server boards. Owner: WP4.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DELETE_CONFIRM_MS } from '../constants';
import { createBoard, deleteBoard, listBoards, openBoard } from '../persistence/boards';
import { closeDialog } from '../state/actions';
import { notify } from '../state/store';
import { TID, tidBoardDelete, tidBoardOpen, tidBoardRow } from '../testids';
import type { BoardSummary } from '../types';
import { useAppState } from './hooks';
import { Icon } from './icons';

function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(t).toLocaleDateString();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function BoardList() {
  const currentId = useAppState((s) => s.board?.id ?? null);
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    listBoards()
      .then((list) => { if (mounted.current) setBoards(list); })
      .catch((err: unknown) => {
        if (mounted.current) setBoards((b) => b ?? []);
        notify('Could not load boards: ' + messageOf(err), 'error');
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [refresh]);

  function onOpen(id: string): void {
    openBoard(id)
      .then(() => closeDialog())
      .catch((err: unknown) => notify('Could not open board: ' + messageOf(err), 'error'));
  }

  function onDelete(id: string): void {
    if (confirmId !== id) {
      setConfirmId(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => {
        if (mounted.current) setConfirmId((c) => (c === id ? null : c));
      }, DELETE_CONFIRM_MS);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmId(null);
    deleteBoard(id)
      .then(() => { if (mounted.current) refresh(); })
      .catch((err: unknown) => notify('Could not delete board: ' + messageOf(err), 'error'));
  }

  function onNew(): void {
    createBoard()
      .then(() => closeDialog())
      .catch((err: unknown) => notify('Could not create board: ' + messageOf(err), 'error'));
  }

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="dialog" data-testid={TID.boardList} role="dialog" aria-modal="true" aria-label="Boards">
        <div className="dialog-header">
          <h2 className="dialog-title">Boards</h2>
          <button type="button" className="icon-btn" data-testid={TID.boardListClose} aria-label="Close" title="Close — Esc"
            onMouseDown={(e) => e.preventDefault()} onClick={() => closeDialog()}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dialog-body">
          {boards === null && <div className="empty-note">Loading…</div>}
          {boards !== null && boards.length === 0 && <div className="empty-note">No boards yet.</div>}
          {boards !== null && boards.length > 0 && (
            <ul className="board-rows">
              {boards.map((b) => {
                const current = b.id === currentId;
                const confirming = confirmId === b.id;
                return (
                  <li key={b.id} className="board-row" data-testid={tidBoardRow(b.id)} aria-current={current ? 'true' : undefined}>
                    <button type="button" className="board-open" data-testid={tidBoardOpen(b.id)}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(b.id)}>
                      <span className="board-open-name">
                        {b.name}
                        {current && <span className="board-current-tag">Current</span>}
                      </span>
                      <span className="board-open-meta">Updated {relativeTime(b.updatedAt)}</span>
                    </button>
                    <button type="button" className={`text-btn danger board-delete${confirming ? ' confirm' : ''}`}
                      data-testid={tidBoardDelete(b.id)}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => onDelete(b.id)}>
                      {confirming ? 'Confirm' : 'Delete'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="text-btn primary" data-testid={TID.boardListNew}
            onMouseDown={(e) => e.preventDefault()} onClick={onNew}>
            New board
          </button>
        </div>
      </div>
    </div>
  );
}
