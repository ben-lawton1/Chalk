// Client for one bridge session: a WebSocket carrying raw PTY bytes (binary frames) and JSON control messages (text frames).
// Pure enough to unit-test with a fake WebSocket; knows nothing about React or xterm.

export type SessionStatus = 'connecting' | 'running' | 'exited' | 'error' | 'closed';

/** The slice of the WebSocket API used here (so tests can pass a fake). */
export interface SocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string | Uint8Array): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketLike;

export interface SessionHandlers {
  onData(bytes: Uint8Array): void;
  onStatus(status: SessionStatus, detail?: string): void;
}

const OPEN = 1;

/** http(s)://host:port -> ws(s)://host:port (a trailing slash is dropped). */
export function toWsBase(httpUrl: string): string {
  return httpUrl.replace(/\/+$/, '').replace(/^http/i, 'ws');
}

export function sessionUrl(terminalUrl: string, profile: string, cols: number, rows: number): string {
  const q = `profile=${encodeURIComponent(profile)}&cols=${Math.max(1, Math.floor(cols))}&rows=${Math.max(1, Math.floor(rows))}`;
  return `${toWsBase(terminalUrl)}/session?${q}`;
}

export class TerminalSession {
  status: SessionStatus = 'connecting';
  private readonly socket: SocketLike;
  private readonly encoder = new TextEncoder();
  private finished = false;

  constructor(url: string, private readonly handlers: SessionHandlers, factory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike) {
    this.socket = factory(url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => this.setStatus('running');
    this.socket.onmessage = (ev) => this.onMessage(ev.data);
    this.socket.onerror = () => {
      // The close event follows; remember that nothing was ever opened so it reads as a connection failure.
    };
    this.socket.onclose = () => {
      if (this.finished) return;
      this.finished = true;
      this.setStatus(this.status === 'connecting' ? 'error' : 'closed', this.status === 'connecting' ? 'could not connect' : 'connection closed');
    };
  }

  private setStatus(status: SessionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatus(status, detail);
  }

  private onMessage(data: unknown): void {
    if (typeof data === 'string') {
      let msg: { type?: unknown; code?: unknown; message?: unknown };
      try {
        msg = JSON.parse(data) as typeof msg;
      } catch {
        return;
      }
      if (msg.type === 'exit') {
        this.finished = true;
        this.setStatus('exited', String(typeof msg.code === 'number' ? msg.code : -1));
      } else if (msg.type === 'error') {
        this.finished = true;
        this.setStatus('error', typeof msg.message === 'string' ? msg.message : 'unknown error');
      }
      return;
    }
    if (data instanceof ArrayBuffer) this.handlers.onData(new Uint8Array(data));
    else if (ArrayBuffer.isView(data)) this.handlers.onData(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  /** Keystrokes and pasted text (UTF-8 encoded) or raw bytes. Dropped unless the socket is open. */
  write(data: string | Uint8Array): void {
    if (this.socket.readyState !== OPEN || this.status !== 'running') return;
    this.socket.send(typeof data === 'string' ? this.encoder.encode(data) : data);
  }

  resize(cols: number, rows: number): void {
    if (this.socket.readyState !== OPEN || this.status !== 'running') return;
    this.socket.send(JSON.stringify({ type: 'resize', cols: Math.floor(cols), rows: Math.floor(rows) }));
  }

  /** Ends the session (the bridge kills the process when the socket closes) without reporting a status change. */
  close(): void {
    this.finished = true;
    this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
    try {
      this.socket.close();
    } catch {
      // already closed
    }
  }
}
