# Visual regression testing

## Goal

Catch unintended rendering changes in components before they ship. A set of
fixture pages, not part of the production build, are rendered in real
browsers; screenshots are compared against a stored baseline; differences are
surfaced for human review and accepted with an explicit action that updates
the baseline.

Baselines live in an object store, not in git. A single text file in the repo
records the hash naming the current baseline folder, so the baseline is
versioned alongside the code without putting binaries in git history.

## Decisions already made

- **Fixture pages only.** Real routes are not screenshotted. Fixtures exercise
  components in states the live site does not currently reach.
- **Everything runs in Docker**, locally and in CI, so there is exactly one
  set of baselines and local pixels match CI pixels.
- **All three engines, stable and pre-release** — with a caveat, see
  [Browser matrix](#browser-matrix).
- **Multiple widths**, exact numbers still to be chosen.

## Open decisions

These are called out inline too, but collected here:

1. **Object store provider** — blocks the storage layer. See
   [Storage](#storage).
2. **Widths** — see [Widths](#widths) for a proposed starting set.
3. **Color schemes** — the site is built on `light-dark()`, so dark mode is
   an entirely untested surface. Proposal: schemes are declared per fixture
   rather than multiplied across the whole matrix.
4. **Do pre-release browsers block a PR?** Proposal: no. See
   [Two jobs, two purposes](#two-jobs-two-purposes).

---

## Browser matrix

The request was Firefox, Chromium and WebKit, each in stable and beta. Two of
those six are not available as stated. Checked against `playwright-core@1.63.0`:

| Engine | Stable                                  | Pre-release                                                                                                                                       |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gecko  | Bundled `firefox` (currently 155)       | `channel: 'moz-firefox-beta'` — needs Firefox Beta installed, drives it over **WebDriver BiDi** rather than Playwright's patched build            |
| Blink  | `channel: 'chrome'` (Google Chrome apt) | `channel: 'chrome-beta'`, apt from Google's repo                                                                                                  |
| WebKit | Bundled `webkit` (currently 26.6)       | **Does not exist.** No beta/preview channel is shipped, and Safari Technology Preview is macOS-only, so unreachable from a Linux container anyway |

Three things follow.

**Playwright's bundled Chromium is not stable Chrome.** It currently reports
153.0.8010.12, which runs ahead of the stable channel. If you want "Chrome as
users have it", you want `channel: 'chrome'`; the bundled build is closer to
an early-warning channel in its own right.

**Firefox pre-release costs more than it looks.** `moz-firefox-beta` goes
through Playwright's BiDi path, which is a different, less mature transport
than the patched-Firefox path used for the bundled build. Expect rougher
edges. It also needs Firefox Beta unpacked to `/opt/firefox-beta/firefox`
inside the image, which we control, so that part is fine.

**WebKit-on-Linux is not Safari.** Playwright's Linux WebKit is a GTK
MiniBrowser build with a Linux font stack and no CoreGraphics text rendering.
It will catch WebKit engine layout regressions. It will not tell you what a
Mac or iOS user sees, and its screenshots will differ from Safari's in ways
that are not bugs.

Proposed matrix, five browser configurations:

```text
firefox          bundled Playwright Firefox           blocking
chrome           channel: 'chrome'                    blocking
webkit           bundled Playwright WebKit            blocking
firefox-beta     channel: 'moz-firefox-beta' (BiDi)   advisory
chrome-beta      channel: 'chrome-beta'               advisory
```

### Two jobs, two purposes

Stable and pre-release browsers are answering different questions, and mixing
them into one blocking check makes both worse.

Chrome Beta ships weekly; Firefox Beta every few weeks. Every one of those
releases can shift antialiasing or metrics by a pixel, which means a blocking
pre-release check would fail PRs for reasons that have nothing to do with the
PR. That trains people to click "accept" without looking, which destroys the
value of the whole system.

So:

- **Stable engines, pinned, blocking.** Browser versions are pinned by the
  Docker image digest and pinned package versions. A browser upgrade is its
  own PR that re-accepts the baseline deliberately. This check failing always
  means either you changed something or the browser changed — and you know
  which, because the browser only changes in its own PR.
- **Pre-release engines, floating, scheduled.** A nightly job runs the beta
  channels against the same fixtures. It does not gate PRs. When it diverges
  it opens (or updates) an issue with the diff images attached: "Firefox Beta
  156 changes how `Header` renders." For a Mozilla property that early warning
  is arguably the most valuable output of the whole system, but it is a
  monitoring signal, not a merge gate.

Pre-release baselines live under their own `baselines-prerelease/` prefix and
their own hash file, so beta churn never touches the blocking baseline.

---

## Fixture pages

### Keeping them out of the production build

A second Astro config, rather than an env-var gate on the main one. An env
gate means one missing variable ships fixture pages to production; a separate
config means the production build has no code path that can reach them.

```text
astro.config.ts        production — unchanged, never references fixtures
astro.config.vrt.ts    imports the base config, adds fixture routes,
                       outDir: '.vrt/dist'
```

`astro.config.vrt.ts` adds a small inline integration that `injectRoute`s each
fixture at `/__vrt/<id>/`, and sets `outDir` so a VRT build can never overwrite
`dist/`. Fixtures import real components through the `~/*` alias exactly as
pages do, so they exercise the same code.

Belt and braces: a CI assertion that the production `dist/` contains no
`__vrt` path.

### Layout

```text
tests/visual/
  fixtures.ts            the fixture list — ids, widths, schemes
  fixtures/
    header.astro
    footer.astro
    ...
  fixture-layout.astro   MainLayout + VRT stabilisation stylesheet
  runner/                Playwright config, storage layer, accept script
  baseline.txt           ← the one committed artefact: a baseline hash
```

`fixtures.ts` is an explicit list rather than a glob, because it also carries
per-fixture configuration:

```ts
export interface Fixture {
  /** URL segment and screenshot key. */
  id: string;
  /** Path to the .astro page, relative to tests/visual/fixtures/. */
  page: string;
  /** Widths in px. Defaults to the standard set. */
  widths?: number[] | undefined;
  /** Color schemes. Defaults to ['light']. */
  schemes?: ('light' | 'dark')[] | undefined;
}
```

Declaring widths and schemes per fixture, instead of cross-multiplying
everything, keeps the shot count honest. A footer that has real dark-mode
behavior asks for both schemes; a fixture that is scheme-agnostic does not
pay for a second screenshot. An explicit list is also greppable and diffable,
which a glob is not.

Shot count is `Σ over fixtures (widths × schemes) × browsers`. With 5
browsers, 4 widths and mostly-light fixtures, 10 fixtures lands around 200+
screenshots. Worth watching from the start.

### Widths

Proposed starting set, to be confirmed:

| Width | Why                                                          |
| ----- | ------------------------------------------------------------ |
| 1440  | The only width Figma specifies. The reference.               |
| 960   | Just below `60rem`, the breakpoint the header and footer use |
| 600   | Small tablet / large phone landscape                         |
| 375   | Narrow phone — the most-interpreted, least-specified layout  |

Since `CLAUDE.md` notes that everything below 1440 is interpretation rather
than spec, those are precisely the widths where a regression would otherwise
go unnoticed.

Height is fixed at 1024 with `fullPage: true`, so the shot captures the whole
document regardless.

### Stabilising the render

Flaky screenshots are worse than no screenshots. Every source of
nondeterminism gets handled once, in the fixture layout and the Playwright
config, rather than per test:

- **Fonts.** Both families are variable webfonts. The harness awaits
  `document.fonts.ready` before capture; without it you intermittently
  screenshot the fallback.
- **Animation and transitions.** `animations: 'disabled'` on capture, plus a
  VRT stylesheet (Playwright's `stylePath`) forcing
  `transition: none !important; animation: none !important`.
- **Caret and scrollbars.** `caret: 'hide'`; scrollbar gutters neutralised in
  the VRT stylesheet, since the three engines draw them quite differently.
- **Device scale factor 1.** Keeps files small; 2 is available later if
  subpixel fidelity turns out to matter.
- **Locale and timezone pinned** (`en-GB`, `UTC`) so any dates are stable.
- **Lazy images forced eager** in the VRT stylesheet's companion script, so a
  below-the-fold image cannot land mid-capture.
- **Preact islands.** Fixtures that hydrate wait on a readiness signal before
  capture rather than a fixed timeout.

Playwright's own comparator already retakes a screenshot until two consecutive
frames are identical, which handles most of the rest.

---

## Storage

### The model

One folder per baseline, named by its hash, with stable human-readable names
inside:

```text
baselines/<hash>/<fixture>/<browser>/<width>/<scheme>.png
previews/pr-<n>/<sha>/...      candidate + diff images for PR comments
```

So a real key looks like `baselines/4f3ac91.../header/firefox/1440/light.png`.

`tests/visual/baseline.txt` holds one line — the folder name — and that is the
entire committed footprint. The hash is computed over the sorted list of
`(key, sha256-of-bytes)` pairs, so it is still content-derived: two runs that
produce identical pixels produce the same folder name, and the text file
conflicts on exactly the PRs that both changed rendering.

There is no manifest file. The bucket's own object listing is the manifest.

### Why not content-addressed blobs

The obvious alternative is git's model: `objects/<sha256>.png` plus a manifest
mapping keys to blob hashes. It was the first design here and it does not earn
its complexity at this scale.

- **Dedup across baselines saves nothing worth having.** Around 200 shots at
  ~250KB is ~50MB per baseline. A hundred accepts is 5GB, roughly ten cents a
  month on GCS standard.
- **Incremental transfer is the real prize, and the folder layout gets it
  anyway** — see below. That was the actual argument for content-addressing,
  and it turns out not to require it.
- **Opacity has a genuine cost.** `baselines/<hash>/footer/webkit/375/dark.png`
  is a URL a human can construct and open. Answering "what did this look like
  three weeks ago" in the blob layout needs a tool somebody has to build and
  maintain.
- **Garbage collection becomes a directory delete.** With blobs you cannot
  remove anything without proving no reachable baseline references it, which
  means walking every `baseline.txt` in git history.

What is genuinely given up is deduplication of identical shots across
baselines and across the stable/pre-release matrices. Given the storage
numbers, that is not worth a manifest format.

### Incremental transfer without a manifest

**Accepting copies server-side.** GCS and S3 both copy objects within a bucket
without the bytes leaving the provider. Accept duplicates the previous hash
folder to the new one — around 200 copy calls, a couple of seconds, no egress
— then overwrites only the files that actually changed. Changing the footer
uploads the handful of footer shots, not all 200.

**Hydrating reads hashes from the listing.** A single list call returns every
object's name _and_ its content hash: GCS exposes `md5Hash` on
`objects.list`, S3 and R2 expose it as the ETag, which is the plain MD5 for
anything not multipart-uploaded. PNGs of this size are far below any
multipart threshold, so the ETags will be plain MD5s. The client therefore
knows every blob's hash before downloading a byte, and skips anything already
in its local cache.

That local cache _is_ content-keyed — `~/.cache/vrt/blobs/<md5>` — so
switching branches or pulling a changed baseline fetches only the images that
genuinely differ from anything already on disk. The client-side cache is
content-addressed; the bucket does not have to be.

### Provider — undecided

| Option            | Auth in CI                            | Public reads for PR images   | Notes                                                                          |
| ----------------- | ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| **GCS**           | Workload Identity Federation, no keys | Public bucket or signed URLs | Mozilla's usual footprint; recommended default                                 |
| **S3**            | OIDC role assumption, no keys         | Public bucket or CloudFront  | Equivalent; pick if the team is AWS-shaped                                     |
| **Cloudflare R2** | Static API token secret               | `r2.dev` or custom domain    | Zero egress; but a long-lived secret in GH                                     |
| **Git LFS**       | None                                  | n/a                          | No infra and no hash file, but binaries in git history and LFS bandwidth quota |

The runner talks to storage through a small interface — `list(prefix)`
returning names with hashes, `get(key)`, `put(key, body, contentType)`,
`copy(from, to)`, `publicUrl(key)` — so the provider is swappable and nothing
else in the system has to know. `copy` and the hash on `list` are the two
methods the design leans on, and all three cloud options provide both; the
filesystem implementation used in phase 2 gets them trivially.

Note that Git LFS is the odd one out: it has no folders, no hash file and no
runner storage layer at all. Choosing it means deleting most of this section
rather than implementing it.

### Retention

`previews/` expires after 30 days by lifecycle rule. `baselines/` accumulates
until swept by `pnpm vrt:gc` — see [Garbage collection](#garbage-collection).

An accept must write all the image objects before rewriting `baseline.txt`,
so a half-finished accept leaves an orphaned folder nobody points at, rather
than a baseline with missing images. Those orphans are exactly what the sweep
reclaims.

---

## Garbage collection

`pnpm vrt:gc` deletes baseline folders nothing points at any more. It is a
mark-and-sweep over the bucket: enumerate the hashes that are still
referenced, list what is actually stored, delete the difference.

```text
pnpm vrt:gc                    dry run — report what would be deleted
pnpm vrt:gc --prune            actually delete
pnpm vrt:gc --prune --json     machine-readable, for CI summaries
```

**Dry run is the default.** Deleting from a shared bucket is not reversible
and not something to do by accident, so the destructive behavior is opt-in.

### What counts as a root

The obvious rule — "keep whatever `main` points at" — is too aggressive on its
own, because it deletes the baseline an open PR has already accepted and
breaks that PR's check for reasons its author cannot see. The root set is
therefore:

| Root                                                             | Why                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `baseline.txt` on `origin/main` at HEAD                          | The live baseline. The primary root.                                                                     |
| The pre-release hash file on `origin/main`                       | Tracked separately, swept by the same pass.                                                              |
| `baseline.txt` at the head of every **open** PR                  | A PR that accepted a new baseline owns a folder `main` has never seen. Deleting it breaks a live branch. |
| Every distinct value the file took on `main` in the last 90 days | Lets you check out an older commit, or bisect a visual regression, and still resolve its baseline.       |

Enumerating them:

```text
main       git show origin/main:tests/visual/baseline.txt
open PRs   gh pr list --state open --json number,headRefOid
           then gh api .../contents/tests/visual/baseline.txt?ref=<sha>
history    git rev-list --since=90.days origin/main -- tests/visual/baseline.txt
           then git show <commit>:tests/visual/baseline.txt
```

Open PRs are read through `gh api` rather than `git show` because a fork PR's
head commit is not in the local clone. The history walk only needs commits
that _touched_ the file — the value is unchanged in between, and the value in
force before the window opened is `main` HEAD, which is already a root. In
CI this needs `fetch-depth: 0`, since `actions/checkout` defaults to a shallow
clone with no history to walk.

### What it sweeps

Everything under `baselines/` and `baselines-prerelease/` whose folder name is
not in the root set. That covers three cases:

- Baselines superseded by later accepts, once they age out of the history
  window.
- Baselines belonging to PRs that were closed or merged without their branch
  baseline ever reaching `main`.
- Orphans from a half-finished accept that wrote images but never got as far
  as rewriting `baseline.txt`.

It also removes `previews/pr-<n>/` for PRs that are closed, which is the same
job the lifecycle rule does eventually but does it promptly.

### Safety rails

A garbage collector that gets its root set wrong deletes everything, so the
failure modes get handled explicitly rather than left to luck:

- **A grace period, default 7 days.** A folder is only eligible if its newest
  object is older than that. This is the same idea as git's two-week
  `gc.pruneExpire` default, and it closes the race where a PR accepts a
  baseline in the window between enumerating roots and deleting. No folder in
  active use is ever young enough to be missed and old enough to be deleted.
- **Fail closed on enumeration errors.** If `gh pr list` errors, or the fetch
  of `origin/main` fails, the run aborts. It must never mistake "I could not
  read the roots" for "there are no roots" — that single confusion is how
  this class of tool destroys data. Zero open PRs is a valid answer; a failed
  API call is not.
- **Refuse a suspiciously large sweep.** If the run would delete more than
  half the stored folders, it stops and asks for `--force`. A correct sweep
  on a healthy bucket is a trickle.
- **Compute the entire root set before deleting anything.** No interleaving
  of enumeration and deletion.
- **Delete whole folders, never individual objects.** A folder is either a
  live baseline or it is not; there is no state where removing part of one is
  correct. This is the concrete payoff of choosing folders over
  content-addressed blobs — with shared blobs, a reference-counting bug
  silently corrupts a baseline that is still in use, whereas here the worst
  case is a baseline that is wholly gone and obviously so.

### Running it

Monthly on a schedule, plus `workflow_dispatch` for running it by hand. The
scheduled job runs with `--prune` and writes its report to the job summary,
so there is a record of what went and how much was reclaimed. The dry-run
output — folder count, total bytes, and the age and last-known-branch of each
candidate — is also what you want locally before ever passing `--prune`.

Recovery, if a folder is deleted that turns out to be needed: re-run the
visual tests on that commit and accept. The baseline is regenerable from the
code, which is why this is a cleanup task and not a backup problem.

---

## The local workflow

```text
pnpm vrt              build fixtures, run in Docker, compare to baseline
pnpm vrt:report       open the Playwright HTML report
pnpm vrt:accept       promote the current run to baseline, rewrite the hash
pnpm vrt:gc           report unreferenced baselines (--prune to delete)
pnpm vrt:shell        shell into the container for debugging
```

`pnpm vrt` in full:

1. `astro build --config astro.config.vrt.ts` → `.vrt/dist`
2. Read `tests/visual/baseline.txt`, list `baselines/<hash>/`, and hydrate
   `.vrt/baseline/` — downloading only objects whose hash is not already in
   the local blob cache, so repeat runs are offline and instant
3. Start a static server on `.vrt/dist`
4. Run Playwright in the pinned container across the browser × fixture matrix
5. Playwright's own `toHaveScreenshot` comparison produces pass/fail and diff
   images
6. On failure, the HTML report shows Actual / Expected / Diff / Side-by-side /
   Slider views per screenshot

Using Playwright's built-in comparator and report, with the snapshot directory
hydrated from the bucket, gets the review UI for free rather than building a
diff viewer. The bucket replaces where snapshots are _stored_, not how they
are _compared_.

`pnpm vrt:accept` server-side-copies the old baseline folder to the new hash,
overwrites the changed images, rewrites `baseline.txt`, and leaves that as an
unstaged change for you to review and commit. It never commits on your behalf.

### Docker

Base image `mcr.microsoft.com/playwright:v1.63.0-noble`, **pinned by digest**,
extended with Google Chrome stable, Chrome Beta and a Firefox Beta tarball at
`/opt/firefox-beta`. Built once and pushed to GHCR so contributors pull rather
than build; CI pulls the same digest.

The tradeoff is real and worth stating: a ~2 GB pull on first run, and a
slower edit-run loop than native. In exchange there is one baseline set
instead of one per developer OS, and "works on my machine" cannot happen.

### Thresholds

Start strict — `maxDiffPixels: 0` for the pinned stable channels — and loosen
only against evidence of genuine nondeterminism, per-project rather than
globally. A permissive threshold set "just in case" hides exactly the
one-pixel shifts this system exists to catch.

---

## CI

### Jobs

**`vrt` on `pull_request`** — stable channels, blocking. Builds fixtures,
runs the matrix in the pinned container, and on difference uploads candidates
and diffs to `previews/pr-<n>/<sha>/` and posts a sticky PR comment.

**`vrt-prerelease` on `schedule`** — beta channels, advisory. Compares against
the separate pre-release baseline. On divergence, opens or updates an issue
with the diffs attached. Never blocks anything.

### PR feedback

One sticky comment, rewritten in place rather than appended, containing:

- A summary line: `12 screenshots, 3 changed`
- A table of changed shots, each row `fixture / browser / width / scheme` with
  before, after and diff thumbnails inlined from the bucket's public URLs, in
  a collapsed `<details>` block so the comment stays scannable
- A link to the full Playwright HTML report, uploaded as a workflow artifact
- The instruction for accepting

If nothing changed the comment is removed, so a clean PR carries no noise.

### Accepting from the PR

Adding the `vrt-accept` label triggers a workflow that promotes the candidate
candidate screenshots to a new baseline folder, updates
`tests/visual/baseline.txt`, and pushes that commit to the PR branch.

Two gotchas that will otherwise cost an afternoon each:

- A commit pushed using the default `GITHUB_TOKEN` **does not re-trigger
  workflows**, so the VRT check would stay red forever after accepting. Push
  with a GitHub App token (`actions/create-github-app-token`) instead.
- The accept job must re-verify that the candidate it is promoting belongs to
  the PR's current head SHA, or a race lets you accept a stale screenshot set.

### Fork PRs

Pull requests from forks get no secrets and no OIDC token, so they cannot
write to the bucket or comment. The standard safe split applies:

- `pull_request` builds and screenshots with no credentials, uploading results
  as a workflow artifact
- a `workflow_run` job, which does hold credentials, downloads that artifact,
  uploads to the bucket and posts the comment

This keeps untrusted code away from the credentials while still giving fork
contributors the same feedback. Worth building in from the start for a
public Mozilla repo, since retrofitting it means reworking both workflows.

### Cost control

- `concurrency` group per PR, cancelling superseded runs
- Playwright sharding across runners if the matrix gets slow; the browser
  dimension shards naturally
- Cache the local blob store between runs, keyed by content hash rather than
  by baseline, so a baseline change only re-fetches what actually changed

---

## Phasing

Each phase is independently useful and independently reviewable.

1. **Fixtures and the VRT build.** Second Astro config, `fixtures.ts`, the
   stabilisation layout, two or three real fixtures. No screenshots yet. Verify
   the production build is unaffected.
2. **Local runs with local storage.** Playwright config, the Docker image, the
   storage interface with a filesystem implementation. Accept and compare work
   end to end on one machine.
3. **Real bucket.** Swap the storage implementation once the provider is
   chosen. Nothing else changes.
4. **Blocking CI on stable channels**, with PR comments and the label-driven
   accept flow, including the fork-safe split.
5. **Nightly pre-release job** and its issue reporting.
6. **`pnpm vrt:gc`** and its monthly workflow. Deliberately last: it is only
   worth writing once there are real baselines to sweep, and its root set
   depends on the PR accept flow from phase 4 existing.
7. **Widen fixture coverage** to the rest of the component set.

## Risks

- **Baseline rot.** If accepting becomes routine and unexamined, the system
  reports changes nobody reads. Mitigated by keeping the blocking matrix
  pinned and strict, and pushing churn-prone browsers into the advisory job.
- **Matrix growth.** 5 browsers × 4 widths × schemes × fixtures compounds
  quickly. Per-fixture width and scheme declarations are the main defense;
  revisit if a run exceeds a few minutes.
- **WebKit's Linux rendering** will produce diffs that are engine-real but
  Safari-irrelevant. If that proves noisy, dropping WebKit to advisory is the
  release valve.
- **BiDi maturity** for `moz-firefox-beta` is the least-proven part of the
  stack. It sits in the advisory job precisely so its instability cannot
  block merges.
