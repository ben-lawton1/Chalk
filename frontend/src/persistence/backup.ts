// localStorage backup of unsaved board work, so a failed or interrupted save never loses edits (WP5).
import { BACKUP_STORAGE_PREFIX } from '../constants';
import type { SceneFile } from '../types';

export interface BoardBackup { boardId: string; baseVersion: number; savedAt: string; name: string; scene: SceneFile }

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function writeBackup(b: BoardBackup): void {
  try {
    storage()?.setItem(BACKUP_STORAGE_PREFIX + b.boardId, JSON.stringify(b));
  } catch {
    /* quota exceeded or storage blocked: the backup is best-effort */
  }
}

export function readBackup(boardId: string): BoardBackup | null {
  try {
    const raw = storage()?.getItem(BACKUP_STORAGE_PREFIX + boardId);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const b = v as Partial<BoardBackup>;
    if (
      b.boardId !== boardId ||
      typeof b.baseVersion !== 'number' ||
      typeof b.name !== 'string' ||
      typeof b.savedAt !== 'string' ||
      !b.scene ||
      typeof b.scene !== 'object'
    ) {
      return null;
    }
    return b as BoardBackup;
  } catch {
    return null;
  }
}

export function clearBackup(boardId: string): void {
  try {
    storage()?.removeItem(BACKUP_STORAGE_PREFIX + boardId);
  } catch {
    /* ignore */
  }
}
