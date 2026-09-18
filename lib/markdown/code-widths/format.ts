import * as prettier from 'prettier';

/**
 * The print widths, in characters, that each code block is formatted to.
 *
 * The first is the base — what a reader sees when nothing wider fits — and the
 * container queries in `prose.css` pick the widest one the block's text area
 * can hold.
 *
 * Derived from the article measure and Inconsolata's 0.5em advance: the prose
 * column is capped at 43.5rem, the code block spends 2rem of that on inline
 * padding either side, so its text area holds 79 characters at full desktop
 * measure. It holds about 40 on a 390px phone and about 32 on a 320px one,
 * and below roughly 40 Prettier's output degrades to one identifier per line,
 * which reads worse than wrapping. So 40 is the floor and the narrowest
 * viewports wrap a little rather than getting a ladder rung of their own.
 *
 * Keep this list and the `@container` blocks in `prose.css` in step.
 */
export const TIERS = [40, 48, 56, 64, 72, 79];

/**
 * Code-fence languages mapped to the Prettier parser to use.
 *
 * Deliberately explicit: a language that isn't listed is left exactly as the
 * author wrote it rather than guessed at, because guessing wrong reformats a
 * `bash` session or a `diff` into nonsense.
 */
const parsers = new Map<string, string>(
  Object.entries({
    js: 'babel',
    jsx: 'babel',
    mjs: 'babel',
    cjs: 'babel',
    javascript: 'babel',
    ts: 'typescript',
    tsx: 'typescript',
    typescript: 'typescript',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    svg: 'html',
    json: 'json',
    json5: 'json5',
    jsonc: 'jsonc',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    markdown: 'markdown',
    mdx: 'mdx',
    graphql: 'graphql',
  }),
);

/** Whether a fence language has a Prettier parser, and so can be reflowed. */
export const hasParser = (lang: string): boolean => parsers.has(lang);

/**
 * The house style for article code.
 *
 * Matched against the repo's own `.prettierrc` so a sample reads the same as
 * the source it was copied from, but stated here rather than resolved with
 * `resolveConfig()`: article code wants one stable style regardless of which
 * directory the markdown happens to sit in, and resolving per snippet would
 * add file I/O to every code block in the site.
 */
const baseOptions: prettier.Options = { singleQuote: true };

/** Directives that do their job at build time and shouldn't reach the reader. */
const buildDirectives = new Set([
  '// prettier-ignore',
  '/* prettier-ignore */',
  '<!-- prettier-ignore -->',
  '# prettier-ignore',
]);

/**
 * Drop the build-time directive lines from `code`.
 *
 * Called after formatting, so Prettier still sees — and honors — a
 * `prettier-ignore` pinning the line below it.
 */
export const stripBuildDirectives = (code: string): string =>
  code
    .split('\n')
    .filter((line) => !buildDirectives.has(line.trim()))
    .join('\n');

const longestLine = (code: string): number =>
  Math.max(...code.split('\n').map((line) => line.length));

/** One distinct formatting of a block, and the print widths that produce it. */
export interface Variant {
  /** The formatted source, with its trailing newline removed. */
  code: string;
  /** The print widths whose output is exactly this, ascending. */
  tiers: number[];
}

/**
 * Format `source` at each width in `tiers`, merging identical results.
 *
 * Returns `undefined` when the block should be left exactly as the author
 * wrote it: either the language has no Prettier parser, or the snippet is an
 * illustrative fragment Prettier can't parse. Never throws — a malformed
 * snippet must not fail a build.
 */
export async function formatVariants(
  source: string,
  lang: string,
  { tiers = TIERS }: { tiers?: number[] } = {},
): Promise<Variant[] | undefined> {
  const parser = parsers.get(lang);
  if (parser === undefined) return undefined;

  const format = async (printWidth: number): Promise<string> => {
    const formatted = await prettier.format(source, {
      ...baseOptions,
      parser,
      printWidth,
    });
    return formatted.replace(/\n+$/, '');
  };

  const descending = [...new Set(tiers)].toSorted((a, b) => b - a);
  if (descending.length === 0) return undefined;

  try {
    const byOutput = new Map<string, Variant>();
    let previous: { code: string; longest: number } | undefined;

    /* Widest first, because a tier whose output already fits a narrower one
       needs no call of its own: Prettier breaks a group only when it doesn't
       fit, so every line fitting means there is nothing left for it to break.
       Most blocks fit the narrowest tier and so cost a single call, and a
       block that reflows only at the bottom of the ladder skips the tiers
       above it. */
    for (const printWidth of descending) {
      if (previous === undefined || previous.longest > printWidth) {
        const code = await format(printWidth);
        previous = { code, longest: longestLine(code) };
      }

      const { code } = previous;
      const existing = byOutput.get(code);
      if (existing) {
        existing.tiers.unshift(printWidth);
      } else {
        byOutput.set(code, { code, tiers: [printWidth] });
      }
    }

    /* Built widest-first, returned narrowest-first — the order the tiers are
       written in, and the order the container queries read. */
    return byOutput.values().toArray().toReversed();
  } catch {
    /* An illustrative fragment that legitimately doesn't parse — `if (foo) {`
       with no closing brace, say. The author's own layout is the one to
       ship. */
    return undefined;
  }
}
