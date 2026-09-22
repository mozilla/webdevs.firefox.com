/**
 * Playwright configuration for the visual regression suite.
 *
 * The snapshot directory is `.vrt/<tier>/baseline/`, hydrated from the store
 * before the run, so Playwright's own `toHaveScreenshot` comparator and its
 * HTML report do the comparing and the reviewing. The store replaces where
 * snapshots are *stored*, not how they are *compared* — which is what buys
 * the Actual / Expected / Diff / Slider views without building a diff
 * viewer.
 *
 * Run it through `pnpm vrt`, which builds the pages and hydrates the
 * baseline first. `tests/visual/runner/run.ts` is that script.
 */
import { fileURLToPath } from 'node:url';

import { defineConfig, type Project } from '@playwright/test';

import { browsers } from './browsers.ts';
import {
  baselineDirectoryFor,
  reportDirectoryFor,
  resultsDirectoryFor,
  tier,
  VIEWPORT,
} from './config.ts';

const serveCli = fileURLToPath(new URL('serve-cli.ts', import.meta.url));

/**
 * Which tier to run. `stable` blocks; `prerelease` is advisory and compares
 * against its own baseline, so beta churn never touches the blocking one.
 */
const which = tier();

const port = Number(process.env['VRT_PORT'] ?? 4319);

/* One reading of the flag for both of the things that depend on it —
   `CI=` set but empty had previously made `forbidOnly` false while still
   cutting the worker count. */
const isCi = Boolean(process.env['CI']);

const projects: Project[] = browsers
  .filter((browser) => browser.tier === which)
  .map(({ id, browser, channel }) => ({
    name: id,
    use: {
      browserName: browser,
      ...(channel !== undefined && { channel }),
      viewport: VIEWPORT,
      /*
       * 1 keeps the files small. 2 is available later if subpixel fidelity
       * turns out to matter, but it quadruples the bytes for a system whose
       * shot count already compounds.
       */
      deviceScaleFactor: 1,
      /* Pinned so any date the site renders is stable. */
      locale: 'en-GB',
      timezoneId: 'UTC',
    },
  }));

export default defineConfig({
  testDir: '.',
  testMatch: /screenshots\.spec\.ts$/,
  outputDir: resultsDirectoryFor(which),
  snapshotDir: baselineDirectoryFor(which),

  /*
   * One name per shot, with no OS or project suffix: the container is the
   * only place these run, so a platform suffix would encode a dimension
   * that never varies. The path is the store's key layout exactly —
   * `<target>/<browser>/<width>/<scheme>.png` — so hydrating a baseline
   * folder into `snapshotDir` needs no translation.
   */
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',

  fullyParallel: true,
  forbidOnly: isCi,
  /*
   * No retries. A retry that passes hides exactly the nondeterminism this
   * system is meant to expose — better to see the flake and fix its cause.
   */
  retries: 0,
  /* Spread rather than `undefined`, which `exactOptionalPropertyTypes`
     rejects: locally Playwright's own default is wanted, and CI runners
     are smaller than a laptop. */
  ...(isCi && { workers: 2 }),

  reporter: [
    ['list'],
    ['html', { outputFolder: reportDirectoryFor(which), open: 'never' }],
  ],

  expect: {
    /*
     * `toMatchSnapshot` rather than `toHaveScreenshot`, because the spec
     * takes the screenshot itself and asserts on the buffer — see the doc
     * comment in `screenshots.spec.ts` for why. The comparator is the same
     * one either way: it is chosen from the `.png` extension on the
     * snapshot name, so this gets the real image diff and the report's
     * Actual / Expected / Diff / Slider views, not a byte comparison.
     *
     * Capture options (`animations`, `caret`, `scale`) belong to the
     * `page.screenshot()` call in the spec, not here.
     */
    toMatchSnapshot: {
      /*
       * `threshold` and `maxDiffPixels` do different jobs, and only the
       * pair of them is strict. `maxDiffPixels: 0` says "tolerate no
       * differing pixels"; `threshold` decides which pixels count as
       * differing at all, so a high one filters the set to nothing before
       * the count is ever taken and the zero means nothing.
       *
       * The default 0.2 is far too high for this site. Changing
       * `--panel-inset` by 6px moves a code block's edges — plainly
       * visible, and the change the whole system exists to catch — but the
       * block's fill and the page behind it are both near-black purples,
       * so each repainted pixel moves by a channel delta of about 25 out
       * of 255. The default needs roughly 62 before it calls a pixel
       * different, so all 22,560 of them were discarded and the test
       * passed. 0.02 counts 22,752 of them.
       *
       * Low rather than zero because a threshold of zero would count a
       * single-unit rounding difference, and the margin between 0.02 and
       * the renderers' own noise is what keeps the suite stable — verified
       * by repeated clean runs, not assumed.
       */
      threshold: 0.02,
      maxDiffPixels: 0,
    },
  },

  webServer: {
    /*
     * Serves the already-built site. Our own server rather than a
     * package: `build.format: 'preserve'` emits `test/buttons.html` while
     * the route is `/test/buttons/`, and a generic static server's SPA
     * fallback answers that mismatch with `index.html` and a 200 — which
     * screenshots the home page under the target's name and compares
     * cleanly. `serve.ts` has the detail.
     */
    command: `node ${serveCli}`,
    port,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VRT_PORT: String(port) },
  },

  use: {
    baseURL: `http://localhost:${String(port)}`,
    trace: 'retain-on-failure',
  },

  projects,
});
