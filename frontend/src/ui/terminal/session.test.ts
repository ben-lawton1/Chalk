// Unit tests for the bridge session client, using a fake WebSocket.
import { describe, expect, it } from 'vitest';
import { sessionUrl, TerminalSession, toWsBase, type SessionStatus, type SocketLike } from './session';

class FakeSocket implements SocketLike {
  binaryType = 'blob';
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: (string | Uint8Array)[] = [];
  closed = false;
  send(d: string | Uint8Array): void { this.sent.push(d); }
  close(): void { this.closed = true; this.readyState = 3; }
  open(): void { this.readyState = 1; this.onopen?.({}); }
  recv(data: unknown): void { this.onmessage?.({ data }); }
  drop(): void { this.readyState = 3; this.onclose?.({}); }
}

function setup() {
  const sock = new FakeSocket();
  const urls: string[] = [];
  const data: Uint8Array[] = [];
  const statuses: [SessionStatus, string | undefined][] = [];
  const session = new TerminalSession('ws://x/session', {
    onData: (b) => data.push(b),
    onStatus: (s, d) => statuses.push([s, d]),
  }, (u) => { urls.push(u); return sock; });
  return { sock, urls, data, statuses, session };
}

describe('urls', () => {
  it('derives ws from http and encodes the query', () => {
    expect(toWsBase('http://127.0.0.1:7681/')).toBe('ws://127.0.0.1:7681');
    expect(toWsBase('https://h:1')).toBe('wss://h:1');
    expect(sessionUrl('http://127.0.0.1:7681', 'my shell', 80.7, 24)).toBe('ws://127.0.0.1:7681/session?profile=my%20shell&cols=80&rows=24');
  });
});

describe('TerminalSession', () => {
  it('connects, then reports running', () => {
    const { sock, urls, statuses, session } = setup();
    expect(urls).toEqual(['ws://x/session']);
    expect(sock.binaryType).toBe('arraybuffer');
    expect(session.status).toBe('connecting');
    sock.open();
    expect(session.status).toBe('running');
    expect(statuses).toEqual([['running', undefined]]);
  });

  it('delivers binary frames as bytes', () => {
    const { sock, data } = setup();
    sock.open();
    sock.recv(new Uint8Array([104, 105]).buffer);
    expect(Array.from(data[0]!)).toEqual([104, 105]);
  });

  it('sends keystrokes as UTF-8 binary and resize as JSON text, only while running', () => {
    const { sock, session } = setup();
    session.write('early');
    session.resize(1, 1);
    expect(sock.sent).toEqual([]);
    sock.open();
    session.write('é\r');
    session.write(new Uint8Array([3]));
    session.resize(100.9, 30);
    expect(Array.from(sock.sent[0] as Uint8Array)).toEqual([0xc3, 0xa9, 13]);
    expect(Array.from(sock.sent[1] as Uint8Array)).toEqual([3]);
    expect(JSON.parse(sock.sent[2] as string)).toEqual({ type: 'resize', cols: 100, rows: 30 });
  });

  it('handles the exit message, and the close after it is not an error', () => {
    const { sock, statuses, session } = setup();
    sock.open();
    sock.recv('{"type":"exit","code":7}');
    sock.drop();
    expect(session.status).toBe('exited');
    expect(statuses.at(-1)).toEqual(['exited', '7']);
    expect(statuses).toHaveLength(2);
    session.write('x');
    expect(sock.sent).toEqual([]);
  });

  it('handles the error message', () => {
    const { sock, statuses } = setup();
    sock.open();
    sock.recv('{"type":"error","message":"boom"}');
    expect(statuses.at(-1)).toEqual(['error', 'boom']);
  });

  it('ignores malformed and unknown text frames', () => {
    const { sock, statuses } = setup();
    sock.open();
    sock.recv('not json');
    sock.recv('{"type":"hello"}');
    expect(statuses).toEqual([['running', undefined]]);
  });

  it('a close before open is a connection failure; a close after open is "connection closed"', () => {
    const a = setup();
    a.sock.drop();
    expect(a.statuses).toEqual([['error', 'could not connect']]);
    const b = setup();
    b.sock.open();
    b.sock.drop();
    expect(b.statuses.at(-1)).toEqual(['closed', 'connection closed']);
  });

  it('close() shuts the socket and reports nothing more', () => {
    const { sock, statuses, session } = setup();
    sock.open();
    session.close();
    expect(sock.closed).toBe(true);
    sock.onclose?.({});
    expect(statuses).toEqual([['running', undefined]]);
  });
});
