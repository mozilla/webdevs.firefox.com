import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Sparse-checks-out the parts of `mdn/content` the release-note import reads.
 *
 * A shallow, sparse clone is a few seconds and ~60 MB of git objects, so an
 * import refetches by default and the notes reflect upstream as it is now.
 * `--use-cache` reuses the last run's checkout, which is worth having while
 * iterating on the conversion: re-resolving 17,500 redirects against an
 * unchanged tree is pure latency.
 */

const CONTENT_REPO = 'https://github.com/mdn/content.git';

/**
 * The sparse paths.
 *
 * `_redirects.txt` maps the legacy URLs the macros build onto the paths MDN
 * serves today. The whole of `files/en-us` comes with it because the macros
 * also have to be resolved against the pages themselves: `_redirects.txt`
 * only lists pages that have *moved*, so a reference page created in the same
 * cycle as the note citing it is absent from it, and the page's own `slug` is
 * the only authority for a URL's casing.
 *
 * Narrowing this to the trees a particular macro reads saves nothing worth
 * having: git sends the same pack either way, so the fetch is ~10 seconds
 * regardless, and the extra checkout is 137 MB of markdown that `Mdn` indexes
 * in about 1.5 seconds.
 */
const SPARSE_PATHS = ['files/en-us'];

export interface Checkout {
  /** Absolute path to `files/en-us` within the checkout. */
  root: string;
  /** The commit the content came from, reported at the end of a run. */
  sha: string;
}

function git(cwd: string, ...arguments_: string[]): string {
  return execFileSync('git', arguments_, { cwd, encoding: 'utf8' }).trim();
}

export function fetchContent(
  cacheDirectory: string,
  shouldUseCache: boolean,
): Checkout {
  const isCached =
    shouldUseCache && existsSync(path.join(cacheDirectory, '.git'));

  if (!isCached) {
    mkdirSync(cacheDirectory, { recursive: true });
    if (!existsSync(path.join(cacheDirectory, '.git'))) {
      git(cacheDirectory, 'init', '--quiet');
      git(cacheDirectory, 'remote', 'add', 'origin', CONTENT_REPO);
    }
    git(cacheDirectory, 'fetch', '--depth', '1', '--quiet', 'origin', 'main');
    git(cacheDirectory, 'checkout', '--quiet', 'FETCH_HEAD');
  }

  // Always reapplied, not just on a fresh clone. A shallow fetch downloads
  // every object for the commit — sparse-checkout only decides what lands in
  // the working tree — so this re-materialises paths added to `SPARSE_PATHS`
  // since the cache was built, without a refetch. Skipping it when cached
  // would leave a stale checkout silently missing the new trees, and the
  // import would resolve links against a tree with holes in it.
  //
  // `--no-cone` so individual files like `_redirects.txt` can be selected;
  // cone mode only takes directories.
  git(cacheDirectory, 'sparse-checkout', 'set', '--no-cone', ...SPARSE_PATHS);

  return {
    root: path.join(cacheDirectory, 'files/en-us'),
    sha: git(cacheDirectory, 'rev-parse', 'HEAD'),
  };
}
