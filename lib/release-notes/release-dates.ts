import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Firefox release dates, from `mdn/browser-compat-data`.
 *
 * The release notes' frontmatter has no date — only prose, in inconsistent
 * forms ("was released on", "shipped on", a comma in the wrong place) and two
 * versions (23 and 25) have no date at all. BCD has a `release_date` for all
 * 161 versions, so it settles what prose parsing cannot.
 *
 * Fetched as the single `browsers/firefox.json` file rather than taken as an
 * npm dependency: the package is 19 MB, all of it compat tables this script
 * never reads, and it would be installed on every CI build and every
 * contributor's machine to supply 99 date strings. The file is 41 KB, and
 * fetching it from the repo mirrors how the content itself is fetched.
 *
 * Refetched on every run, alongside the content itself. Cached on disk beside
 * the content checkout, so `--use-cache` makes a repeated run offline.
 */

const BCD_URL =
  'https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers/firefox.json';

interface BcdRelease {
  release_date?: string;
}

interface BcdFirefox {
  browsers?: { firefox?: { releases?: Record<string, BcdRelease> } };
}

export interface Release {
  version: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  year: number;
}

async function loadFirefoxData(
  cacheDirectory: string,
  shouldUseCache: boolean,
): Promise<BcdFirefox> {
  const cacheFile = path.join(cacheDirectory, 'bcd-firefox.json');

  if (shouldUseCache && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as BcdFirefox;
  }

  const response = await fetch(BCD_URL);
  if (!response.ok) {
    throw new Error(
      `fetching ${BCD_URL} failed: ${String(response.status)} ${response.statusText}`,
    );
  }
  const body = await response.text();

  mkdirSync(cacheDirectory, { recursive: true });
  writeFileSync(cacheFile, body);
  return JSON.parse(body) as BcdFirefox;
}

/**
 * Every numeric Firefox release at or above `minVersion`, with its date,
 * sorted by version.
 */
export async function releasesFrom(
  minVersion: number,
  cacheDirectory: string,
  shouldUseCache: boolean,
): Promise<Release[]> {
  const data = await loadFirefoxData(cacheDirectory, shouldUseCache);
  const releases = data.browsers?.firefox?.releases;
  if (!releases) {
    throw new Error('no browsers.firefox.releases in BCD data');
  }

  const out: Release[] = [];
  for (const [version, info] of Object.entries(releases)) {
    if (!/^\d+$/.test(version) || Number(version) < minVersion) continue;
    const date = info.release_date;
    if (date === undefined || date === '') {
      // BCD has a date for every version today. If that ever changes, the
      // page's URL can't be built, so stop rather than invent one.
      throw new Error(`no release_date in BCD for Firefox ${version}`);
    }
    out.push({ version, date, year: Number(date.slice(0, 4)) });
  }

  return out.toSorted((a, b) => Number(a.version) - Number(b.version));
}
