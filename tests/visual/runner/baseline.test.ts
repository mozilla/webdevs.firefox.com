import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineHash } from './baseline.ts';

/**
 * Unit tests for the parts of the runner that are pure, run by `pnpm test`
 * with Node's own runner.
 *
 * `baselineHash` is the one piece whose correctness is not observable from
 * a passing screenshot run: everything else in the system either works
 * visibly or fails visibly, but a hash that is subtly order-dependent would
 * only show up later as a baseline that refuses to dedupe, or as a spurious
 * conflict in `baseline.txt`. The properties it has to hold are cheap to
 * state and cheap to check, so they are checked here.
 *
 * The rest of the runner is exercised end to end by `pnpm vrt`, which needs
 * the container and real browsers.
 */
const shot = (key: string, body: string): { key: string; body: Buffer } => ({
  key,
  body: Buffer.from(body),
});

describe('baselineHash', () => {
  it('is stable for the same contents', () => {
    const entries = [shot('a/chrome/1440/light.png', 'one')];

    assert.equal(baselineHash(entries), baselineHash(entries));
  });

  it('ignores the order entries are given in', () => {
    const a = shot('a/chrome/1440/light.png', 'one');
    const b = shot('b/firefox/375/dark.png', 'two');

    assert.equal(baselineHash([a, b]), baselineHash([b, a]));
  });

  it('changes when a shot changes', () => {
    const before = [shot('a/chrome/1440/light.png', 'one')];
    const after = [shot('a/chrome/1440/light.png', 'two')];

    assert.notEqual(baselineHash(before), baselineHash(after));
  });

  it('changes when a shot is renamed', () => {
    /* The key is part of the identity, not just the pixels: the same image
       at a different width is a different baseline. */
    const before = [shot('a/chrome/1440/light.png', 'one')];
    const after = [shot('a/chrome/960/light.png', 'one')];

    assert.notEqual(baselineHash(before), baselineHash(after));
  });

  it('changes when a shot is added or removed', () => {
    const one = [shot('a/chrome/1440/light.png', 'one')];
    const two = [...one, shot('b/firefox/375/dark.png', 'two')];

    assert.notEqual(baselineHash(one), baselineHash(two));
  });

  it('does not let a key and its contents run together', () => {
    /* Hashing `key + body` with no separator would make these two sets
       identical, so a rename could be masked by a matching change of
       bytes. The delimiter is what rules that out. */
    const a = [shot('ab', 'c'), shot('x', 'y')];
    const b = [shot('a', 'bc'), shot('x', 'y')];

    assert.notEqual(baselineHash(a), baselineHash(b));
  });

  it('names a folder, so it is short and path-safe', () => {
    const hash = baselineHash([shot('a/chrome/1440/light.png', 'one')]);

    assert.match(hash, /^[\da-f]{16}$/);
  });
});
