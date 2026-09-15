# Copy Firefox release notes from MDN

## Goal

Copy Firefox's developer release notes out of [mdn/content][content] and into
this repo as MDX, so they can be published under
`webdevs.firefox.com/release-notes/`.

Source: `files/en-us/mozilla/firefox/releases` in [mdn/content][content].

A Node script, callable from `pnpm run`, does a shallow checkout of those
files and converts them. It is re-runnable and overwrites its previous output
— the human check is the git diff. It errors on any syntax it does not
recognise, rather than passing it through or guessing.

Page design is out of scope, with one exception: this plan builds a `Note`
component, because the source needs one and the converter has to know what to
emit. There is a design for this in Figma, but for now just output `TODO Note: (the content)`.

[content]: https://github.com/mdn/content

## Decisions

| Question         | Decision                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| Scope            | Firefox 60+ (2018 onward), top-level pages only                                |
| Release date     | `@mdn/browser-compat-data`                                                     |
| Output format    | MDX in a content collection, not pages                                         |
| URL              | `/release-notes/[year]/[version]/`, year validated by `getStaticPaths`         |
| Bare version URL | `/release-notes/[version]/` 301s to the dated URL via Netlify `_redirects`     |
| Macro output     | Plain markdown — backticks for code, `[text](url)` for links                   |
| Definition lists | Enable Sätteri's `definitionList` feature; convert MDN's syntax to pandoc form |
| GitHub alerts    | A `Note` Astro component, built here                                           |
| HTML comments    | Converted to `{/* … */}`, not stripped                                         |
| Link targets     | Resolve through MDN's `_redirects.txt`                                         |

Licensing is settled: MDN prose is CC-BY-SA 2.5 and this repo is MPL 2.0, but
the site is Mozilla's own and the import is sanctioned.

## Scope: Firefox 60+

99 of the 160 versions. This drops a great deal of complexity, all of it
verified rather than assumed:

- **All 33 nested sub-pages disappear.** Every one belongs to Firefox 1.5–10
  (`3.5/updating_extensions/`, `4/the_add-on_bar/`, …) and covers XUL, add-ons
  and plug-ins. They don't fit the `[version]/` shape.
- **The only image in the tree disappears** with them
  (`3.5/icc_color_correction_in_firefox/iccsample.jpg`), so no asset pipeline
  is needed.
- **`{{Deprecated_Inline}}` and `{{ListSubpages}}` disappear entirely.** Both
  only occurred below 60 — the former in an add-on sub-page, the latter in the
  root landing page, which is out of scope too.
- **Definition lists collapse from ~290 uses to 2**, both in
  [`121/index.md`][121].
- The root `releases/index.md` is excluded. Its body is just `{{ListSubpages}}`,
  and it has no version and no date, so it has no home in the output shape.

Older versions get linked out to MDN rather than copied. The script is
re-runnable, so the floor can be lowered later.

[121]: https://github.com/mdn/content/blob/main/files/en-us/mozilla/firefox/releases/121/index.md

## Release dates come from BCD

The URL needs `[year]`, and the frontmatter has no date — only prose, in
inconsistent forms:

- `Firefox 145 was released on [November 11, 2025](…)`
- `Firefox 100 was released on May 3, 2022.`
- `Firefox 30 was released on [June 10th, 2014](…)`
- `Firefox 10 shipped on January 31, 2012.`
- `Firefox 20 was released on April, 2nd 2013.` (comma misplaced)
- `Firefox 4, which shipped on March 22, 2011, enhances performance…`

**Versions 23 and 25 contain no date at all**, so prose parsing cannot be made
to work for every file.

`@mdn/browser-compat-data` settles it. Its `browsers.firefox.releases` map has
a `release_date` for **all 160 versions** — verified, no gaps, no versions
missing. It is a normal npm dependency and needs no checkout. The full ISO
date goes into frontmatter; the year is derived from it at build time rather
than stored twice.

Distribution across the in-scope years:

```text
2018: 7   2019: 7   2020: 13  2021: 11  2022: 13
2023: 13  2024: 12  2025: 13  2026: 12
```

## Routing: a content collection with the year in the URL

Yes, this is standard Astro, and it is the normal reason to reach for a
content collection: **collection entries are not routes**, so where a file
lives and what URL it gets are completely decoupled. Storing posts flat and
building dated URLs from frontmatter is the same pattern most Astro blogs use.

Entries live at `src/content/release-notes/[version]/index.mdx`, declared in
`src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const releaseNotes = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/content/release-notes',
  }),
  schema: z.object({
    version: z.string(),
    releaseDate: z.date(),
  }),
});

export const collections = { releaseNotes };
```

A single route, `src/pages/release-notes/[year]/[version]/index.astro`,
enumerates them:

```astro
export const getStaticPaths = (async () => {
  const notes = await getCollection('releaseNotes');
  return notes.map((note) => ({
    params: {
      year: String(note.data.releaseDate.getUTCFullYear()),
      version: note.data.version,
    },
    props: { note },
  }));
}) satisfies GetStaticPaths;
```

**The 404 is free.** `getStaticPaths` emits exactly one path per entry, so a
wrong year is simply not a page that exists — no validation code, no
redirect table, no way for the two to drift. Prototyped against this repo
(Astro 7.3.2, `build.format: 'preserve'`) with versions 145 and 121:

```text
dist/release-notes/2025/145/index.html
dist/release-notes/2023/121/index.html

$ ls dist/release-notes/2024/145
No such file or directory
```

Nothing in `src/pages` holds content. `src/pages` is the one directory where
file location and URL are coupled — every file in it becomes a route — so
collection entries must live outside it. `src/content/` is the convention;
since Astro 5 the directory isn't magic, the `glob` loader's `base` is what
makes it a collection, but there's no reason to deviate. Verified: the
prototype had four source files under `src/content` and built three routes.

### Redirecting the bare `/release-notes/[version]/`

Since the site deploys to Netlify, use the Astro **`redirects` config** with
`@astrojs/netlify`, and get real HTTP 301s. Three approaches were built and
compared:

| Approach                       | Emits                               | Result                    |
| ------------------------------ | ----------------------------------- | ------------------------- |
| `redirects` config, no adapter | `dist/release-notes/145.html`       | Meta refresh, wrong URL ✗ |
| `[version]/index.astro` route  | `dist/release-notes/145/index.html` | Meta refresh, right URL ~ |
| `redirects` config + Netlify   | `dist/_redirects`                   | Real 301 ✓                |

Without an adapter, a config redirect has no authored file whose shape
`build.format: 'preserve'` can preserve, so Astro falls back to flat-file
format and the bare `/release-notes/145/` still 404s — the redirect lands on
a URL nobody will type. A route file fixes the shape but is still a
`<meta http-equiv="refresh">` page rather than an HTTP redirect.

`@astrojs/netlify` removes the problem rather than working around it. It sets
`build.redirects: false`, so Astro emits **no HTML at all** for redirects, and
on `astro:build:done` it writes every `type: 'redirect'` route into
`dist/_redirects`. Netlify serves those as real 301s. Verified — this is the
actual emitted file:

```text
/release-notes/145/    /release-notes/2025/145/    301
/release-notes/145     /release-notes/2025/145/    301
/release-notes/121/    /release-notes/2023/121/    301
/release-notes/121     /release-notes/2023/121/    301
```

Note it emits **both** trailing-slash variants automatically, which is what
made the `preserve` filename problem disappear. The build log confirms no page
is written (`file not created, response body was empty`), and nothing in
`dist` contains `http-equiv` afterwards.

This works in plain static output — the adapter declares
`staticOutput: "stable"` and no SSR function is generated. Adding it is the
only deployment change needed.

**This reverses the route-based approach.** With the adapter, a route calling
`Astro.redirect()` is still `type: 'page'`, and `writeRedirects` only collects
`type: 'redirect'` — so a route would keep emitting a meta-refresh page and
never reach `_redirects`. The config is the thing the adapter understands.

Building the 99-entry map: `astro.config.ts` can't call `getCollection`, so it
reads the frontmatter dates off disk. That keeps one source of truth — a
hand-corrected date in an MDX file moves its canonical URL and its redirect
together. Deriving the year from BCD a second time in the config would work
too, but the two could then disagree and nothing would catch it.

Two install side effects to expect, both harmless but surprising in a diff:
`@astrojs/netlify` appends `.netlify` to `.gitignore`, and pnpm asks for a
build approval for `sharp` in `pnpm-workspace.yaml`.

### Future `/release-notes/[year]/` index pages

A future `src/pages/release-notes/[year]/index.astro` coexists with everything
above — verified rather than assumed, since a year index and a version
redirect are the same route shape. Astro built them together without a
warning, and with the adapter the version redirect is a `_redirects` line
rather than a route at all, so there is even less to collide:

```text
/release-notes/145  →  301                ← version redirect
dist/release-notes/2025/index.html        ← year index
dist/release-notes/2025/145/index.html    ← the note itself
```

The year index enumerates concrete paths through `getStaticPaths`, so it only
collides with a version number if one ever equals a year — at ~13 releases a
year from 158, that's around 2170.

The 404 itself is whatever the host serves until there's a
`src/pages/404.astro`.

## The macros

13 distinct macros in scope, and nothing else — a closed list, which is what
makes the plan's error-on-unknown rule enforceable. Counts are
case-normalised, because KumaScript matches names case-insensitively and the
source is inconsistent (`domxref`, `DOMxRef`, `Domxref`, `DOMxref` all appear):

```text
domxref 1013   cssxref 477   webextapiref 289   jsxref 214
htmlelement 106   httpheader 59   glossary 32   svgelement 23
svgattr 9   mathmlelement 6   httpmethod 2   csp 2   rfc 1
```

No macro spans multiple lines and none is unclosed, so a line-wise regex is
sufficient.

**Output is plain markdown**, never HTML: ``[`Atomics.waitAsync()`](url)``,
not `<a href="url"><code>…</code></a>`. The macros' `.ejs` sources emit HTML
because KumaScript runs before the markdown parser; we are generating source
files that a human will read in a diff, so the markdown equivalent is what
goes in. The trailing optional argument on `domxref` / `jsxref` /
`htmlelement` suppresses code formatting, so it selects `[text](url)` over
``[`text`](url)`` — it changes output and cannot be ignored.

### The implementations live in mdn/yari, not mdn/content

The macros are EJS templates in
[`mdn/yari/kumascript/macros/*.ejs`][macros] — a different repo from the
content. Porting them is straightforward, but two things don't carry over:

- `web.smartLink()` (used by `HTMLElement`, `SVGElement`, `Glossary`,
  `WebExtAPIRef`) resolves the target against the full content repo, fixing up
  redirects and flagging links to pages that don't exist. We check out one
  directory, so we cannot call it.
- The URLs the macros build are frequently **legacy paths that redirect**.
  `HTMLElement.ejs` emits `/Web/HTML/Element/a`, whereas current MDN serves
  `/Web/HTML/Reference/Elements/a` — which is what the prose links in these
  same files already use. Left alone, converted pages would link
  inconsistently with themselves and take a redirect hop on every macro link.

  `mdn/content` ships `files/en-us/_redirects.txt`: a plain tab-separated
  `from<TAB>to` table, 17,577 lines, 1.7 MB. Add it to the sparse checkout and
  resolve every generated URL through it. Cheap, offline, and it's MDN's own
  data.

[macros]: https://github.com/mdn/yari/tree/main/kumascript/macros

### Relative links

2,576 links across the full tree point at `/en-US/docs/…`; 69 point at other
release-note pages. In-scope links to other release notes become local
`/release-notes/[year]/[version]/` paths where the target is also in scope,
and absolute MDN URLs where it isn't. Everything else becomes an absolute
`https://developer.mozilla.org/en-US/docs/…` URL.

## MDX

`.mdx`, not `.md`, so the alerts can become a real component. Verified against
this repo's actual toolchain (Astro 7.3.2, `@astrojs/markdown-satteri` 0.4.1,
Sätteri 0.10.5).

### Sätteri configuration

Astro already uses Sätteri as its default Markdown processor. Enabling
definition lists means installing `@astrojs/markdown-satteri` as a direct
dependency — it is currently only a transitive one — and configuring the
processor:

```ts
import { satteri } from '@astrojs/markdown-satteri';

export default defineConfig({
  markdown: {
    processor: satteri({ features: { definitionList: true } }),
  },
});
```

`@astrojs/mdx` inherits `markdown.processor` through `extendMarkdownConfig`
(on by default), so this applies to `.mdx` as well as `.md`.

### Definition lists

Sätteri's `definitionList` flag implements **pandoc syntax**, not MDN's. Tested
both:

```text
MDN's form                          Sätteri, flag on or off
- Term                          →   <ul><li>Term<ul><li>: Definition</li></ul></li></ul>
  - : Definition

Pandoc form                         Sätteri, flag on
Term                            →   <dl><dt>Term</dt><dd>Definition</dd></dl>
: Definition
```

So the converter rewrites MDN's `- Term` / `  - : Definition` pairs into the
pandoc form. Confirmed through a real build: the prototype rendered
`<dl><dt>…</dt><dd>…</dd></dl>` with the flag on, and a nested `<ul>` with a
literal leading colon with it off.

Scanned the in-scope files for lines already starting `: ` that would newly be
captured as definitions — **none**, so turning the flag on can't change how
any existing content parses.

### The `Note` component

Sätteri has no built-in support for GitHub alerts: with `gfm: true` it emits a
plain blockquote containing the literal text `[!NOTE]`. Verified, including
against the plausible-sounding `alerts`, `callouts` and `admonitions` feature
names, none of which exist.

15 alerts at 60+, one per file, all `[!NOTE]`, in two flavours:

- **An aside** (75, 82–93) — _"See also [Lots to see in Firefox 93](…) on
  Mozilla Hacks."_
- **A status warning** (157, 158) — _"The release notes for this Firefox
  version are still a work in progress."_

Build `src/components/Note/index.astro` and have the converter emit:

```mdx
<Note>
  See also [Lots to see in Firefox 93](https://hacks.mozilla.org/…) on Mozilla
  Hacks.
</Note>
```

Each file gets the corresponding `import` line at the top. Astro has no
automatic MDX component provider, and since the script generates these files
an explicit import per file costs nothing and keeps them self-contained.

Since only `[!NOTE]` occurs, `Note` needs no variant prop. If a `[!WARNING]`
ever appears upstream the converter should error rather than silently
downgrade it — the two `[!WARNING]`s in the tree are both below 60.

### MDX hazards, checked

Scanned every in-scope file for characters MDX treats specially, outside code
fences and inline code:

| Construct                  | Count              | Verdict                                  |
| -------------------------- | ------------------ | ---------------------------------------- |
| `<!-- … -->`               | 60 (157, 158 only) | **Breaks MDX.** Convert to `{/* … */}`   |
| `<code>`, `<kbd>`, `<sup>` | 21                 | Fine — lowercase intrinsic elements      |
| `\<link>`, `\<position>`   | 3                  | Fine — already backslash-escaped         |
| `{ focused: true }`        | 1 (149)            | Fine, but only because it's code-wrapped |

MDX's error on a raw HTML comment names the fix itself:

```text
Unexpected character `!` (U+0021) before name … (note: to create a comment in
MDX, use `{/* text */}`)
```

The comments are MDN authoring scaffolding on the two in-progress releases —
`<!-- ### HTML -->`, `<!-- Authors: Please uncomment any headings you are
writing notes for -->`. Converting rather than stripping keeps the files
faithful to MDN and keeps re-run diffs meaningful when an author uncomments a
heading upstream. They produce no output either way; the prototype confirmed
`{/* … */}` compiles and emits nothing.

The `{ focused: true }` case is worth noting because it is load-bearing: it
sits inside a `{{WebExtAPIRef}}` argument, and it only survives because that
macro code-wraps its output by default. A macro emitting bare link text with a
brace in it would break the build.

## Verified constraints in this repo

- **Prettier is already happy.** Raw MDN markdown passes `prettier --check`
  unmodified — MDN runs Prettier too, with compatible settings.
- **ESLint stops being a problem.** `markdown/no-missing-label-refs` errors on
  `> [!NOTE]`, but `eslint.config.js` scopes `@eslint/markdown` to `**/*.md`,
  and the alerts become components anyway. No override needed.

## Implementation

### 1. Fetch

`git init` into a temp dir, sparse-checkout `--no-cone` with
`files/en-us/mozilla/firefox/releases` and `files/en-us/_redirects.txt`, then
`git fetch --depth 1 origin main`. About 60 MB of git objects, a few seconds.
Cache the temp dir between runs behind a `--fresh` flag.

Record the fetched commit SHA in the output, so a re-run's diff shows what
changed upstream.

### 2. Parse

Split frontmatter from body. Drop MDN's `slug`, `page-type` and `sidebar`
keys. Look the version up in BCD for the release date. Skip anything below 60
and anything nested.

Emit frontmatter matching the collection schema: `version`, `releaseDate`,
plus `title` and `shortTitle` carried over from MDN.

### 3. Convert

Walk the body line by line, tracking fenced-code state so nothing inside a
fence is touched. No macros currently sit inside fences, but the guard is free
and keeps future re-runs honest.

- **Macros.** Lowercase the name, look it up in the table of 13. **Any unknown
  name is a hard error naming file, line and macro.** Build the URL following
  the corresponding `.ejs`, with a comment in our source citing which macro
  file it was ported from. Resolve through `_redirects.txt`. Emit
  ``[`code`](url)``, or `[text](url)` where the suppress-code argument is set.
- **One known exception:** [`52/index.md`][52] has macros inside inline code
  (`` `{{cssxref("justify-content")}}: space-evenly` ``). Out of scope at 60+,
  but if the floor ever drops, note that MDN itself renders raw HTML there —
  it's an upstream bug. Strip the macro to its plain text and keep the
  backticks.
- **Links.** Rewrite `/en-US/docs/…` to absolute MDN URLs, except in-scope
  release notes, which become local paths.
- **Definition lists.** MDN form → pandoc form.
- **Alerts.** `> [!NOTE]` → `<Note>`, plus the import. Error on any other
  alert type.
- **HTML comments.** `<!-- x -->` → `{/* x */}`.

### 4. Write

Write `src/content/release-notes/[version]/index.mdx` — the collection, not
`src/pages`. Delete the collection directory first, so pages removed upstream
don't linger.

The hand-written parts alongside it: `src/content.config.ts`,
`src/pages/release-notes/[year]/[version]/index.astro`,
`src/components/Note/index.astro`, and the `redirects` map in
`astro.config.ts`. The bare-version redirect needs no route file.

### 5. Verify

The script runs Prettier over what it wrote, so the diff is never formatting
noise. Then `pnpm run check` has to pass — the Astro build is the real test
that every one of the 99 files is valid MDX, which is exactly the failure mode
this format change introduces.

[52]: https://github.com/mdn/content/blob/main/files/en-us/mozilla/firefox/releases/52/index.md
