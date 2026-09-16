# webdevs.firefox.com

Astro static site for Firefox's web developer audience. Built from the
`Firefox_for_Developers` Figma file.

## Commands

| Command       | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `pnpm dev`    | Dev server                                            |
| `pnpm check`  | Prettier + `pnpm build` + ESLint (run before commits) |
| `pnpm build`  | Production build, then `astro check`                  |
| `pnpm format` | Write Prettier formatting                             |

The build runs before both `astro check` and ESLint, because it generates the
CSS Module declarations that their type-aware rules read — see
`lib/css-module-types.ts`. CI is ordered the same way.

pnpm is the package manager and the Node version is pinned in
`package.json`/`.npmrc` — use `corepack enable` rather than a global pnpm.
CI runs `pnpm run lint` and `pnpm run build` on every PR.

## Writing

**Use US spelling everywhere** — comments, doc comments, commit messages,
plans, markdown, identifiers and any text the site renders. So `color`,
`behavior`, `center`, `gray`, `optimize`, `defense`, not the `-our-`/`-re`/
`-ise` forms.

This is not a style preference so much as a consistency one: CSS and the DOM
are US-spelled (`color-scheme`, `background-color`, `currentColor`), and the
token names built from them are too, so a comment describing
`--color-border` in the `-our-` spelling makes the prose and the code it
documents disagree on the same page. Keeping one spelling means a search for
`color` finds the discussion as well as the declaration.

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

Media queries use `rem` too (`@media (width < 60rem)`), which makes
breakpoints respond to root font size.

The exception is the `width`/`height` attributes on Astro's `<Image>` and
imported SVG components: those are intrinsic asset dimensions, not CSS, and
stay unitless numbers. Control the rendered size in CSS.

### Design tokens

All color, spacing and type values live in `src/styles/tokens.css` as custom
properties. Token names mirror the Figma variable names exactly so the two
stay reconcilable — don't rename them, and don't hardcode a value that has a
token. The numbers in the spacing and type token names are Figma's pixel
values, while the values themselves are rem.

`--space-30` is the one spacing token with no Figma variable behind it, and
it is deliberate rather than a slip — don't inline it back into literals. It
earned a name because the editorial designs use 30 in about a dozen places
(between list items, inside the Note panel, around a blockquote, under the
hero headline), and a dozen copies of `1.875rem` each carrying a copy of the
same "not on the scale" comment is worse than one named value. That is the
bar for the next one too: a value gets a token when it recurs across
components, not merely because it is off-scale. A one-off still gets a
literal and a comment — the 50 of clear space above a prose section heading,
the 38 the blockquote's quote mark hangs by.

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

Get dark values from the dark Home panel (node `42:3623`) via
`get_variable_defs`. Never invent them. Where the design genuinely has no
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
  queries (`@media (width < 60rem)`), `color-mix()`, `text-wrap: balance`,
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

Two rules are worth stating here because they bind even when you never open
Figma: never invent a dark-mode value, and never snap a measured value to the
nearest token to make it look tokenised — Figma's spacing scale is
0/8/12/16/20/24/32/40/80, so the 50 above a prose section heading is
positional and gets a literal `3.125rem` with a comment. The one value named
without a Figma variable behind it is `--space-30`; see "Design tokens" above
for what it took to earn that.

## Not yet built

Link destinations in the header and footer are inferred from labels, since
the design only specifies text. They need checking against what the team
actually intends.

Only desktop frames (1440px) exist in Figma, so responsive behavior below
that is an interpretation rather than a spec.
