/**
 * Where everything lives and what shape it has, in one place.
 *
 * The store root is gitignored and local: there is no bucket yet, so the
 * "object store" is a directory under `.vrt/`. Swapping in a real provider
 * means changing {@link storage} to build a different {@link Storage} and
 * nothing else here moves, because the key layout is the same either way —
 * which is the whole reason the runner goes through that interface rather
 * than touching files directly.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_WIDTHS, VIEWPORT_HEIGHT } from '../targets.ts';
import { FileStorage, type Storage } from './storage.ts';

/**
 * Which set of browsers a run covers, and so which baseline it compares
 * against. `stable` blocks; `prerelease` is advisory.
 */
export type Tier = 'stable' | 'prerelease';

/** The tier this process is running, from `VRT_TIER`. */
export const tier = (): Tier =>
  process.env['VRT_TIER'] === 'prerelease' ? 'prerelease' : 'stable';

/** The repository root. */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Everything the VRT build and run produce, all gitignored. */
export const vrtDirectory = path.join(repoRoot, '.vrt');

/**
 * The built site, specimen pages included, served to the browsers.
 *
 * The ordinary `dist/`, not a VRT-only directory. There is no second Astro
 * config: the run is `INCLUDE_TEST_PAGES=1 astro build`, which is the same
 * build `pnpm check` already does, so the screenshots are of the site as
 * built with nothing added. Sharing the directory is normal here — a
 * production build and a test-pages build have always written to the same
 * place, and the flag is what distinguishes them.
 */
export const distributionDirectory = path.join(repoRoot, 'dist');

/*
 * Per-tier working directories. Scoped by tier so that a prerelease run
 * cannot overwrite the stable snapshots it would then be compared against
 * — the two tiers have separate baselines, and that has to hold on disk as
 * well as in the store.
 */

/** Where a tier's baseline is hydrated to, and what Playwright diffs
    against. */
export const baselineDirectoryFor = (which: Tier): string =>
  path.join(vrtDirectory, which, 'baseline');

/** Screenshots this run produced, whatever the comparison said. */
export const currentDirectoryFor = (which: Tier): string =>
  path.join(vrtDirectory, which, 'current');

/** Playwright's own output — traces, diff images, the HTML report. */
export const resultsDirectoryFor = (which: Tier): string =>
  path.join(vrtDirectory, which, 'results');
export const reportDirectoryFor = (which: Tier): string =>
  path.join(vrtDirectory, which, 'report');

/**
 * Stands in for the bucket.
 *
 * Inside the repo rather than under `~/.cache`, so that `rm -rf .vrt`
 * removes the whole experiment and a second checkout gets its own — which
 * is the honest local equivalent of "this bucket is not shared yet".
 */
export const storeDirectory = path.join(vrtDirectory, 'store');

/**
 * The content-keyed download cache.
 *
 * Distinct from the store: this is the client-side cache the plan describes
 * at `~/.cache/vrt/blobs/<md5>`, which lets switching branches fetch only
 * the images that genuinely differ from anything already on disk. With a
 * local store the saving is small, but keeping it here means the hydrate
 * path is the same code a real bucket will use.
 */
export const blobCacheDirectory = path.join(vrtDirectory, 'blob-cache');

/**
 * Which set of browsers a run covers, and so which baseline it compares
 * against. `stable` blocks; `prerelease` is advisory.
 *
 * The two are kept entirely apart — their own key prefix and their own
 * hash file — so that beta churn never touches the blocking baseline.
 * Chrome Beta ships weekly and any release can move a pixel; if accepting
 * that noise also rewrote the stable reference, the blocking check would
 * inherit it.
 */
/** The committed hash file for a tier — the only artefact in git. */
export const baselineFileFor = (which: Tier): string =>
  fileURLToPath(
    new URL(
      which === 'stable' ? '../baseline.txt' : '../baseline-prerelease.txt',
      import.meta.url,
    ),
  );

/** Key prefix for a tier's baselines. */
export const baselinePrefixFor = (which: Tier): string =>
  which === 'stable' ? 'baselines' : 'baselines-prerelease';

/** The storage the runner talks to. */
export const storage = (): Storage => new FileStorage(storeDirectory);

/**
 * The viewport handed to every browser.
 *
 * The width is overridden per shot; the height only decides where the fold
 * falls, since every capture is `fullPage`.
 */
export const VIEWPORT = {
  width: DEFAULT_WIDTHS[0] ?? 1440,
  height: VIEWPORT_HEIGHT,
};
