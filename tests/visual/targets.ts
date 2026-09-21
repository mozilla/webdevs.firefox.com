/**
 * The pages the visual regression suite screenshots.
 *
 * Every one is a specimen page under `src/pages/test/`, which is the single
 * home for pages that exist to be looked at — there is no separate set of
 * fixture pages of its own. A page a human opens to check a component
 * against the design and a page a browser screenshots want the same thing: the
 * component, in the states the live site does not reach, with nothing else
 * on the page. Keeping one copy means the two cannot drift, and adding a
 * state to a specimen extends its coverage automatically.
 *
 * So this file is a list of routes and how to shoot them, not a list of
 * pages. Adding a target is a line here plus, if the page does not exist
 * yet, a new directory under `src/pages/test/`.
 *
 * An explicit list rather than a glob over those routes, because it carries
 * the per-target configuration: widths and schemes are declared per page
 * instead of cross-multiplied across the whole matrix, which keeps the shot
 * count honest. A footer with real dark-mode behavior asks for both
 * schemes; a page that is scheme-agnostic does not pay for a second
 * screenshot. The list is also greppable and diffable, which a glob is not.
 *
 * Shot count is `Σ over targets (widths × schemes) × browsers`, so it grows
 * quickly — see `plans/visual-regression-testing-plan.md`.
 */

/** Color schemes a target can be rendered in. */
export type Scheme = 'light' | 'dark';

export interface Target {
  /** Screenshot key, and the directory under `src/pages/test/`. */
  id: string;
  /**
   * The route, where it is not `/test/<id>/`. Set this only when the page
   * is not named after the target.
   */
  route?: string | undefined;
  /** Widths in px. Defaults to {@link DEFAULT_WIDTHS}. */
  widths?: number[] | undefined;
  /** Color schemes. Defaults to {@link DEFAULT_SCHEMES}. */
  schemes?: Scheme[] | undefined;
}

/**
 * The standard width set, in px.
 *
 * 1440 is the only width Figma specifies, so it is the reference. The rest
 * are where the layout is interpretation rather than spec — 960 sits just
 * below the `60rem` breakpoint the header and footer use, 600 is small
 * tablet, 375 a narrow phone — which is precisely where a regression would
 * otherwise go unnoticed.
 *
 * These are px because they are viewport sizes handed to the browser, not
 * CSS the site ships; the `rem` rule in `CLAUDE.md` is about authored CSS.
 */
export const DEFAULT_WIDTHS = [1440, 960, 600, 375];

/** Schemes used by a target that doesn't declare its own. */
export const DEFAULT_SCHEMES: Scheme[] = ['light'];

/**
 * Viewport height. Every shot is `fullPage`, so this only decides where the
 * fold falls for anything that reacts to it, not how much is captured.
 */
export const VIEWPORT_HEIGHT = 1024;

export const targets: Target[] = [
  {
    id: 'buttons',
    // The button matrix is a grid of small components, so the middle
    // widths only re-test wrapping. Both schemes: the outlined style's
    // label and the disabled state are both mode-dependent.
    widths: [1440, 375],
    schemes: ['light', 'dark'],
  },
  {
    id: 'header',
    schemes: ['light', 'dark'],
  },
  {
    id: 'header-overlay',
    // The overlay variant over the real article hero. It pins itself to
    // dark for legibility over that gradient, so both schemes should look
    // the same across the header itself — the page behind it does not.
    schemes: ['light', 'dark'],
  },
  {
    id: 'footer',
    // The footer pins `color-scheme: dark` on itself, so light and dark
    // should be identical — which is the thing worth catching if it breaks.
    schemes: ['light', 'dark'],
  },
  {
    id: 'prose',
    schemes: ['light', 'dark'],
  },
  {
    id: 'code',
    // The code blocks pick a formatted variant by container query, so the
    // full width set is the point here rather than an extra cost.
    schemes: ['light', 'dark'],
  },
];

/** The route a target is served at. */
export const targetRoute = (target: Target): string =>
  target.route ?? `/test/${target.id}/`;

/** Widths a target is captured at, defaults applied. */
export const targetWidths = (target: Target): number[] =>
  target.widths ?? DEFAULT_WIDTHS;

/** Schemes a target is captured in, defaults applied. */
export const targetSchemes = (target: Target): Scheme[] =>
  target.schemes ?? DEFAULT_SCHEMES;
