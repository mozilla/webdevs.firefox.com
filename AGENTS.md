# webdevs.firefox.com

Astro static site for Firefox's web developer audience. Built from the
"Firefox for Developers | Shared Design" Figma file.

## Commands

| Command       | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `pnpm dev`    | Dev server                                            |
| `pnpm check`  | Prettier + `pnpm build` + ESLint (run before commits) |
| `pnpm build`  | Production build, then `astro check`                  |
| `pnpm format` | Write Prettier formatting                             |

The build runs before both `astro check` and ESLint, because it generates the
CSS Module declarations that their type-aware rules read — see "Shared
components". CI is ordered the same way.

pnpm is the package manager and the Node version is pinned in
`package.json`/`.npmrc` — use `corepack enable` rather than a global pnpm.
CI runs `pnpm run lint` and `pnpm run build` on every PR.

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

All colour, spacing and type values live in `src/styles/tokens.css` as custom
properties. Token names mirror the Figma variable names exactly so the two
stay reconcilable — don't rename them, and don't hardcode a value that has a
token. The numbers in the spacing and type token names are Figma's pixel
values, while the values themselves are rem.

Colours that differ between light and dark use `light-dark()`, with
`color-scheme: light dark` set on `:root`. Tokens named `*-fixed` are
identical in both Figma modes and are plain values — the footer is
deliberately dark in both schemes because it uses `--color-black-fixed`.

Get dark values from the dark Home panel (node `42:3623`) via
`get_variable_defs`. Never invent them.

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
  overrides, so a component's responsive behaviour reads top to bottom in
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

A component used from both Astro and Preact is written as Preact, in `.tsx`.
Astro can render Preact, but not the reverse, so `Button.tsx` is importable
from either. Without a `client:*` directive it is rendered to HTML at build
time and ships no JavaScript — the Preact chunks Vite emits stay unreferenced
and the browser never fetches them. Keep it that way: these components hold
no state and take no event handlers.

Type the function as `FunctionComponent<Props>` rather than annotating the
return type:

```tsx
const Button: FunctionComponent<Props> = ({ size = 'medium', ...rest }) => { … };
export default Button;
```

`FunctionComponent` wraps props in `RenderableProps`, which supplies
`children`, `key` and `ref` — so `Props` should not declare `children`
itself. Name the class prop `class`, not `className`; Preact accepts both and
`class` reads naturally from Astro call sites.

Styles go in a sibling `*.module.css`, since `.tsx` has no scoped `<style>`.
Astro passes its `data-astro-cid-*` scope hash through to the component's root
element, so a parent's scoped rule (`.cta { grid-area: cta }`) still reaches
it — keep layout and placement in the parent, and the component's own
appearance in its module.

Import the module as a namespace, not as a default object:

```tsx
import * as styles from '~/components/Button.module.css';
```

This binds the named exports, so a bundler can drop the classes a module
doesn't use — which matters for any component that later ships to the client.
The `styles.` prefix is worth keeping over bare named imports: it makes clear
at each use site that the value is a class name rather than a local.

The generated declarations deliberately contain no default export, so there
is no object holding every class to import by accident.

Class names must be valid JS identifiers — camelCase, as in `sizeLarge`.
A kebab-case class gets no export at all; it is named in a comment at the top
of the generated file, and the fix is to rename it.

The `.d.ts` files beside each `*.module.css` are generated by
`lib/css-module-types.ts`, wired in as Vite's `css.modules.getJSON`. They are
gitignored build artifacts — never edit or commit them. Both `astro check`
and ESLint's type-aware rules only read declarations already on disk, so the
build has to run before either: check first and it falls back to Astro's
permissive `*.module.css` wildcard, passing without really checking anything,
while ESLint reports the import as an error-typed value.

## Working with Figma

Load the `figma-design-to-code` skill before calling `get_design_context`.

- File key: `GULnZuu07g7faYJ7wE1V4v`. The light Home page is node `42:1742`,
  the dark equivalent `42:3623`. Node `42:1079` is the whole "Final Pages"
  canvas and is too large to fetch in one call — target individual frames.
- Returned React/Tailwind is a _reference_. Translate it into Astro with
  tokens; never paste it, and never install Tailwind.
- The generated code uses absolute positioning. Rebuild layouts properly with
  grid rather than transcribing offsets, and expect small height differences
  from the Figma frame as a result.
- **A component's own node says nothing about where it sits on the page.**
  `get_design_context` on an instance returns it in isolation, so the margins
  around it are simply absent from the output — and absent reads as zero, not
  as unknown. Before styling a component's outer spacing, call `get_metadata`
  on the parent frame and derive the offsets from the child's `x`/`y`/`width`
  against the parent's width. On the 1440-wide Home frame the Header instance
  is at `x=16, y=20, width=1408`: a 16 page gutter and 20 above the header,
  neither of which appears anywhere in the Header node itself.
- The gutter belongs inside the page cap, not outside it. `.wrapper` is capped
  at `--page-max-width` (90rem) so `--gutter` is carved out of it, leaving
  `--content-max-width` (88rem). Capping at 88rem _and_ padding would inset
  the content twice.
- If a measured value has no token, that is a signal, not a rounding problem.
  The spacing scale is 0/8/12/16/24/32/40/80, so a 20 is positional — write
  the literal `1.25rem` with a comment. Never snap to the nearest token to
  make a value look tokenised.
- Download image and SVG assets into `src/assets/` and commit them. Figma's
  asset URLs expire after about 7 days.
- Icons and logos exported from Figma may have hardcoded fills. Swap them for
  `currentColor` so they follow the colour scheme — the Firefox wordmark
  shipped with the light-mode heading colour baked in.

## Not yet built

Link destinations in the header and footer are inferred from labels, since
the design only specifies text. They need checking against what the team
actually intends.

Only desktop frames (1440px) exist in Figma, so responsive behaviour below
that is an interpretation rather than a spec.
