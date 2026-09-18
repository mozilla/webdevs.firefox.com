/**
 * Test pages are built only when asked for.
 *
 * The specimen pages under `src/pages/test/` check the site's styles against the design — they are not part of the
 * site. Dev always includes them, so `pnpm dev` needs no flag; a build includes them only with `INCLUDE_TEST_PAGES`
 * set:
 *
 * ```sh
 * INCLUDE_TEST_PAGES=1 pnpm build
 * ```
 *
 * A switched-off page is absent from the production build entirely rather than present and hidden.
 */
const isEnabled = (): boolean =>
  import.meta.env.DEV || Boolean(import.meta.env.INCLUDE_TEST_PAGES);

/**
 * The `getStaticPaths` a test page exports to gate itself.
 *
 * Every test page is a dynamic route — a rest parameter, as in
 * `test/prose/[...slug].astro` — because only a dynamic route runs
 * `getStaticPaths`, and returning no paths is what keeps the page out of the
 * production build. A static `test/prose.astro` would have no equivalent
 * escape hatch, so the rest parameter is load-bearing rather than decorative.
 *
 * The single path it returns when enabled has `slug: undefined`, which a rest
 * parameter renders at the bare route — `/test/prose/`, with nothing after
 * it.
 *
 * ```astro
 * export const getStaticPaths = testPagePaths;
 * ```
 */
export const testPagePaths = (): { params: { slug: undefined } }[] =>
  isEnabled() ? [{ params: { slug: undefined } }] : [];
