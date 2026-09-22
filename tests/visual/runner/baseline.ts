/**
 * Reading, hydrating and hashing a baseline.
 *
 * A baseline is a folder in the store named by a hash of its own contents,
 * and `tests/visual/baseline.txt` holds that name — one line, and the
 * entire committed footprint of the system. Because the name is derived
 * from the pixels, two runs that render identically produce the same name,
 * and the text file conflicts on exactly the pull requests that both
 * changed rendering.
 */
import { mkdir, readFile, writeFile, rename, rm, cp } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  baselineDirectoryFor,
  baselineFileFor,
  baselinePrefixFor,
  blobCacheDirectory,
  type Tier,
} from './config.ts';
import { hashBytes, type Storage } from './storage.ts';

/**
 * Names the baseline whose contents are `entries`.
 *
 * Computed over the sorted `(key, sha256-of-bytes)` pairs, so it depends on
 * the pixels and the names and on nothing else — not on upload order, not
 * on timestamps. SHA-256 here rather than the MD5 the stores report,
 * because this one is ours to choose and only the per-object hashes have to
 * match what a listing returns.
 *
 * Truncated to 16 hex characters: this names a folder, and collision
 * resistance at 64 bits against a few thousand baselines is not the
 * system's weak point, while a short name is one a human can read out.
 */
export const baselineHash = (
  entries: { key: string; body: Buffer }[],
): string => {
  const digest = createHash('sha256');

  const sorted = entries.toSorted((a, b) => a.key.localeCompare(b.key));

  for (const { key, body } of sorted) {
    digest.update(key);
    digest.update('\0');
    digest.update(createHash('sha256').update(body).digest('hex'));
    digest.update('\n');
  }

  return digest.digest('hex').slice(0, 16);
};

/** The hash naming a tier's current baseline, or undefined before its
    first accept. */
export const readBaselineReference = async (
  tier: Tier,
): Promise<string | undefined> => {
  try {
    const text = await readFile(baselineFileFor(tier), 'utf8');
    const hash = text.trim();
    return hash === '' ? undefined : hash;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

/** Rewrites the hash file. Left as an unstaged change for review — accept
    never commits on your behalf. */
export const writeBaselineReference = async (
  tier: Tier,
  hash: string,
): Promise<void> => {
  await writeFile(baselineFileFor(tier), `${hash}\n`);
};

/** Store key for one image within a baseline folder. */
export const baselineKey = (tier: Tier, hash: string, name: string): string =>
  `${baselinePrefixFor(tier)}/${hash}/${name}`;

/**
 * Writes a blob into the content-keyed cache under the hash of its bytes.
 *
 * Write to a scratch name and rename, rather than writing in place. The
 * file's name is a hash of its contents and nothing verifies that again —
 * a hydrate that finds the name assumes the bytes — so a run interrupted
 * mid-write would leave a truncated file sitting under the full hash's
 * name, and the next hydrate would copy it into the baseline as the image
 * to compare against. Wrong expected pixels, and no error anywhere.
 * `rename` within a directory is atomic, so the name appears only once
 * every byte behind it is there.
 *
 * The scratch name is unique per write because two shots can legitimately
 * have identical bytes — a `color-scheme: dark` footer looks the same in
 * both schemes — so hydrating them concurrently writes one hash twice.
 */
const writeBlob = async (hash: string, body: Buffer): Promise<void> => {
  await mkdir(blobCacheDirectory, { recursive: true });
  const blob = path.join(blobCacheDirectory, hash);
  const scratch = `${blob}.${randomUUID()}.part`;
  await writeFile(scratch, body);
  await rename(scratch, blob);
};

/**
 * Fills `.vrt/<tier>/baseline/` with the baseline `hash` names.
 *
 * A single listing gives every object's hash before a byte is downloaded,
 * so anything already in the content-keyed blob cache is copied from disk
 * rather than fetched. Against the local store that is a small saving;
 * against a bucket it is what makes a repeat run offline and instant, and
 * it is the same code either way.
 */
export const hydrateBaseline = async (
  store: Storage,
  tier: Tier,
  hash: string | undefined,
): Promise<{ files: number; fetched: number }> => {
  const baselineDirectory = baselineDirectoryFor(tier);
  await rm(baselineDirectory, { recursive: true, force: true });
  await mkdir(baselineDirectory, { recursive: true });

  if (hash === undefined) return { files: 0, fetched: 0 };

  const prefix = `${baselinePrefixFor(tier)}/${hash}/`;
  const objects = await store.list(prefix);

  let fetched = 0;

  await Promise.all(
    objects.map(async (object) => {
      const name = object.key.slice(prefix.length);
      const target = path.join(baselineDirectory, name);
      const cached = path.join(blobCacheDirectory, object.hash);

      await mkdir(path.dirname(target), { recursive: true });

      try {
        await cp(cached, target);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const body = await store.get(object.key);
      fetched += 1;
      await writeFile(target, body);
      await writeBlob(object.hash, body);
    }),
  );

  return { files: objects.length, fetched };
};

/** Adds a blob to the content-keyed cache, so a later hydrate skips it. */
export const cacheBlob = async (body: Buffer): Promise<void> => {
  await writeBlob(hashBytes(body), body);
};
