import { writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes a `.d.ts` beside every `*.module.css` naming its actual classes, so
 * the types come from the stylesheet rather than being maintained by hand.
 * Wired up as Vite's `css.modules.getJSON` in `astro.config.ts`.
 *
 * Astro's built-in `*.module.css` type is an index signature, so under
 * `noUncheckedIndexedAccess` every lookup is possibly-undefined; generating
 * the real keys keeps components free of non-null assertions and makes a
 * typo in a class name a type error.
 *
 * The output is gitignored, like any other build artifact — a checked-in
 * copy would go stale against the stylesheet and report classes that do
 * exist as missing. `astro check` only reads `.d.ts` files already on disk,
 * so `build` runs it after `astro build` rather than before; checking a
 * clean tree first would fall back to Astro's permissive `*.module.css`
 * wildcard and pass without really checking anything.
 *
 * Synchronous because Vite's `getJSON` is typed as returning void — a promise
 * returned here would not be awaited.
 */
export function writeCssModuleTypes(
  cssFileName: string,
  classes: Record<string, string>,
): void {
  const body = Object.keys(classes)
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => `  readonly ${name}: string;`)
    .join('\n');

  writeFileSync(
    `${cssFileName}.d.ts`,
    `// Generated from ${path.basename(cssFileName)} — do not edit.\n` +
      `declare const classes: {\n${body}\n};\n\nexport default classes;\n`,
  );
}
