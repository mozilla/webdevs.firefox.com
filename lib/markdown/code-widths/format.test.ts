import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatVariants,
  hasParser,
  stripBuildDirectives,
  TIERS,
} from './format.ts';

/**
 * Unit tests for the formatter, run with `pnpm test` (Node's own runner — it
 * needs no dependency, and this is the only part of the pipeline that can be
 * tested without a build).
 *
 * The plugin around it is checked by the specimen page at `/test/code/`,
 * which exercises each case end to end.
 */
describe('hasParser', () => {
  it('accepts the languages in the map', () => {
    assert.ok(hasParser('ts'));
    assert.ok(hasParser('css'));
  });

  it('rejects anything else, rather than guessing', () => {
    assert.ok(!hasParser('bash'));
    assert.ok(!hasParser('diff'));
    assert.ok(!hasParser(''));
  });
});

describe('formatVariants', () => {
  it('leaves an unmapped language alone', async () => {
    assert.equal(await formatVariants('pnpm dev', 'bash'), undefined);
  });

  it('leaves a fragment Prettier cannot parse alone', async () => {
    assert.equal(await formatVariants('if (foo) {\n  // …', 'js'), undefined);
  });

  it('short-circuits a block that fits the narrowest tier', async () => {
    const variants = await formatVariants('const a=1', 'js');

    /* One variant serving every tier is the signal that the widest-first
       check fired and the remaining format() calls were skipped. */
    assert.deepEqual(variants, [{ code: 'const a = 1;', tiers: TIERS }]);
  });

  it('merges tiers that format identically', async () => {
    const source =
      "const options = { rootMargin: '0px 0px -25% 0px', threshold: 1 };";
    const variants = await formatVariants(source, 'js', {
      tiers: [40, 56, 72],
    });

    assert.ok(variants);
    // The line is 65 characters: 72 holds it whole, 40 and 56 both break it
    // the same way, so those two tiers merge into one variant.
    assert.deepEqual(
      variants.map(({ tiers }) => tiers),
      [[40, 56], [72]],
    );
    assert.notEqual(variants[0]?.code, variants[1]?.code);
  });

  it('returns variants in ascending tier order', async () => {
    const source =
      'element.addEventListener("click", (event) => handle(event, options), { passive: true });';
    const variants = await formatVariants(source, 'js');

    assert.ok(variants);
    const allTiers = variants.flatMap(({ tiers }) => tiers);
    assert.deepEqual(
      allTiers,
      allTiers.toSorted((a, b) => a - b),
    );
  });

  it('honors a single fixed width', async () => {
    const source =
      "const options = { rootMargin: '0px 0px -25% 0px', threshold: 1 };";
    const variants = await formatVariants(source, 'js', { tiers: [80] });

    assert.deepEqual(variants, [{ code: source, tiers: [80] }]);
  });

  it('applies the house style rather than the author"s quotes', async () => {
    const variants = await formatVariants('const a = "x"', 'js');
    assert.equal(variants?.[0]?.code, "const a = 'x';");
  });

  it('trims the newline Prettier adds', async () => {
    const variants = await formatVariants('const a = 1;\n\n\n', 'js');
    assert.equal(variants?.[0]?.code.endsWith(';'), true);
  });

  it('formats languages other than JavaScript', async () => {
    const variants = await formatVariants('a{color:red}', 'css');
    assert.equal(variants?.[0]?.code, 'a {\n  color: red;\n}');
  });
});

describe('stripBuildDirectives', () => {
  it('removes a directive line and nothing else', () => {
    assert.equal(
      stripBuildDirectives('// prettier-ignore\nconst a = 1;'),
      'const a = 1;',
    );
  });

  it('leaves a line that merely mentions one', () => {
    const line = 'const hint = "// prettier-ignore";';
    assert.equal(stripBuildDirectives(line), line);
  });
});
