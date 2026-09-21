/**
 * Gives every MDX file the components markdown maps to, by appending a
 * `components` export to it.
 *
 * `@astrojs/mdx` merges a `components` export from the MDX module itself into
 * the mapping it compiles with, ahead of anything a call site passes. So a
 * file that ends with
 *
 * ```js
 * import Blockquote from '~/components/Blockquote';
 * export const components = { blockquote: Blockquote };
 * ```
 *
 * renders `>` as the component, and the page renders a bare `<Content />`.
 *
 * ## Why this isn't a prop
 *
 * MDX's mapping is normally passed per call site, and Astro has no global
 * equivalent. The tempting fix is a wrapper component the pages share —
 * `<Prose {Content} />` — and that quietly breaks every component an MDX file
 * imports.
 *
 * Before a page streams, Astro collects the components that contribute to
 * `<head>`, which is how an entry's imported components get their styles onto
 * the page. It finds them by construction: instantiating a component calls its
 * slot functions immediately, so a `<Content />` nested in layouts is reached.
 * A component passed as a *prop* is an inert value until something renders it,
 * and a wrapper renders it from inside its own body — after the head is out.
 * The styles are then dropped silently, leaving the markup with none of its
 * rules, in `pnpm dev` as much as in a built page.
 *
 * Putting the mapping in the file removes the reason to write that wrapper:
 * there is no prop to repeat, so `<Content />` is the whole call site. Which
 * in turn means an author's own `import Note from '~/components/Note'` works
 * the ordinary way, for an `.astro` component as much as a `.tsx` one, and its
 * CSS ships to the pages that use it rather than to every page.
 *
 * ## Why a Vite transform
 *
 * The mapping has to become an ESM import, and the markdown pipeline is the
 * wrong height for that: satteri exposes mdast and hast plugins, whose
 * visitors are per node type and warn against editing `root`, and `mdx()`'s
 * `recmaPlugins` — the estree hook that would fit — is deprecated. Text
 * prepended to the source would do it, but it is appended instead, because
 * ESM is hoisted wherever it sits in an MDX document and appending leaves
 * every line number in the file untouched for error messages.
 */

/**
 * Element name → the module its component comes from. Add a line to map
 * another piece of markdown syntax; the import is generated, so the component
 * can be `.astro` or `.tsx` as suits it.
 *
 * Only markdown syntax's own components belong here. A component an author
 * calls by name — `<Note>` — is imported by the file that uses it, which is
 * what keeps it out of the module graph of every other page.
 */
const MAPPED_COMPONENTS: Record<string, string> = {
  blockquote: '~/components/Blockquote',
};

/** Prefix for the generated bindings. Long enough not to collide with a name
    an author would write, since the two share a module scope. */
const BINDING_PREFIX = '__proseComponent';

const entries = Object.entries(MAPPED_COMPONENTS);

const generated = [
  ...entries.map(
    ([, module_], index) =>
      `import ${BINDING_PREFIX}${String(index)} from '${module_}';`,
  ),
  `export const components = {${entries
    .map(([element], index) => ` ${element}: ${BINDING_PREFIX}${String(index)}`)
    .join(',')} };`,
].join('\n');

/**
 * Matches an MDX module, ignoring any query Vite has added — the same file is
 * transformed more than once, and the `?astroPropagatedAssets` copy is the one
 * a content collection renders.
 */
const isMdx = (id: string): boolean =>
  id.split('?', 1)[0]?.endsWith('.mdx') === true;

/** An author's own `components` export, which would collide with the
    generated one rather than merge with it. */
const EXISTING_EXPORT = /^\s*export\s+(?:const|let|var)\s+components\b/m;

/* No declared return type, and no `vite` import to give it one: Vite is not
   a direct dependency, only Astro's. The shape is checked where it is used —
   `astro.config.ts` assigns it into `vite.plugins`, whose type comes from the
   Vite that Astro itself bundles, so the two cannot drift. */
export const proseComponents = () => ({
  name: 'prose-components',
  /* Ahead of `@astrojs/mdx`, which compiles the file this appends to. */
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!isMdx(id)) return;

    if (EXISTING_EXPORT.test(code)) {
      throw new Error(
        `${id}: this file exports \`components\` itself, which would collide ` +
          `with the mapping \`prose-components\` appends. Add the component ` +
          `to MAPPED_COMPONENTS in lib/markdown/prose-components.ts instead.`,
      );
    }

    /* Appended, so the file's own line numbers survive for error messages
       and no source map is needed to correct them.
    
       The comment between the two is load-bearing. A blank line does not
       close a definition list — pandoc's syntax allows a loose list, so the
       parser is still waiting for another `term` / `: definition` pair — and
       a file whose last block is one swallows what follows as more list
       content. The ESM then parses as an MDX expression instead, and
       `export const components = { blockquote: … }` fails on the `:` at a
       line number past the end of the file, which is a thoroughly
       unhelpful place to be told about it. A comment is a block of its own,
       so it terminates the list and leaves nothing on the page. */
    return `${code}\n\n{/* prose-components */}\n\n${generated}\n`;
  },
});
