/**
 * `pnpm vrt` — build the specimen pages, hydrate the baseline, run the
 * matrix.
 *
 * This is the part that runs *inside* the container. `tests/visual/docker.ts`
 * is what puts it there; running this file directly on a host works and is
 * useful for debugging, but the pixels it produces are your machine's and
 * will not match a baseline accepted from the container.
 *
 * Steps, in order:
 *
 * 1. `INCLUDE_TEST_PAGES=1 astro build` → `dist/`. The ordinary build,
 *    with the flag that includes the specimen pages — there is no
 *    VRT-specific config, so what is screenshotted is what ships
 * 2. read `tests/visual/baseline.txt`, list that baseline folder, and
 *    hydrate `.vrt/baseline/` — downloading only what the content-keyed
 *    blob cache does not already hold
 * 3. run Playwright, which starts the static server itself and compares
 *    against the hydrated snapshots
 *
 * The first run has no baseline. Playwright writes the missing snapshots
 * and reports them as failures, which is the right answer — there is
 * nothing to compare against yet — and `pnpm vrt:accept` promotes them.
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';

import { hydrateBaseline, readBaselineReference } from './baseline.ts';
import {
  currentDirectoryFor,
  repoRoot,
  resultsDirectoryFor,
  storage,
  tier,
} from './config.ts';
import { browserVersions, formatVersions, writeVersions } from './versions.ts';

/** Runs a command, inheriting stdio, and resolves with its exit code. */
const run = (command: string, arguments_: string[]): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repoRoot,
      stdio: 'inherit',
      /* The suite screenshots the specimen pages, which are gated behind
         this — without it the build emits none of them and every target
         404s. */
      env: { ...env, INCLUDE_TEST_PAGES: '1' },
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

const which = tier();

/*
 * Clear last run's output first. `.vrt/current/` is what `pnpm vrt:accept`
 * promotes, so a shot left behind by a target or width that has since
 * been removed would otherwise be accepted as part of the new baseline.
 * The results directory goes too, so the report only ever shows this run.
 */
await Promise.all([
  rm(currentDirectoryFor(which), { recursive: true, force: true }),
  rm(resultsDirectoryFor(which), { recursive: true, force: true }),
]);

console.log('[vrt] building site with specimen pages');
const built = await run('npx', ['astro', 'build']);
if (built !== 0) exit(built);

const hash = await readBaselineReference(which);
console.log(
  hash === undefined
    ? '[vrt] no baseline yet — this run will record one to accept'
    : `[vrt] hydrating baseline ${hash}`,
);

const { files, fetched } = await hydrateBaseline(storage(), which, hash);
if (hash !== undefined) {
  console.log(
    `[vrt] baseline ${String(files)} files, ${String(fetched)} fetched, ${String(
      files - fetched,
    )} from cache`,
  );
}

/* Nothing in the matrix is pinned, so a failure could be the browsers
   rather than the change. Print what this run is actually driving. */
const versions = await browserVersions(which);
await writeVersions(which, versions);
console.log(`[vrt] ${which} browsers:`);
console.log(formatVersions(versions));

console.log(`[vrt] running ${which} browsers`);
const code = await run('npx', [
  'playwright',
  'test',
  '--config',
  'tests/visual/runner/playwright.config.ts',
  ...argv.slice(2),
]);

exit(code);
