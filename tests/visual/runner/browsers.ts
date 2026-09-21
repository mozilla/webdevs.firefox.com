/**
 * The browser matrix.
 *
 * Five configurations in two tiers, and **none of them is pinned**. Every
 * browser is fetched at image build time from its vendor's current
 * release, so `stable` means what the vendors ship today and
 * `prerelease` means what is in beta today. Rebuilding the image moves
 * them, and a browser release that changes rendering shows up as a
 * baseline diff.
 *
 * That is the intent rather than a shortcoming. For a Mozilla property,
 * "Firefox 157 renders this differently" is among the most valuable things
 * the suite can tell you, and pinning to keep the check quiet would
 * throw exactly that away. What the tiers separate is not pinned from
 * floating, but blocking from advisory: a stable-channel diff should stop
 * a merge until someone has looked at it, while beta churn should open a
 * conversation without blocking anyone.
 *
 * The consequence to plan for is that a stable-channel failure now has two
 * possible causes — your change, or a browser release — where a pinned
 * matrix would have left only one. The run prints every browser's version,
 * so the first thing to check is whether those moved.
 *
 * Two things worth stating because they are easy to get wrong:
 *
 * - **`firefox` is the real Mozilla release, not Playwright's bundled
 *   build.** The bundled one is frozen to the Playwright version in
 *   `package.json` — it is 155 while Firefox stable is 156 — so it answers
 *   "what did Firefox do when this Playwright shipped", which is not the
 *   question. `moz-firefox` drives the real installed browser instead. The
 *   same reasoning rules out Playwright's bundled Chromium, which runs
 *   *ahead* of stable Chrome.
 * - **There is no WebKit pre-release, and WebKit-on-Linux is not Safari.**
 *   No beta channel is shipped, and Safari Technology Preview is
 *   macOS-only, so it is unreachable from a Linux container. The matrix is
 *   five, not six. The `webkit` that is here is a GTK MiniBrowser build
 *   with a Linux font stack: it catches WebKit engine layout regressions,
 *   but it does not tell you what a Mac or iOS user sees. It is also the
 *   one browser still tied to the Playwright version, since Apple ships no
 *   Linux build to track.
 */
import type { Tier } from './config.ts';

export interface BrowserConfig {
  /** Name in the screenshot key, and the Playwright project name. */
  id: string;
  /** Playwright's browser type. */
  browser: 'chromium' | 'firefox' | 'webkit';
  /** Channel, where the configuration is not the bundled build. */
  channel?: string | undefined;
  tier: Tier;
}

export const browsers: BrowserConfig[] = [
  {
    id: 'firefox',
    browser: 'firefox',
    /* The real Mozilla stable release, over BiDi — not the bundled build,
       which is frozen to the Playwright version. */
    channel: 'moz-firefox',
    tier: 'stable',
  },
  { id: 'chrome', browser: 'chromium', channel: 'chrome', tier: 'stable' },
  { id: 'webkit', browser: 'webkit', tier: 'stable' },
  {
    id: 'firefox-beta',
    browser: 'firefox',
    channel: 'moz-firefox-beta',
    tier: 'prerelease',
  },
  {
    id: 'chrome-beta',
    browser: 'chromium',
    channel: 'chrome-beta',
    tier: 'prerelease',
  },
];

/** The configurations in a tier. */
export const browsersInTier = (tier: Tier): BrowserConfig[] =>
  browsers.filter((browser) => browser.tier === tier);
