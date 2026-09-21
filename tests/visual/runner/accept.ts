/**
 * `pnpm vrt:accept` — promote the last run to the baseline.
 *
 * What it does, and the order matters:
 *
 * 1. Read every image the run wrote to `.vrt/current/`. The spec writes
 *    each capture there under its store key whether or not it matched, so
 *    this is the complete set by construction — accept never has to merge
 *    the run with the hydrated baseline, or recover a key from Playwright's
 *    flattened naming of a failed test.
 * 2. Hash that set to name the new folder.
 * 3. Server-side-copy the previous folder to the new name, then overwrite
 *    only the images that actually changed. Changing the footer uploads the
 *    handful of footer shots rather than all of them; against a real bucket
 *    the copy costs a couple of seconds and no egress.
 * 4. Only once every image object is written, rewrite `baseline.txt`.
 *
 * Step 4 last is the invariant worth protecting: a half-finished accept
 * leaves an orphaned folder nobody points at, rather than a live baseline
 * with images missing. Those orphans are what `pnpm vrt:gc` will reclaim —
 * the failure mode is garbage, which is cheap, instead of a broken
 * baseline, which is not.
 *
 * It rewrites `baseline.txt` and stops. Committing is yours: the hash file
 * is the reviewable record of a deliberate decision, so accept never
 * commits on your behalf.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { exit } from 'node:process';

import {
  baselineHash,
  baselineKey,
  cacheBlob,
  readBaselineReference as readBaselineReference,
  writeBaselineReference as writeBaselineReference,
} from './baseline.ts';
import {
  baselineFileFor,
  baselinePrefixFor,
  currentDirectoryFor,
  repoRoot,
  storage,
  tier,
  type Tier,
} from './config.ts';
import { browsersInTier } from './browsers.ts';
import { readVersions } from './versions.ts';
import { targets, targetSchemes, targetWidths } from '../targets.ts';
import { hashBytes, type Storage } from './storage.ts';

/** Every file under `directory`, as keys relative to it with `/`
    separators. */
const walk = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, {
      withFileTypes: true,
      recursive: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    files.push(path.relative(directory, full).split(path.sep).join('/'));
  }
  return files;
};

const which = tier();
const currentDirectory = currentDirectoryFor(which);
const prefix = baselinePrefixFor(which);

/**
 * Writes the browser versions the run used into the baseline folder.
 *
 * In the folder rather than the committed hash file, because it describes
 * the images and travels with them — and because a browser release should
 * not by itself dirty the working tree.
 */
const recordVersions = async (
  store: Storage,
  prefix: string,
  hash: string,
  which: Tier,
): Promise<void> => {
  const versions = await readVersions(which);
  if (versions === undefined) return;

  await store.put(
    `${prefix}/${hash}/versions.json`,
    Buffer.from(`${JSON.stringify(versions, undefined, 2)}\n`),
    'application/json',
  );
};

/** The shots the run produced, keyed by their name in the baseline. */
const collectShots = async (): Promise<Map<string, Buffer>> => {
  const shots = new Map<string, Buffer>();

  const names = await walk(currentDirectory);

  for (const name of names) {
    if (!name.endsWith('.png')) continue;
    shots.set(name, await readFile(path.join(currentDirectory, name)));
  }

  return shots;
};

const shots = await collectShots();

if (shots.size === 0) {
  console.error(
    '[vrt] nothing to accept — run `pnpm vrt` first, so there are screenshots to promote',
  );
  exit(1);
}

/*
 * Every shot the matrix describes has to be present.
 *
 * A run that crashes part way — a bad import, a browser that fails to
 * launch — leaves `.vrt/<tier>/current/` holding whatever it managed
 * before it died, and nothing about that directory says it is incomplete.
 * Promoting it would write a baseline missing those images, and the next
 * run would report them as *new* rather than as missing, which reads like
 * a fresh target rather than a broken accept. Checking the count against
 * the matrix is what turns that silent corruption into a refusal.
 */
const expected = new Set(
  browsersInTier(which).flatMap((browser) =>
    targets.flatMap((target) =>
      targetWidths(target).flatMap((width) =>
        targetSchemes(target).map(
          (scheme) =>
            `${target.id}/${browser.id}/${String(width)}/${scheme}.png`,
        ),
      ),
    ),
  ),
);

const missing = [...expected]
  .filter((key) => !shots.has(key))
  .toSorted((a, b) => a.localeCompare(b));

if (missing.length > 0) {
  console.error(
    `[vrt] refusing to accept — the last run produced ${String(shots.size)} of ${String(expected.size)} shots.`,
  );
  console.error('[vrt] missing:');
  for (const key of missing.slice(0, 10)) console.error(`         ${key}`);
  if (missing.length > 10) {
    console.error(`         … and ${String(missing.length - 10)} more`);
  }
  console.error('[vrt] re-run `pnpm vrt` and let it finish.');
  exit(1);
}

const entries = shots
  .entries()
  .map(([key, body]) => ({ key, body }))
  .toArray();
const previous = await readBaselineReference(which);
const hash = baselineHash(entries);

const store = storage();

if (hash === previous) {
  /*
   * Same pixels, so the folder is already right — but the versions that
   * produced them may not have been recorded yet, and a baseline accepted
   * before version recording existed has none at all. Backfill rather
   * than exit, so every live baseline can say what rendered it.
   */
  await recordVersions(store, prefix, hash, which);
  console.log(`[vrt] baseline ${hash} is already current — nothing changed`);
  exit(0);
}

/*
 * Copy the previous folder across first, so only what changed is uploaded.
 * With a local store this is a file copy; with GCS or S3 it is a
 * server-side copy and the bytes never leave the provider.
 */
let copied = 0;
if (previous !== undefined) {
  const existing = await store.list(`${prefix}/${previous}/`);
  await Promise.all(
    existing.map(async (object) => {
      const name = object.key.slice(`${prefix}/${previous}/`.length);
      await store.copy(object.key, baselineKey(which, hash, name));
    }),
  );
  copied = existing.length;
}

/* Then overwrite only the images whose bytes actually differ. */
const copiedObjects = await store.list(`${prefix}/${hash}/`);
const target = new Map(
  copiedObjects.map((object) => [object.key, object.hash]),
);

/* Only the images whose bytes differ from what the copy already put
   there — this is where the incremental saving actually lands. */
const changed = entries.filter(
  ({ key, body }) =>
    target.get(baselineKey(which, hash, key)) !== hashBytes(body),
);

await Promise.all(
  changed.map(async ({ key, body }) => {
    await store.put(baselineKey(which, hash, key), body, 'image/png');
    await cacheBlob(body);
  }),
);
const written = changed.length;

/* Anything the copy brought over that this run no longer produces — a
   target that was removed, a width that was dropped. The new folder must
   be exactly this run's set, or its hash would not describe it.
   `versions.json` is not a shot and is rewritten below, so it is kept
   rather than removed and immediately recreated. */
const wanted = new Set(entries.map(({ key }) => baselineKey(which, hash, key)));
wanted.add(`${prefix}/${hash}/versions.json`);

const stale = target
  .keys()
  .filter((key) => !wanted.has(key))
  .toArray();
for (const key of stale) {
  await store.remove(key);
}
const removed = stale.length;

/*
 * Record what rendered this baseline, in the folder it names. Nothing in
 * the matrix is pinned, so a later diff needs to be readable as "the
 * browsers moved" or "the site moved", and that is not answerable without
 * knowing which versions produced the images being compared against.
 *
 * In the folder rather than in the committed hash file, because it
 * describes the images and travels with them — and because a version
 * string changing should not by itself dirty the working tree.
 */
await recordVersions(store, prefix, hash, which);

/* Last, and only now: every image object is in place, so the reference can
   safely point at the folder. */
await writeBaselineReference(which, hash);

console.log(
  `[vrt] accepted ${hash} — ${String(entries.length)} shots ` +
    `(${String(copied)} copied, ${String(written)} uploaded` +
    (removed > 0 ? `, ${String(removed)} removed` : '') +
    ')',
);
console.log(
  `[vrt] ${path.relative(repoRoot, baselineFileFor(which))} is changed — review and commit`,
);
