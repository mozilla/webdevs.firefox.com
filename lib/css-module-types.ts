import { writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes a `.d.ts` beside every `*.module.css` naming its actual classes, so
 * the types come from the stylesheet rather than being maintained by hand.
 * Wired up as Vite's `css.modules.getJSON` in `astro.config.ts`.
 *
 * Astro's built-in `*.module.css` type is an index signature, so under
 * `noUncheckedIndexedAccess` every lookup is possibly-undefined; generating
 * the real names keeps components free of non-null assertions and makes a
 * typo in a class name a type error.
 *
 * The output is gitignored, like any other build artifact — a checked-in
 * copy would go stale against the stylesheet and report classes that do
 * exist as missing. `astro check` only reads `.d.ts` files already on disk,
 * so `build` runs it after `astro build` rather than before; checking a
 * clean tree first would fall back to Astro's permissive `*.module.css`
 * wildcard and pass without really checking anything.
 *
 * Only named exports are declared — deliberately no default. Named imports
 * are what let a bundler drop the classes a module doesn't use, which matters
 * if any of this is ever shipped to the client, and leaving the default
 * undeclared makes `import styles from …` a type error rather than a choice.
 *
 * A consequence is that class names have to be valid JS identifiers.
 * Kebab-case ones are listed in a comment instead of silently vanishing, so
 * the fix (rename to camelCase) is obvious at the point of use.
 *
 * Synchronous because Vite's `getJSON` is typed as returning void — a promise
 * returned here would not be awaited.
 */

/** Matches a class name usable as a JS binding. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function writeCssModuleTypes(
  cssFileName: string,
  classes: Record<string, string>,
): void {
  const names = Object.keys(classes).toSorted((a, b) => a.localeCompare(b));
  const exportable = names.filter((name) => IDENTIFIER.test(name));
  const skipped = names.filter((name) => !IDENTIFIER.test(name));

  const body = exportable
    .map((name) => `export const ${name}: string;`)
    .join('\n');

  const note =
    skipped.length > 0
      ? `\n// Not exported — rename to camelCase to use: ${skipped.join(', ')}\n`
      : '';

  writeFileSync(
    `${cssFileName}.d.ts`,
    `// Generated from ${path.basename(cssFileName)} — do not edit.\n` +
      `${note}${body}\n`,
  );
}
