# Visual regression testing

The specimen pages under `src/pages/test/` are rendered in real browsers,
screenshots are compared against a stored baseline, and differences are
accepted with an explicit action that updates the baseline.

There are no fixture pages of their own. A page a human opens to check a
component against the design and a page a browser screenshots want the same
thing — the component, in states the live site does not reach, with nothing
else around it — so there is one copy, and it lives with the other specimen
pages. `targets.ts` is a list of routes and how to shoot them.

**This is local-only for now.** There is no bucket yet, so the "object
store" is `.vrt/store/`, which is gitignored — baselines do not travel
between machines and there is no CI job. See [Not yet built](#not-yet-built).

One consequence to expect: `baseline.txt` is committed but the folder it
names is not, so a fresh checkout resolves it to nothing. The first
`pnpm vrt` there reports every shot as missing and the first
`pnpm vrt:accept` writes a _different_ hash, because the machine's own
rendering is what gets recorded. That is the honest behavior while the
store is a directory on one laptop; it stops being true the moment the
bucket exists, which is the point of committing the hash now.

## Commands

| Command                      | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `pnpm vrt`                   | Build, run the stable browsers, compare |
| `pnpm vrt:accept`            | Promote the last run to the baseline    |
| `pnpm vrt:report`            | Open the Playwright HTML report         |
| `pnpm vrt:shell`             | Shell into the container, for debugging |
| `pnpm vrt:build`             | Just the build, outside Docker          |
| `pnpm vrt:prerelease`        | The same, on the beta channels          |
| `pnpm vrt:accept:prerelease` | Promote the last pre-release run        |

The first run on a clean checkout has no baseline, so every shot is
reported as missing. That is the right answer — there is nothing to compare
against — and `pnpm vrt:accept` records one.

## What a run does

1. `INCLUDE_TEST_PAGES=1 astro build` → `dist/`. The ordinary build with
   the flag that includes the specimen pages; there is no VRT-specific
   Astro config, so what is screenshotted is what ships
2. Read `baseline.txt`, list that folder in the store, and hydrate
   `.vrt/<tier>/baseline/` — copying from the content-keyed blob cache
   anything already on disk
3. Serve `dist/` and drive the browser matrix over it
4. Compare with Playwright's own image comparator, which produces the
   pass/fail and the diff images the report shows

Everything runs in the container, so the pixels do not depend on whose
machine produced them.

## The browser matrix

Five configurations in two tiers, and **none of them is pinned**. Every
browser is fetched at image build time from its vendor's current release,
so `stable` means what the vendors ship today and `prerelease` means what
is in beta today.

| Id             | What it is                   | Tier                  |
| -------------- | ---------------------------- | --------------------- |
| `firefox`      | Mozilla Firefox stable, BiDi | stable, blocking      |
| `chrome`       | Google Chrome stable         | stable, blocking      |
| `webkit`       | Playwright's bundled WebKit  | stable, blocking      |
| `firefox-beta` | Mozilla Firefox Beta, BiDi   | pre-release, advisory |
| `chrome-beta`  | Google Chrome Beta           | pre-release, advisory |

Not pinning is the intent, not a shortcoming. A browser release that
changes rendering _should_ show up here — for a Mozilla property,
"Firefox 157 renders this differently" is among the most valuable things
the suite can produce, and pinning to keep the check quiet would discard
exactly that. What the tiers separate is blocking from advisory, not
pinned from floating: a stable diff should stop a merge until someone has
looked, while beta churn should start a conversation without blocking.

The consequence to plan for: **a failure now has two possible causes** —
your change, or a browser release. So every run prints the versions it
drove, and `pnpm vrt:accept` writes them to `versions.json` inside the
baseline folder. When a diff appears, compare the two.

```text
[vrt] stable browsers:
         firefox       156.0
         chrome        153.0.8010.52
         webkit        26.6
```

Rebuild the image to pick up newer browsers — `docker rmi
webdevs-firefox-vrt:local` and let the next run rebuild it.

Two things worth knowing:

- **`firefox` is the real Mozilla release, not Playwright's bundled
  build.** The bundled one is frozen to the `@playwright/test` version in
  `package.json` — it was 155 while Firefox stable was already 156 — so it
  answers "what did Firefox do when this Playwright shipped". The matrix
  uses `moz-firefox`, which drives the real installed browser over
  WebDriver BiDi. The same reasoning rules out Playwright's bundled
  Chromium, which runs _ahead_ of stable Chrome.
- **WebKit is the exception, and is still Playwright-pinned.** Apple ships
  no Linux build to track and there is no beta channel, so `webkit` moves
  only when Playwright does, and there is no `webkit-beta` at all. It is
  also a GTK MiniBrowser build with a Linux font stack: it catches WebKit
  engine layout regressions, but it does not tell you what a Mac or iOS
  user sees.

## Adding a target

1. If the page does not exist, add it under `src/pages/test/<id>/` as a
   dynamic route exporting `testPagePaths` — `src/pages/_test/_test-pages.ts`
   says why they are all dynamic routes. Pick the layout the component
   needs: `MainLayout` where the site chrome would get in the way, as
   `/test/header/` and `/test/footer/` do, or a real layout where the
   layout is itself under test, as `/test/prose/` does.
2. Add it to the list in `targets.ts`, with the widths and schemes it
   actually needs — declared per target rather than cross-multiplied,
   because the shot count is `Σ (widths × schemes) × browsers` and
   compounds quickly.
3. `pnpm vrt` to capture, then `pnpm vrt:accept`.

Adding a state to an existing specimen page needs no change here: the page
is already a target, so the next run picks the new state up. That is the
main thing keeping one copy buys.

Only specimen pages are screenshotted; the site's real routes are not.

**Don't fake the surroundings a component needs.** `/test/header-overlay/`
renders the overlay header through `ArticleLayout`, the layout that
actually draws the hero, rather than approximating that gradient on a
simpler page. An approximation is what the baseline would record, so a
change to the real gradient would leave the page passing — the check would
be guarding a copy of the design rather than the design. Verified by
changing a visible stop in `ArticleLayout`'s radial gradient: 24
`header-overlay` shots and 24 `prose` shots fail. Two pages using real
layouts beat one page using a stand-in.

## What is not stabilised

Nothing, and there is no VRT build either — `pnpm vrt` runs
`INCLUDE_TEST_PAGES=1 astro build` and screenshots `dist/`. A second Astro
config existed to add stabilisation and an `outDir`; once the stabilisation
was gone the `outDir` was the only thing left, and sharing `dist/` between
a production build and a test-pages build is already how this repo works.

Three things were tried and removed, each because measurement contradicted
the reason for having it:

- **Animation overrides** (`animation: none`, `animation-timeline: none`).
  Playwright's `animations: 'disabled'` already handles this, and it walks
  into every `shadowRoot` and applies its handling per root — something CSS
  injected into the document could not do. Scroll-driven animations looked
  like the exception and are not: `animation-timeline: view()` is a pure
  function of scroll offset, and a `fullPage` capture scrolls
  deterministically and returns to the top. Probed on `/test/prose/`, whose
  header and hero both use one — `translate` is `0px 0%` before and after
  the capture.
- **Scrollbar suppression** (`scrollbar-gutter: auto`, `scrollbar-width:
none`). `scrollbar-gutter: stable` in `global.css` reserves 15px
  unconditionally in Chrome, so suppressing it made shots 1440 wide where a
  real user gets 1425. Removing the override means the baseline shows what
  the browser actually does; the gutter is stable within a browser, and a
  baseline is only ever compared against its own browser.
- **Forcing images eager.** Every image on these pages is already eager and
  carries explicit `width`/`height`, so there was nothing to convert and
  nothing that could reflow. The script also ran as a deferred module, after
  `DOMContentLoaded`, so it could not have won the race it existed to
  prevent — and its `decoding="sync"` overrode the site's own
  `decoding="async"`, making the capture less faithful rather than more.

The lesson worth keeping: **a stabilisation rule that is not measured is a
rule that changes what you are testing for no reason.** Before adding one,
empty it out and show the failure it prevents.

## Sensitivity

`threshold: 0.02` with `maxDiffPixels: 0`, and the pair matters —
`maxDiffPixels` says how many differing pixels are tolerated, `threshold`
decides which pixels count as differing at all. A high threshold filters
the set to nothing before the count is taken, so `maxDiffPixels: 0` on its
own is not strict.

Playwright's default `threshold` is 0.2 and it is much too high here. A 6px
change to `--panel-inset` visibly moves a code block's edges, but the
block's fill and the page behind it are both near-black purples, so each
repainted pixel shifts by a channel delta of about 25 out of 255 — well
under the ~62 the default demands. All 22,560 differing pixels were
discarded and the test passed. At 0.02 the same change fails 36 shots:
every browser × scheme for `code` and `prose` at the widths where the token
applies.

`comparator: 'ssim-cie94'` also catches it and needs no threshold, but it
runs out of memory on the tall `fullPage` captures — the prose shot is
14113px — and its workers are SIGKILLed, which surfaces as failures
indistinguishable from real ones. Not worth it until the shots are smaller.

Do not raise `threshold` to quiet a flaky shot. It is a global sensitivity
floor, and the change it will hide next is the one above.

## Accepting

`pnpm vrt:accept` copies the previous baseline folder to a new one named by
the hash of the new contents, overwrites only the images that changed, and
then rewrites `baseline.txt`. It leaves that as an unstaged change: the hash
file is the reviewable record of a deliberate decision, so accept never
commits for you.

It refuses to promote a run that produced fewer shots than the matrix
describes, which is what a crashed run leaves behind. Nothing about a
partial `current/` directory says it is partial, and promoting one writes a
baseline with images missing — the next run then reports those as _new_
rather than missing, which reads like a fresh target rather than a broken
accept.

The hash is content-derived, so reverting a CSS change returns the baseline
to its previous hash exactly.

## Files

| Path           | What                                                  |
| -------------- | ----------------------------------------------------- |
| `targets.ts`   | The routes to shoot, with widths and schemes for each |
| `Dockerfile`   | The one place any of this runs                        |
| `baseline.txt` | The committed hash naming the current baseline        |
| `runner/`      | Playwright config, storage layer, accept script       |

The pages themselves are in `src/pages/test/`, not here.

Each file carries its own reasoning in a doc comment; `runner/storage.ts`
and `runner/accept.ts` are the two worth reading before changing anything.

## Not yet built

Phases 3–7 of `plans/visual-regression-testing-plan.md`:

- **A real bucket.** The runner talks to storage through the `Storage`
  interface in `runner/storage.ts`, so this is a new implementation of five
  methods and nothing else moves. The provider is still undecided.
- **CI** — the blocking check, PR comments, the label-driven accept, and the
  fork-safe split. All of it waits on the bucket, since a baseline that
  lives on one laptop cannot gate a pull request.
- **The nightly pre-release job** and its issue reporting. The tier itself
  works today; what is missing is the schedule and the reporting.
- **`pnpm vrt:gc`.** Deliberately last: it is only worth writing once there
  are real baselines to sweep, and its root set depends on the PR accept
  flow existing. Baseline folders already accumulate in `.vrt/store/` with
  nothing to reclaim them — locally that is a `rm -rf`.
- **Wider coverage.** Six specimen pages today.
