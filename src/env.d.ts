/**
 * Extends Astro's own `import.meta.env` types with this project's variables.
 *
 * `astro:env` would be the typed alternative, but its schema validates at
 * runtime inside the Astro context only, and the value here is read to decide
 * whether a route emits any pages at all — a build-time switch, not
 * configuration. Declaring it here keeps `import.meta.env` and leaves the
 * variable statically replaced by Vite.
 */
/* `src/env.d.ts` is the filename Astro's docs prescribe for this, so the
   rule's suggested `environment.d.ts` would put it somewhere nobody looks. */
/* eslint-disable-next-line unicorn/name-replacements -- see above */
interface ImportMetaEnv {
  /**
   * Set to include the specimen pages under `src/pages/_test/` in a build.
   * See `src/pages/_test/_test-pages.ts`.
   */
  readonly INCLUDE_TEST_PAGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
