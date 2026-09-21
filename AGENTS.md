# webdevs.firefox.com

Astro static site for Firefox's web developer audience. Built from the
`Firefox_for_Developers` Figma file.

## Commands

| Command       | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `pnpm dev`    | Dev server                                                  |
| `pnpm check`  | Prettier + build + ESLint + tests (run before commits)      |
| `pnpm build`  | Production build, then `astro check` and `tsc`              |
| `pnpm format` | Write Prettier formatting                                   |
| `pnpm test`   | Unit tests for `lib/` and `tests/visual/`, on Node's runner |
| `pnpm vrt`    | Visual regression run — see "Visual regression testing"     |

The build runs before both `astro check` and ESLint, because it generates the
CSS Module declarations that their type-aware rules read — see
`lib/css-module-types.ts`. CI is ordered the same way.

pnpm is the package manager and the Node version is pinned in
`package.json`/`.npmrc` — use `corepack enable` rather than a global pnpm.
CI runs `pnpm run format:check`, `pnpm run build`, `pnpm run lint` and
`pnpm run test` on every PR, in that order. It runs them as separate steps
rather than calling `pnpm check`, because that script is `;`-separated and so
exits with only `test`'s status — a broken build would leave CI green.

## Writing

**Use US spelling everywhere** — comments, doc comments, commit messages,
plans, markdown, identifiers and any text the site renders. So `color`,
`behavior`, `center`, `gray`, `optimize`, `defense`, not the `-our-`/`-re`/
`-ise` forms.

It is a consistency rule rather than a style one: CSS and the DOM are
US-spelled (`color-scheme`, `currentColor`) and the token names built from
them are too, so one spelling means a search for `color` finds the discussion
as well as the declaration.

MDN release notes imported into `src/content/release-notes/` are excluded:
they are copied verbatim and the importer is re-runnable, so edits there
would be overwritten.

## CSS

### Prefer grid over flexbox

Use `display: grid` by default, including for one-dimensional layouts.
Grid placement is explicit and doesn't rely on source order, and
`grid-template-areas` expresses responsive rearrangement far more legibly
than reordering flex items.

**Only use flexbox when items need to wrap**, which grid cannot do — a
variable-length list of links is the usual case. When you do reach for flex,
leave a comment saying why, as in `.nav-list` and `.legal-list`.

Practical equivalents:

- Row of items → `grid-auto-flow: column` (not `flex-direction: row`)
- Stack → `display: grid` with `gap` (not `flex-direction: column`)
- Push an item to one end → `justify-self: end` (not `margin-left: auto`)
- Fill remaining space → a `1fr` track (not `flex-grow: 1`)
- Keep a stack top-aligned → `align-content: start`, or tracks collapse to
  fill the container

### Use rem and em, never pixels

No pixel values in CSS. Convert Figma's px numbers at 1rem = 16px, so a 24px
gap becomes `1.5rem` and 14px type becomes `0.875rem`. This includes values
that look like they should be physical: hairline rules are `0.0625rem`, and
visually-hidden clip sizes are `0.0625rem`. The layout then scales with the
user's font-size preference instead of ignoring it.

Use `em` where the value should track its own element's font size — chiefly
`letter-spacing`, so tracking stays proportional as type sizes change.

Media queries use `rem` too (`@media (width >= 60rem)`), which makes
breakpoints respond to root font size.

The exception is the `width`/`height` attributes on Astro's `<Image>` and
imported SVG components: those are intrinsic asset dimensions, not CSS, and
stay unitless numbers. Control the rendered size in CSS.

### Media queries are mobile first

Unconditional rules describe the narrowest layout, and every media query is
a min-width one (`width >= 48rem`) adding to it as room appears. Don't write
a `width <` query.

The narrow layout is usually the simpler of the two — one column, no sticky
positioning, full-bleed — so making it the base means the exceptional case
is the one behind a query, and a property whose value is the same at every
width is written once. It also keeps the fallback honest: anything that
can't evaluate the query, printing included, gets the layout that survives
the least space.

A consequence worth expecting: a default that is also the CSS initial value
disappears rather than being restated.

Breakpoints are chosen per component, at the width where that component's own
layout stops working, rather than from a shared set of device sizes.

### Design tokens

All color, spacing and type values live in `src/styles/tokens.css` as custom
properties. Token names mirror the Figma variable names exactly so the two
stay reconcilable — don't rename them, and don't hardcode a value that has a
token. The numbers in the spacing and type token names are Figma's pixel
values, while the values themselves are rem.

Some tokens are off Figma's spacing scale, `--space-30` among them. A value
earns a name when it recurs across components, not merely because it is
off-scale — 30 is used in about a dozen places in the editorial designs, so
one named value beats a dozen literals each repeating the same comment.
Don't inline those back into literals. A genuine one-off still gets a literal
and a comment, as with the 38 the blockquote's quote mark hangs by.

Mode-dependent colors use `light-dark()`, with `color-scheme: light dark`
set on `:root`. Where a **whole subtree** should look the same in both
schemes, prefer pinning its `color-scheme` over a second set of values: the
footer is `color-scheme: dark` plus `--color-background-main` and
`--color-heading`, read the normal way round, so the scheme is stated once
instead of being encoded into every color.

That only works when every color on the element moves together, which is why
`--color-purple-fixed` and `--color-white-fixed` remain plain values. A button
pairs a fixed purple fill with a mode-dependent label (`--color-heading` on
the outlined style) and a mode-dependent disabled state on the same element —
one element gets one `color-scheme`, so pinning it would freeze the label to
near-black on a dark page.

Never invent a dark-mode value; the `figma-shared-design` skill says where to
read them from. Where the design genuinely has no
value — Figma's pages show buttons only at rest — derive one from a token
with `color-mix()` rather than picking a hex, and check the result: the
buttons' hover and pressed fills darken in light mode and lighten in dark,
because a darkened fill on the near-black dark page drops to 1.5:1 against
it, while lightening past ~16% white puts the white label under 4.5:1.

### Vertical metrics trim

Figma nodes marked `trim-both` / `cap_alphabetic` must get
`text-box: trim-both cap alphabetic` in CSS. The design's spacing values
assume the font's ascender/descender leading has been removed, so omitting
this makes everything sit slightly low with too much vertical space.

Apply it only to nodes that actually carry the flag. In the footer the link
items are trimmed but the column headings are not. `text-box` support can be
assumed; no `@supports` guard is needed.

### Nest where it aids readability

Use CSS nesting to keep a component's rules together, but not as a way to
mirror the DOM. Nest when it removes a repeated selector or moves a rule
next to the thing it modifies:

- **States and attribute variants** — `&:hover`, `&:not(:focus-visible)`,
  `&[aria-current='page']` go inside the base rule. They are never read
  independently of it.
- **Media query overrides** — put the `@media` block inside the rule it
  overrides, so a component's responsive behavior reads top to bottom in
  one place instead of being scattered across breakpoint blocks at the
  bottom of the file. Keep the breakpoint comment with the block.
- **Descendants tied to one parent** — `.footer { & a { … } }` where the
  selector only ever means "a link in the footer". Use the explicit `&`
  rather than a bare `a`, so the selector reads as a nested one at a glance.

Don't nest when it hurts:

- **Don't nest past two levels.** Deep chains make the effective selector
  hard to reconstruct and raise specificity invisibly.
- **Don't nest siblings.** Rules that merely appear near each other in the
  markup, like the reset's element selectors, stay flat.
- **Don't nest a component's top-level layout rules into each other**
  just because the elements are nested in the DOM. `.column-heading`
  stays a top-level rule; burying it inside `.column` gains nothing and
  makes it harder to find.

Grouping breakpoints per rule does mean the same `@media` condition is
written more than once. That is the intended trade: the duplication is in
the condition, which is cheap to read, rather than in the distance between
a property and its override.

### Other conventions

- Modern features are welcome and preferred: logical properties, range media
  queries (`@media (width >= 60rem)`), `color-mix()`, `text-wrap: balance`,
  `100dvh`, `interpolate-size`.
- The reset lives in a `@layer reset`. Unlayered rules beat layered ones
  whatever their specificity, so component styles win without juggling —
  the layer does that work on its own and reset rules need no `:where()`.
  Outside the layer it is still load-bearing: `:where(h1, h2, h3, h4)` and
  `:where(p)` in `global.css` are unlayered like component styles, so
  `:where()` is what keeps them overridable.
- Astro `<style>` blocks are scoped by default — use them for component CSS
  and keep `global.css` for the reset and shared primitives like `.wrapper`.
  Preact components have no such thing, so they use a sibling
  `*.module.css` instead (see "Shared components" below).

## Astro

- Import with the `~/*` alias (→ `src/*`), not deep relative paths.
- Components take a `Props` interface; `strictest` TS means optional props
  need explicit `| undefined`.
- `MainLayout` is the bare document shell (head, fonts, global CSS).
  `SiteLayout` extends it with the header, footer and skip link — pages
  should use `SiteLayout` unless they deliberately want no chrome.
- Fonts are configured in `astro.config.ts` and rendered by `<Font>` in
  `MainLayout`. Both families are variable, weights 200–700. Mozilla Headline
  comes from Fontsource, whose latin subset is markedly smaller than the
  foundry file. Mozilla Text is self-hosted from `src/assets/fonts/` instead,
  because Fontsource has no italic for it and one family cannot span two
  providers. Only the upright faces are preloaded, so the italic file is
  fetched only when italic text appears.
- `build.format: 'preserve'` — keep file paths as authored.
- `build.cssTarget` pins the browsers Lightning CSS minifies for, and is
  load-bearing in both directions — unset it emits draft syntax nothing
  implements, lower it and `light-dark()` stops answering to a pinned
  `color-scheme`. Its comment in `astro.config.ts` has the whole story.
  Minified CSS is only in the built site, so a bug here is invisible in
  `pnpm dev`.

## Shared components

A component used from both Astro and Preact is written as Preact, in `.tsx` —
Astro can render Preact, but not the reverse, so `Button/index.tsx` is
importable from either. Without a `client:*` directive it renders to HTML at
build time and ships no JavaScript: the Preact chunks Vite emits stay
unreferenced and the browser never fetches them. Keep it that way — these
components hold no state and take no event handlers.

Type the function as `FunctionComponent<Props>` rather than annotating the
return type; it wraps props in `RenderableProps`, which supplies `children`,
`key` and `ref`, so `Props` should not declare `children` itself. Name the
class prop `class`, not `className` — Preact accepts both, and `class` reads
naturally from Astro call sites. Neither of these produces a type error if you
get it wrong, unlike most of what follows.

Styles go in a sibling `*.module.css`, since `.tsx` has no scoped `<style>`.
Import it as a namespace rather than with bare named imports, so the `styles.`
prefix marks each use site as a class name rather than a local:

```tsx
import * as styles from '~/components/Button/index.module.css';
```

Astro passes its `data-astro-cid-*` scope hash through to the component's root
element, so a parent's scoped rule (`.cta { grid-area: cta }`) still reaches
it — keep layout and placement in the parent, the component's own appearance
in its module.

The `.d.ts` beside each `*.module.css` is generated by
`lib/css-module-types.ts`. Never edit or commit one; that file's doc comment
covers why they are gitignored, why there is deliberately no default export,
why class names must be camelCase, and why the build has to run before
`astro check` and ESLint.

## Prose

`prose.css` styles long-form content, scoped with `@scope (.prose) to
(.prose-end)` so a component can opt out of the prose rules and back in.
It keeps what has no component — headings, lists, tables, code, definition
lists — plus the margins that run _between_ blocks, including a blockquote's
own outer margin. Appearance belongs to the component; spacing between
siblings belongs to the stylesheet that can see both.

**A construct with a component behind it keeps its styles in that component,
not in `prose.css`.** Markdown syntax is mapped onto the component in
`lib/markdown/prose-components.ts`, so the component is not an alternative to
authored markup — it _is_ what authored markup renders as. `Blockquote` works
this way: an author writes `>` and gets it.

That mapping is a Vite plugin, which appends a `components` export to every
MDX file — `@astrojs/mdx` merges one from the module itself. **So a page
renders a bare `<Content />`**, and adding a mapping is one line in
`MAPPED_COMPONENTS`, for an `.astro` component as readily as a `.tsx` one.
Read that file's doc comment before changing it.

The reason it is not the obvious `<Content components={…} />` at each call
site, or a wrapper component sharing one copy of the mapping, is that the
wrapper breaks every component an MDX file imports. Before a page streams,
Astro collects the components that contribute to `<head>`, which is how an
entry's imported components get their styles onto the page. It finds them by
construction — instantiating a component calls its slot functions
immediately, so a `<Content />` nested in layouts is reached — but a
component passed as a _prop_ is an inert value until something renders it,
and a wrapper renders it from inside its own body, after the head is out. So
`<Wrapper><Content /></Wrapper>` is fine and `<Wrapper {Content} />` is not,
and a wrapper whose whole job is to supply `components` can only be the
latter. Leaving nothing to pass is what makes the mistake unavailable.

That failure is silent and leaves the markup with none of its rules, in
`pnpm dev` as much as in a built page. What makes it easy to misread is that
a page importing the same MDX as a plain module, as `/test/prose/` does, is
styled correctly either way — there the component is in the page's own module
graph and no propagation is involved — so checking the specimen proves
nothing about a release note.

**A component an author calls by name is imported by the MDX file that uses
it**, the ordinary way, and `Note` works this way. Only markdown syntax's own
components go in `MAPPED_COMPONENTS`: what is listed there is appended to
every MDX file, so its CSS reaches every page that renders prose whether or
not the page uses it. A blockquote earns that because any prose page can
produce one; a `<Note>` does not.

Two satteri plugins normalize the markup `prose.css` styles. Each carries its
full rationale in its own doc comment — read the file before changing it:

- `lib/markdown/loose-blocks.ts` — forces `spread` on every list, item and
  description, so an author's blank lines don't decide whether list text is
  wrapped in a `<p>`. `prose.css` then styles `li > p` and `dd > p` alone.
- `lib/markdown/definition-groups.ts` — a **hast** plugin wrapping each
  term/description group in a `div`, which the HTML spec allows, so
  `prose.css` can style `dl > div` instead of inferring the grouping from
  sibling position.

What this leaves for an author to get right:

- **A list or definition list written as JSX bypasses the markdown parser**,
  so `looseBlocks` cannot reach it — write the `<p>` in a JSX `li` by hand.
  `definitionGroups` does reach both forms, since it runs at hast.
- **In a `dd` written as JSX, leave the text bare.** MDX wraps multi-line text
  in a paragraph of its own, which is the one the plugin would have produced;
  an explicit `<p>` around it nests invalidly. Keeping the text on one line to
  dodge this is not stable, because Prettier rewraps a long line.
- **Prettier has no definition-list support** — it reads nested markdown pairs
  as a paragraph and reflows them to the margin — so a nested definition list
  has to be written as JSX.

When adding a component to the mapping:

- It must render the element it replaces, so authored markup and an explicit
  call produce the same thing.
- **Style markdown-generated descendants through `:global()`.** Astro's scope
  hash lands on the component's root element and never on children that came
  from markdown, so a bare `& p` compiles to `p[data-astro-cid-…]` and matches
  nothing. `& :global(p)` compiles to `blockquote[data-astro-cid-…] p`, which
  is scoped where it needs to be and open where it cannot be.
- Rules in `prose.css` that reached inside the element have to move with it —
  a `:is(li, blockquote) > :not(:first-child)` cannot see into the subtree any
  more.

## Working with Figma

The design lives in the [`Firefox_for_Developers` Figma file][figma-file].
Before touching it — implementing a frame, measuring spacing, checking an
existing component against the design, or adding a color token that needs a
dark value — load the **`figma-shared-design`** skill
(`.claude/skills/figma-shared-design/`). It holds the file key, the node IDs
for the light and dark Home pages, and the traps in `get_design_context`,
`get_variable_defs` and oversized MCP results that have each cost a wrong
implementation once already. `figma-design-to-code` is still the skill to
load before calling `get_design_context` itself.

[figma-file]: https://www.figma.com/design/JFIeIEWeVOsoEZzMFKupmh/Firefox_for_Developers?node-id=42-1079

Two rules bind even when you never open Figma: never invent a dark-mode
value, and never snap a measured value to the nearest token to make it look
tokenised. A positional value gets a literal and a comment — see "Design
tokens" above. The skill owns the spacing scale itself, so it is stated in
one place rather than two.

## Code blocks

Every fenced block is run through Prettier at each width in `TIERS`, every
distinct result is emitted, and container queries show the widest one that
fits — so a sample reads well at both full desktop measure and phone width.
Three files, each documenting its own reasoning in full:

- `lib/markdown/code-widths/format.ts` — `TIERS`, the language→parser map and
  `formatVariants`. Pure, and the only part with unit tests
  (`format.test.ts`).
- `lib/markdown/code-widths/plugin.ts` — the satteri mdast plugin that wraps
  each block and emits the variants. It runs before Astro's Shiki step, which
  is what lets one block become several without instantiating a highlighter.
- `lib/markdown/code-widths/indent-wrap.ts` — a Shiki transformer splitting
  each line into an indent cell and a content cell, so a line that outruns its
  tier wraps under its own content instead of back at the gutter. Configured
  through `markdown.shikiConfig`, because Shiki runs after the mdast plugins.

Before changing any of it, read those doc comments: they cover why the floor
is 40, why the variants cost almost nothing compressed, and why the indent
wrapping is the safety net under the whole approach.

Three things bind from outside those files:

- **`TIERS` and the `@container` blocks in `prose.css` are kept in step by
  hand.** Four blocks is not worth a generator. Getting a tier wrong is not
  fatal either way — too narrow means more line breaks than necessary, too
  wide and the indent wrapping catches the overflow.
- **The container query thresholds are in `ch`, and that is exact rather than
  an analogy.** A size feature queries the container's content box, which
  `.code-block`'s padding makes exactly the text area, and a font-relative
  unit resolves against the container's own computed font. So `48ch` means
  literally "48 code characters fit", the same question `printWidth` answers.
- **Declare the font on the `pre` and `code`, not just on the container.** The
  UA stylesheet declares `font-family: monospace` on both, and an inherited
  value loses to any declaration including a UA one, so a family on
  `.code-block` alone never reaches the text — the block then renders at
  0.602em per character while the query measures Inconsolata's 0.5em, making
  every threshold 20% optimistic and the chosen variant overflow. Inline
  `code` hits the same UA declaration, which is why `prose.css` states the
  family there too.

The colors are `lib/markdown/code-theme.ts`, a Shiki theme whose every color
is a CSS custom property rather than a hex. Shiki copies a color it does not
recognize straight into the span's inline `style`, so one theme covers both
schemes: each token resolves through `light-dark()` in `tokens.css` at paint
time, the same way the rest of the site does it. Read that file's doc comment
before changing a scope — it records which six roles the design actually
specifies, the rule used to extend them to every other language, and which of
the design sample's own inconsistencies were deliberately kept.

**Every block is wrapped in `.code-block`, variants or not**, so one set of
rules owns the block's background, padding and query container however the
block was treated. A block that opted out, one whose language has no parser
and one that dedupes to a single variant all produce `.code-block > pre`; only
a block that genuinely reflows gets `.code-variant` children.

Authoring escape hatches, read off the fence's meta string and stripped from
it before Shiki sees them:

- ` ```js no-format ` — ship exactly what the author wrote.
- ` ```js width=80 ` — one variant at a fixed width, for a sample whose point
  is a particular line layout.
- `// prettier-ignore` works inside a block, and the directive line itself is
  removed before the block reaches the reader.

**Don't promise responsive HTML samples**: Prettier's HTML printer barely
responds to `printWidth` — it breaks one attribute per line and stops — so
those blocks dedupe to a single variant. That costs nothing, but it isn't a
feature either.

A block that asked to be formatted and couldn't — an illustrative fragment
like `if (foo) {` with no closing brace — ships as authored and logs a
`[code-widths]` line naming the file. A burst of those warnings means the
language map or the fragment story needs work.

`/test/code/` is the specimen page for all of this, and its column is
resizable because the tiers are chosen by a container query. The code fences
in `src/pages/_test/code.mdx` are exempt from Prettier in `.prettierrc`: the
input formatting is the thing under test there, so it cannot also be
Prettier's own output.

## Test pages

Specimen pages for checking styles against the design live under
`src/pages/test/`, one directory per page, and are absent from the production
build rather than present and hidden.

They have a second audience: the visual regression suite screenshots them,
so several are also a baseline. See "Visual regression testing" below —
notably that a page's layout should be chosen for what the component needs,
since `SiteLayout` would render a second copy of a header or footer under
test.

| Command                           | `/test/*` |
| --------------------------------- | --------- |
| `pnpm dev`                        | included  |
| `pnpm build`                      | omitted   |
| `INCLUDE_TEST_PAGES=1 pnpm build` | included  |
| `pnpm check`                      | included  |
| `pnpm vrt`                        | included  |

`pnpm check` sets `INCLUDE_TEST_PAGES=1` for its build step deliberately.
A test page is sometimes the only consumer of a piece of `lib/`, and
`astro check` only type-checks what the build pulled in — so checking the
production build alone leaves that code unchecked and lets a type error
reach CI.

Each page gates itself by exporting the shared `getStaticPaths` from
`src/pages/_test/_test-pages.ts`:

```astro
---
import { testPagePaths } from '~/pages/_test/_test-pages';
export const getStaticPaths = testPagePaths;
---
```

That is why every test page is a dynamic route — `test/buttons/[...slug].astro`
rather than `test/buttons.astro`. Only a dynamic route runs `getStaticPaths`,
and returning no paths is what drops the page from the build; a static page
has no equivalent escape hatch. The rest parameter is load-bearing, not
decorative. `build.format: 'preserve'` renders the single `slug: undefined`
path at the bare `/test/buttons/`.

`INCLUDE_TEST_PAGES` is declared in `src/env.d.ts`, which `strictest` needs in
order to read it off `import.meta.env`.

**Write the page's markup in the `.astro` file.** That is the normal case, as
in `test/buttons/`: a component matrix is not authored content, so there is no
markdown an author would write that produces it.

**Use MDX only for what is actually authored as markdown** — currently just
prose. `test/prose/` imports `_test/prose.mdx` so the content goes through the
real pipeline, `satteri` included, and tests what an author's markdown
produces rather than hand-written HTML that could drift from it. MDX content
lives in `_test/`, which Astro leaves out of routing, so the file does not
become a route of its own.

Two MDX traps, both of which have already produced wrong output here:

- **Bare text on its own line inside a JSX block is still markdown**, so MDX
  wraps it in a `<p>`. In a blockquote footer that paragraph inherits the
  `blockquote p` rule and overrides the footer's own `body-xs`. Use the
  `Blockquote` component rather than hand-writing the footer.
- **Don't write an explicit `<p>` around multi-line slot content** — MDX adds
  its own, giving invalid nested `<p><p>`. Leave the text bare and let MDX
  make the paragraph.

Prettier also rewrites a block `{/* … */}` comment between markdown blocks
into `{/_ … _/}`, which breaks the build. Keep MDX comments on one line inside
JSX, or write the explanation as prose on the page.

## Visual regression testing

The specimen pages under `src/pages/test/` are rendered in real browsers
and compared against a stored baseline. `tests/visual/README.md` is the
guide; what follows is only what binds from outside that directory.

**It is local-only.** There is no bucket yet, so the baseline store is
`.vrt/store/`, gitignored — baselines don't travel between machines and
there is no CI job. Phases 3–7 of
`plans/visual-regression-testing-plan.md` are unbuilt, and the README's
"Not yet built" section says what that leaves.

**Everything runs in Docker**, so the pixels don't depend on whose machine
produced them. `pnpm vrt` builds the site, hydrates the baseline and runs
the matrix; `pnpm vrt:accept` promotes a run and rewrites the hash file,
leaving it unstaged for you to review.

**The browsers are deliberately not pinned.** All five are fetched at
image build time from the vendors' current releases, so `stable` tracks
what ships today and `prerelease` what is in beta today — a rendering
change in a browser release is a signal worth having, not noise to
engineer away. The cost is that a failure has two possible causes, so
every run prints the versions it drove and each baseline folder carries a
`versions.json`. Check those before assuming a diff is yours.

**There is one set of specimen pages, not two.** `src/pages/test/` is the
only home for pages that exist to be looked at — a page a human opens to
check a component against the design and a page a browser screenshots want
the same thing, so there is one copy. `tests/visual/targets.ts` is a list
of routes and how to shoot them, and holds no markup. A separate set of
VRT-only fixtures would drift from the specimens and would mean a state
added to one went unscreenshotted by the other.

The practical consequence when adding a specimen page: **it may be
screenshotted**, so pick its layout for what the component needs rather
than out of habit. `/test/header/` and `/test/footer/` use `MainLayout`,
because `SiteLayout` would render a second copy of the very thing they
exist to show.

Three things bind from outside `tests/visual/`:

- **There is no VRT Astro config and no VRT build.** `pnpm vrt` runs
  `INCLUDE_TEST_PAGES=1 astro build` — the same build `pnpm check` does —
  and screenshots `dist/`. So a screenshot is of the site as built, not of
  a VRT-only variant of it. Animation overrides, scrollbar suppression and
  an eager-images script were each tried and each removed once measured;
  the README's "What is not stabilised" records what they did and why they
  were wrong. Don't add one back without emptying it out first and showing
  the failure it prevents.
- **`.vrt/` is ignored by git, ESLint, Prettier and the dev server's
  watcher.** The last one matters in practice: a run writes thousands of
  trace artifacts, and without it `pnpm dev` logs a `[watch]` line for each.

**Screenshots are re-compressed with `sharp` before storage** — losslessly,
same pixels, about a fifth of the size. They stay PNG deliberately: a
smaller format like JPEG XL would save a little more, but Playwright picks
its image comparator from the file extension and implements only PNG and
JPEG, so anything else means decoding both sides by hand and giving up the
report's Diff and Slider views.

## Not yet built

Link destinations in the header and footer are inferred from labels, since
the design only specifies text. They need checking against what the team
actually intends.

The visual regression suite has no object store and no CI, so it only runs
locally — see the section above, and `tests/visual/README.md` for what
remains.

Only desktop frames (1440px) exist in Figma, so responsive behavior below
that is an interpretation rather than a spec. The code block's inline padding
holding at 1rem until 30rem is one such interpretation: the design's 2rem
either side is a fifth of the text area on a phone.

The syntax theme's coverage is bounded by the CSS grammar's property list,
which is an allowlist older than most of what this site writes about. An
unrecognized property still gets its color, but the value beside it stays
plain — `lib/markdown/code-theme.ts` explains why the theme cannot fix that
end of it. Widening it means a newer grammar upstream, not a change here.
