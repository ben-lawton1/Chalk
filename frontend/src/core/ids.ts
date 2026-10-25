// Element id and rough.js seed generation, safe on non-secure origins (WP0).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 12;
const MAX_SEED = 2 ** 31 - 2;

/** 12 chars from [A-Za-z0-9], via crypto.getRandomValues when available (never randomUUID). */
export function newId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < ID_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  // 248 = 62 * 4, so `% 62` over bytes below 248 is unbiased; the rare rest is re-rolled.
  for (let i = 0; i < ID_LENGTH; i++) {
    let b = bytes[i]!;
    while (b >= 248) b = Math.floor(Math.random() * 248);
    out += ALPHABET[b % 62];
  }
  return out;
}

/** Integer in [1, 2^31 - 2]; never 0 (rough.js treats a 0 seed as "random"). */
export function newSeed(): number {
  return 1 + Math.floor(Math.random() * (2 ** 31 - 2));
}

export function isValidSeed(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SEED;
}
