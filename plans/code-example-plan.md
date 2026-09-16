# Code example plan

## Brief

In articles, code examples will be in markdown & MDX files, in code fences, and
with syntax highlighting by Shiki.

I'd like the code to be easy to read on both desktop and mobile.

Ideally, the code would be formatted to a different width depending on the
width of the code example.

Could this be done by outputting the code multiple times, and applying prettier
at different widths, then selecting the appropriate version based on the
display context? Would this be possible with an astro build?

## Assessment

Yes, and it's a better idea than it first sounds. Both objections you'd expect
— build cost and page weight — measured far smaller than intuition suggests.

I built a throwaway spike against this repo to check it rather than reason
about it. Everything below marked **verified** was actually run and observed;
the spike has been removed and the working tree is back where it was.

### Verified

**The pipeline hook exists and is clean.** A markdown-processor plugin that
runs _before_ syntax highlighting can replace one code fence with a wrapper
element containing several code fences. Astro's own Shiki step then highlights
each one with the project's configured theme and transformers — we never
instantiate a highlighter or hand-roll highlighted HTML. Verified output:

```html
<div class="code-block">
  <div class="v v-base v-48"><pre class="astro-code github-dark" …>…</pre></div>
  <div class="v v-64 v-80"><pre class="astro-code github-dark" …>…</pre></div>
</div>
```

**One plugin covers `.md` and `.mdx`.** Verified against both; MDX expressions
in the surrounding document still evaluate normally.

**Page weight is a non-issue.** Three highlighted variants of a 12-line
snippet: 3,256 → 10,730 bytes raw, but **453 → 546 bytes brotli (1.21×)**.
The variants are near-identical text, so the compressor eats them. Gzip
was 1.24×.

**Build cost is a non-issue.** Prettier formats a snippet in ~2–4 ms; six
widths of a long JS sample took 22 ms total, CSS 13 ms, HTML 11 ms. At four
tiers, a 200-snippet site is a few seconds, before the dedupe short-circuit
below removes most of it.

**Deduplication does most of the work.** On the samples tried, six print
widths collapsed to: 5 distinct for a pathological one-liner JS sample,
3 for CSS, and **1 for HTML**. Blocks that don't reflow cost one extra
`format()` call and emit a single `<pre>`, exactly as today.

**Unformattable fragments fail safely.** `if (foo) {\n  // ...` throws in
Prettier; the spike caught it and emitted the author's text verbatim as a
single block.

**Container queries can do the selection with no JS.** Per CSS Containment
Level 3, font-relative units in a container query condition resolve against
the _query container's own_ computed values, and size features query the
container's **content box**. So `@container code (width >= 64ch)` on a
container that carries the code font means literally "64 code characters
fit in the text area", which is exactly the question Prettier's `printWidth`
answers.

### What the spike also turned up

**Shiki discards properties on the `<pre>`.** It replaces the whole element,
so tier metadata attached to the code node vanishes. Fix: wrap each variant in
its own `<div>` and put the tier classes there. Verified working. (The
alternatives — smuggling tiers through the fence `meta` string into a Shiki
transformer, or a post-highlight hast pass — are both more fragile.)

**Prettier's HTML printer barely responds to `printWidth`.** A 121-character
`<button>` with six attributes produced byte-identical output at
`printWidth: 24` and `printWidth: 80` — it breaks one-attribute-per-line and
stops there. HTML examples will therefore almost always dedupe to a single
variant. Not a bug for us (it costs nothing and degrades to today's
behavior), but don't promise responsive HTML samples.

**Below ~40ch, Prettier output becomes unreadable.** At `printWidth: 24` the
sample degraded to one identifier per line:

```js
const observer =
  new IntersectionObserver(
    (
      entries,
      observer,
    ) => {
```

That's worse than horizontal scrolling. The narrow end of the ladder should
floor around 36–40ch and let genuinely narrow viewports scroll.

**Blocking prerequisite: this project has no markdown processor installed.**
Astro 7.3 made Sätteri (`@astrojs/markdown-satteri`) the default processor;
it ships as a dependency of `astro` but is not resolvable from the project
root, so `astro.config.ts` cannot import it. `@astrojs/markdown-remark` (the
remark/rehype processor) is now an _optional peer_ and is not installed —
the copy present in the tree is 7.2.4, which is too old for `@astrojs/mdx@8`
and would break MDX rendering. Either route needs an explicit install.

### Recommendation

Build it. Use Sätteri's `mdastPlugins` rather than remark, use CSS container
queries rather than JS for selection, and lean hard on deduplication.

### Why not the simpler options

| Option                         | Why not                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Horizontal scroll (status quo) | Scrolling a code block on a phone is genuinely bad, and it's the thing this site is meant to be good at |
| Format once at ~60ch           | Wastes desktop measure and still overflows on a phone                                                   |
| `white-space: pre-wrap`        | Wraps mid-expression at arbitrary points; no indentation continuation; actively misleading for code     |
| JS measure-and-swap            | Needs JS, flashes the wrong variant, and buys nothing over container queries                            |

## Implementation plan

### Phase 0 — Processor prerequisite

1. `pnpm add -D @astrojs/markdown-satteri satteri`.
2. In `astro.config.ts`, set `markdown.processor: satteri({ mdastPlugins: [...] })`.
   Astro's config schema takes the processor object directly; `markdown.remarkPlugins`
   / `rehypePlugins` are deprecated in 7.3 and belong to the other processor.
3. Confirm `pnpm build` still renders a `.md` and an `.mdx` page.

> **Fallback route.** If Sätteri (0.x, native NAPI module) proves unstable, the
> same design ports to `@astrojs/markdown-remark@^7.3` with
> `markdown.processor: unified({ remarkPlugins: [...] })`. Its pipeline order is
> user remark plugins → `remark-rehype` → `rehypeShiki`, and its
> `highlightCodeBlocks` matches _any_ `pre > code` anywhere in the tree, so a
> wrapper containing several fences highlights identically. The mdast node would
> carry `data.hName` / `data.hProperties` / `data.hChildren` instead of using
> `ctx.replaceNode`. Keep the formatting logic in a processor-agnostic module so
> only the plugin shell changes.

### Phase 1 — The formatter module

`src/lib/code-widths/format.ts` — pure, no Astro or Sätteri imports, unit-testable.

```ts
export interface Variant {
  code: string;
  tiers: number[]; // print widths that produce this exact output
}

export async function formatVariants(
  source: string,
  lang: string,
  opts: { tiers: number[] },
): Promise<Variant[] | null>; // null = leave the author's code alone
```

Behavior:

- **Language gate.** Map only languages with a dependable Prettier parser:
  `js`/`jsx`/`mjs` → `babel`, `ts`/`tsx` → `typescript`, `css`/`scss`/`less`,
  `html`/`svg`, `json`/`jsonc`, `yaml`, `md`/`mdx`, `graphql`. Anything else
  (`bash`, `http`, `diff`, `plaintext`, `output`, …) returns `null`
  immediately. Keep this map explicit — do not fall through to a guess.
- **Widest-first short-circuit.** Format at the widest tier. If its longest
  line is ≤ the narrowest tier, every tier produces the same output: return one
  variant and skip the remaining `format()` calls. This is the common case and
  it's what keeps the build cheap.
- **Otherwise**, format at each remaining tier ascending, keyed into a `Map`
  by output string so identical results merge into one variant with several
  tiers. Preserve ascending tier order in the returned array.
- **Errors are non-fatal.** Wrap each `format()` in `try`/`catch`; on any
  throw, return `null`. Never let a malformed snippet fail a build.
- **Fixed Prettier options**, not `resolveConfig()`. Article code samples should
  have a stable house style independent of this repo's own lint config, and
  resolving config per file would add I/O per snippet. Start with
  `{ singleQuote: true, semi: true, trailingComma: 'all' }` to match the repo's
  `.prettierrc`. Reconsider `trailingComma` if it reads noisily at narrow tiers.
- **Trim the trailing newline** Prettier adds, so the `<pre>` doesn't gain a
  blank last line.

The tier ladder lives in one exported constant:

```ts
export const TIERS = [40, 56, 68, 80]; // characters; TIERS[0] is the base
```

Derivation, to re-check once real article pages exist: measure the code block's
content-box width at the narrowest supported viewport and at full desktop
measure, divide by the mono font's advance width, and pick ~4 evenly spaced
tiers spanning that range. 40 is the readability floor established above.

### Phase 2 — The processor plugin

`src/lib/code-widths/plugin.ts`:

```ts
export const codeWidths = defineMdastPlugin({
  name: 'code-widths',
  async code(node, ctx) {
    const { directive, lang } = parseMeta(node.lang, node.meta);
    if (directive === 'skip') return;

    const variants = await formatVariants(node.value, lang, { tiers: TIERS });
    if (!variants) {
      ctx.report({
        message: `Could not format ${lang} code block with Prettier; left as authored`,
        node,
        severity: 'warning',
      });
      return;
    }

    if (variants.length === 1) {
      ctx.setProperty(node, 'value', variants[0].code); // reformat in place
      return;
    }

    ctx.replaceNode(node, {
      type: 'codeWidths',
      data: { hName: 'div', hProperties: { class: 'code-block' } },
      children: variants.map((v, i) => ({
        type: 'codeVariant',
        data: {
          hName: 'div',
          hProperties: {
            class: [
              'v',
              i === 0 ? 'v-base' : `v-${v.tiers[0]}`,
              ...v.tiers.slice(1).map((t) => `v-${t}`),
            ].join(' '),
          },
        },
        children: [
          { type: 'code', lang: node.lang, meta: node.meta, value: v.code },
        ],
      })),
    });
  },
});
```

Notes:

- Sätteri mdast visitors are plain functions keyed by node type
  (`code(node, ctx)`), **not** the `{ filter, visit }` shape the _hast_ visitors
  use. Async visitors are supported and awaited.
- `ctx.report({ severity: 'warning' })` surfaces unformattable snippets in the
  build log with position info, so authors find out rather than silently
  shipping an unformatted block.
- `ctx.sourceFormat` is `'markdown'` or `'mdx'` if the two ever need to diverge.
  They currently don't.

**Authoring escape hatches**, parsed from the fence meta string:

- ` ```js no-format ` — emit exactly what the author wrote, one variant.
- ` ```js width=80 ` — one variant at a fixed width, for cases where a specific
  line layout is the point of the example.
- Prettier's own `// prettier-ignore` works inside a block for free.

Strip recognized directives from `meta` before passing it on, so Shiki
transformers don't see them.

### Phase 3 — The CSS

In `src/styles/global.css` (this is shared primitive territory, not a scoped
component style — the markup is generated by the markdown pipeline, so an
Astro `<style>` block's scoping hash would never be applied to it).

```css
.code-block {
  container: code / inline-size;

  /* `ch` in the container query resolves against *this* element's font, so the
     code font must be set here, not only on the `pre`. */
  font-family: var(--font-mono);
  font-size: var(--text-code);
  line-height: var(--leading-code);

  /* Size features query the content box, so this padding is excluded from the
     query — `64ch` therefore means "64 characters fit in the text area". */
  padding: var(--space-16) var(--space-20);
  background-color: var(--color-code-background);
  border-radius: var(--radius-8);
}

/* Hide and show must have equal specificity so source order decides, letting
   the highest matching tier win. Hence the shared `.v` class rather than a
   universal selector. */
.code-block > .v {
  display: none;
}
.code-block > .v-base {
  display: block;
}

@container code (width >= 56ch) {
  .code-block > .v {
    display: none;
  }
  .code-block > .v-56 {
    display: block;
  }
}
@container code (width >= 68ch) {
  .code-block > .v {
    display: none;
  }
  .code-block > .v-68 {
    display: block;
  }
}
@container code (width >= 80ch) {
  .code-block > .v {
    display: none;
  }
  .code-block > .v-80 {
    display: block;
  }
}

/* Neutralise Shiki's inline background and padding; the wrapper owns them. */
.code-block :where(pre) {
  margin: 0;
  padding: 0;
  background-color: transparent !important;
  overflow-x: auto; /* a line that can't be broken still scrolls */
}

@media print {
  /* Always print the widest variant. */
  .code-block > .v {
    display: none;
  }
  .code-block > .v:last-child {
    display: block;
  }
}
```

Generate the `@container` blocks from `TIERS` rather than hand-writing them, so
the ladder is defined once. Either a small build step, or accept the
duplication and add a comment pointing at `TIERS` — four tiers is not worth a
generator.

**Use a system mono stack for `--font-mono`**
(`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`), not a webfont.
A webfont would mean the container query evaluates against fallback metrics
until the font loads and then re-evaluates, visibly swapping variants mid-load.
A system stack is also zero bytes. `ch` differing per platform is correct
behavior here, not a problem — it measures the font the reader actually sees.

Per the project's CSS conventions: no pixel values, `ch` and `rem` only, and
the container query threshold in `ch` is deliberate rather than a length.

### Phase 4 — Copy button (if wanted)

Read `textContent` from the block's **last** child (the widest variant) rather
than the visible one — that's what someone pasting into an editor wants, and it
needs no extra payload. Hidden variants are `display: none`, so they're out of
the accessibility tree and out of tab order already; no `aria-hidden` needed.

### Phase 5 — Verification

1. **Unit tests** for `formatVariants`: dedupe behavior, the widest-first
   short-circuit, the language gate, and the `null` return on a syntax error.
2. **A fixture page** (`src/pages/_dev/code-widths.astro`, excluded from the
   build) rendering a matrix of languages × snippet lengths inside a
   resizable container, so the ladder can be eyeballed at every breakpoint.
3. **Check the build log** for `code-widths` warnings on real articles — a
   burst of them means the language map or the fragment story needs work.
4. **Measure a real article page** before/after, brotli'd, to confirm the 1.2×
   figure holds at page scale.

## Open questions

- **Tier values.** `[40, 56, 68, 80]` is a starting guess. It should be
  re-derived from the actual article measure and code font size once an article
  template exists — see the derivation note in Phase 1.
- **Should fragments be supported at all?** Right now an unparseable snippet
  silently keeps the author's formatting. The alternative is to require every
  fence to be valid, and fail the build otherwise — stricter, better output,
  more friction for authors writing illustrative fragments. Worth deciding
  before writing many articles, because it's hard to retrofit.
- **`trailingComma`.** `'all'` matches the repo config but adds a character to
  every broken argument list, which bites hardest at the narrow tiers where
  space is scarcest.
