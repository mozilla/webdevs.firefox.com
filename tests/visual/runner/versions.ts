/**
 * The browser versions a run used.
 *
 * Nothing in the matrix is pinned — see `browsers.ts` — so a stable-channel
 * failure has two possible causes: your change, or a browser release. This
 * is what tells the two apart. The run prints these, and `pnpm vrt:accept`
 * writes them beside the baseline hash, so a baseline records what
 * produced it and a later diff can be read against it.
 *
 * Launching each browser is the only honest way to ask. Reading the
 * package version or a tarball's `application.ini` would report what is
 * installed rather than what Playwright actually drove, and for the BiDi
 * channels those can differ.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import * as playwright from '@playwright/test';

import { browsersInTier } from './browsers.ts';
import { currentDirectoryFor, type Tier } from './config.ts';

/** Browser id to its version string, for one tier. */
export const browserVersions = async (
  tier: Tier,
): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    browsersInTier(tier).map(async ({ id, browser, channel }) => {
      const type = playwright[browser];
      const launched = await type.launch(
        channel === undefined ? {} : { channel },
      );
      const version = launched.version();
      await launched.close();
      return [id, version] as const;
    }),
  );

  return Object.fromEntries(entries);
};

/**
 * Where a run leaves the versions it used, for `pnpm vrt:accept` to pick
 * up.
 *
 * Written by the run rather than read by accept, because accept runs on
 * the host while the browsers only exist inside the container — asking
 * there fails, and asking on the host would answer about the wrong
 * machine. It lives beside the shots it describes, so it is discarded with
 * them when the next run clears the directory.
 */
const versionsPath = (tier: Tier): string =>
  path.join(currentDirectoryFor(tier), 'versions.json');

/** Records the versions a run used. */
export const writeVersions = async (
  tier: Tier,
  versions: Record<string, string>,
): Promise<void> => {
  const file = versionsPath(tier);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(versions, undefined, 2)}\n`);
};

/** The versions the last run used, if it recorded any. */
export const readVersions = async (
  tier: Tier,
): Promise<Record<string, string> | undefined> => {
  try {
    return JSON.parse(await readFile(versionsPath(tier), 'utf8')) as Record<
      string,
      string
    >;
  } catch {
    return undefined;
  }
};

/** One line per browser, for the run log. */
export const formatVersions = (versions: Record<string, string>): string =>
  Object.entries(versions)
    .map(([id, version]) => `         ${id.padEnd(13)} ${version}`)
    .join('\n');
