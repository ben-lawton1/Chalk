// Proves roughjs loads under vitest/node with the `import rough from 'roughjs'` form (WP0).
import { describe, expect, it } from 'vitest';
import rough from 'roughjs';

describe('roughjs interop', () => {
  it('creates a generator and a drawable', () => {
    const d = rough.generator().rectangle(0, 0, 10, 10, { seed: 1 });
    expect(d.sets.length).toBeGreaterThan(0);
  });
});
