// Typed fetch client for the /api backend; non-2xx becomes ApiError (WP5).
import type { Board, BoardCreateRequest, BoardSummary, BoardUpdateRequest, HealthResponse } from '../types';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface Api {
  health(): Promise<HealthResponse>;
  listBoards(): Promise<BoardSummary[]>;
  getBoard(id: string): Promise<Board>;
  createBoard(body: BoardCreateRequest): Promise<Board>;
  updateBoard(id: string, body: BoardUpdateRequest, opts?: { keepalive?: boolean }): Promise<BoardSummary>;
  deleteBoard(id: string): Promise<void>;
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && 'message' in d && typeof (d as { message: unknown }).message === 'string') {
      return (d as { message: string }).message;
    }
  }
  return `HTTP ${status}`;
}

async function request<T>(method: string, path: string, body?: unknown, keepalive?: boolean): Promise<T> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (keepalive) init.keepalive = true;
  const res = await fetch(`/api${path}`, init);
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let parsed: unknown;
    const text = await res.text().catch(() => '');
    try {
      parsed = text ? JSON.parse(text) : text;
    } catch {
      parsed = text;
    }
    throw new ApiError(res.status, parsed, errorMessage(res.status, parsed));
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api: Api = {
  health: () => request<HealthResponse>('GET', '/health'),
  listBoards: () => request<BoardSummary[]>('GET', '/boards'),
  getBoard: (id) => request<Board>('GET', `/boards/${enc(id)}`),
  createBoard: (body) => request<Board>('POST', '/boards', body),
  updateBoard: (id, body, opts) => request<BoardSummary>('PUT', `/boards/${enc(id)}`, body, opts?.keepalive),
  deleteBoard: (id) => request<void>('DELETE', `/boards/${enc(id)}`),
};
