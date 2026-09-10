# webdevs.firefox.com

Astro static site for Firefox's web developer audience. Built from the
"Firefox for Developers | Shared Design" Figma file.

## Commands

| Command       | Purpose                                                |
| ------------- | ------------------------------------------------------ |
| `pnpm dev`    | Dev server                                             |
| `pnpm check`  | Prettier + ESLint + `astro check` (run before commits) |
| `pnpm build`  | `astro check` then a production build                  |
| `pnpm format` | Write Prettier formatting                              |

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

### Other conventions

- Modern features are welcome and preferred: logical properties, range media
  queries (`@media (width < 60rem)`), `color-mix()`, `text-wrap: balance`,
  `100dvh`, `interpolate-size`.
- The reset lives in a `@layer reset` using `:where()`, so component styles
  win without specificity juggling.
- Astro `<style>` blocks are scoped by default — use them for component CSS
  and keep `global.css` for the reset and shared primitives like `.wrapper`.

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
