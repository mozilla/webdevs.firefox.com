import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { convertBody } from './convert.ts';
import { fetchContent } from './fetch.ts';
import { Mdn } from './mdn.ts';
import { parseFrontmatter } from './parse.ts';
import { releasesFrom } from './release-dates.ts';

/**
 * Imports Firefox's developer release notes from `mdn/content` as MDX.
 *
 * Run with `pnpm run import:release-notes`. Re-runnable: it deletes and
 * rewrites the whole output directory, so pages removed upstream don't linger
 * and the human check is the git diff. A release's sub-pages come with it —
 * 32 of them, all in 1.5 to 10, all one level down. Every run re-fetches `mdn/content`;
 * pass `--use-cache` to reuse the checkout and BCD data from the last run,
 * which is worth having while iterating on the conversion itself.
 *
 * The commit the content came from is deliberately *not* recorded in the
 * output. Writing it into every file would make every run touch every note
 * whether or not its content changed, burying the real diff — which is the
 * only check on this — under 99 no-op edits. The run prints the sha instead.
 *
 * Deliberately noisy on anything it doesn't recognize. An unknown macro or
 * alert type aborts the run naming the file and line, rather than passing the
 * syntax through to produce a page that renders `{{SomeMacro}}` as text.
 */

/**
 * Every release MDN has a page for, back to Firefox 1.5 (2005).
 *
 * The floor is kept as a constant rather than dropped, because BCD lists
 * releases MDN has no page for — Firefox 1 among them — and the run reports
 * those by name. `1.5`, `3.5` and `3.6` are releases too, so the version
 * filter in `release-dates.ts` takes a dotted number, and the content
 * collection has to be told not to slugify the dot away.
 */
const MIN_VERSION = 1;

const OUTPUT_DIR = 'src/content/release-notes';
const CACHE_DIR = path.join('node_modules', '.cache', 'mdn-content');

/** A release directory's sub-page names, each holding an `index.md`. */
function subPagesOf(versionDirectory: string): string[] {
  return readdirSync(versionDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(versionDirectory, entry.name, 'index.md')),
    )
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * Copies a page's co-located assets next to the MDX.
 *
 * Markdown references them by bare filename, and Astro resolves a relative
 * image against the file that used it, so the two have to travel together.
 * There is exactly one today — `iccsample.jpg`, in the Firefox 3.5 ICC page.
 */
function copyAssets(sourceDirectory: string, directory: string): void {
  const entries = readdirSync(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.md')) continue;
    copyFileSync(
      path.join(sourceDirectory, entry.name),
      path.join(directory, entry.name),
    );
  }
}

async function main(): Promise<void> {
  const shouldUseCache = process.argv.includes('--use-cache');
  const releases = await releasesFrom(MIN_VERSION, CACHE_DIR, shouldUseCache);
  const years = new Map(releases.map((r) => [r.version, r.year]));

  console.log(
    `Fetching mdn/content${shouldUseCache ? ' (cached)' : ''}, ${String(releases.length)} versions in scope…`,
  );
  const checkout = fetchContent(CACHE_DIR, shouldUseCache);
  const mdn = new Mdn(checkout.root);
  const sourceDirectory = path.join(checkout.root, 'mozilla/firefox/releases');

  // Rewritten from scratch each run, so upstream deletions propagate.
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let written = 0;
  const skipped: string[] = [];

  for (const release of releases) {
    const versionDirectory = path.join(sourceDirectory, release.version);
    const source = path.join(versionDirectory, 'index.md');
    if (!existsSync(source)) {
      skipped.push(release.version);
      continue;
    }

    // The release's own page, then its sub-pages. A sub-page is always one
    // level down and always `index.md`, across all 32 of them.
    const pages = [undefined, ...subPagesOf(versionDirectory)];

    for (const subPage of pages) {
      const segments = [release.version, ...(subPage ? [subPage] : [])];
      const relativeSource = `mozilla/firefox/releases/${segments.join('/')}/index.md`;
      const file = path.join(
        versionDirectory,
        ...(subPage ? [subPage] : []),
        'index.md',
      );
      const { keys, body } = parseFrontmatter(readFileSync(file, 'utf8'));
      const { body: converted, hasNote } = convertBody(body, {
        mdn,
        years,
        file: relativeSource,
      });

      // `releaseDate` is written on every page, sub-pages included: it is
      // what the route builds the year segment from, and a sub-page belongs
      // to the same release as its parent. MDN's `slug`, `page-type` and
      // `sidebar` describe the page's place in MDN's tree rather than ours.
      //
      // `title` is written for sub-pages only. For a release page it is
      // derivable from the version — see `_release-note.ts` beside the route
      // — and writing a derivable value would only give it a second place to
      // be wrong. A sub-page's title is prose ("Updating extensions for
      // Firefox 3") that nothing in our tree can reconstruct, so it is
      // carried across.
      const frontmatter = ['---', `releaseDate: ${release.date}`];
      if (subPage) {
        const title = keys.get('title');
        if (title === undefined) {
          throw new Error(`no title in frontmatter for ${relativeSource}`);
        }
        frontmatter.push(`title: ${JSON.stringify(title)}`);
      }
      frontmatter.push('---');

      const imports = hasNote
        ? ["import Note from '~/components/Note';", '']
        : [];

      const out = [
        ...frontmatter,
        '',
        '{/* Generated by `pnpm run import:release-notes` from mdn/content. */}',
        `{/* Source: files/en-us/${relativeSource} — edit there, not here. */}`,
        '',
        ...imports,
        converted.replace(/^\n+/, ''),
      ].join('\n');

      const directory = path.join(OUTPUT_DIR, ...segments);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'index.mdx'), `${out.trimEnd()}\n`);
      copyAssets(path.dirname(file), directory);
      written += 1;
    }
  }

  if (skipped.length > 0) {
    console.log(`No MDN page for: ${skipped.join(', ')}`);
  }
  console.log(
    `Wrote ${String(written)} notes from mdn/content@${checkout.sha.slice(0, 12)}`,
  );

  // Format what we wrote, so the diff is content rather than formatting noise.
  console.log('Formatting…');
  execFileSync(
    'pnpm',
    ['exec', 'prettier', '--write', '--log-level', 'warn', OUTPUT_DIR],
    {
      stdio: 'inherit',
    },
  );
}

await main();
