---
name: figma-shared-design
description: Project-specific facts for reading the "Firefox_for_Developers" Figma file — the file key, Home page node IDs and the light/dark twin offset, how to get dark-mode token values, where variable bindings really come from, the traps in get_design_context / get_variable_defs / spilled MCP output, and what to do when the Figma server is unreachable (stop, don't guess). Load this alongside figma-design-to-code whenever a task involves implementing, measuring, or checking anything against the Figma design, or adding a color token that needs a dark value.
---

# Working with the Firefox_for_Developers file

Load the `figma-design-to-code` skill before calling `get_design_context`.
This skill adds the project-specific detail that skill has no way to know.

## If you cannot reach Figma, stop

**No Figma access means no answer. Stop and say so — do not substitute a
guess.** The server needs OAuth and a non-interactive session cannot run
that flow, so the failure is usually "the `figma` MCP server is not
authorized" rather than a missing node. Report that the task is blocked,
say it needs authorizing via `claude mcp` or `/mcp` in an interactive
session, and end the turn there.

This applies whenever the design is the source of truth for the answer:
implementing a frame, measuring spacing, checking something against the
design, or getting a dark-mode value. Finish any genuinely independent part
of the request first, then stop on the part that needs Figma.

What not to do instead, all of which has happened:

- Don't reason from the code to a cause that sounds plausible and fix that.
  A defect you can argue for from the CSS alone is not evidence about what
  the design specifies, and "the columns are inconsistent with each other"
  does not establish which one is wrong.
- Don't ship the change with a caveat attached. A hedged guess still lands
  in the file, still has to be reviewed, and is harder to spot than no
  change at all. The caveat does not make it safe.
- Don't derive the value from tokens, type metrics or a screenshot and
  present the arithmetic as a measurement. Deriving a number is not reading
  one.
- Don't treat a browser screenshot as a substitute. It shows what the code
  does, never what the design asks for, so it cannot settle a mismatch
  between them.

A wrong value that looks measured is worse than an unanswered question: it
reads as verified to the next person, and the reasoning that produced it is
persuasive enough to survive review. "I could not check this" is the
correct deliverable when you could not check it.

- File key: `JFIeIEWeVOsoEZzMFKupmh` — the `Firefox_for_Developers` file, at
  `https://www.figma.com/design/JFIeIEWeVOsoEZzMFKupmh/Firefox_for_Developers`. The light Home page is node `42:1742`, the dark equivalent `42:3623`.
  Node `42:1079` is the whole "Final Pages" canvas and is too large to fetch
  in one call — target individual frames.
  Its light and dark twins are the same frame offset by roughly 11000 in `y`,
  so a light frame at `y=0` pairs with a dark one at `y≈10988`.
- **When an oversized MCP result is spilled to a file, it is a JSON array of
  `{type, text}` — not the XML you would have seen inline.** Every quote in
  it is backslash-escaped, so grepping for `name="Forms"` matches nothing and
  the frame looks absent when it is right there. Don't conclude from an empty
  grep that the node doesn't exist. Parse it rather than pattern-matching the
  raw bytes:

  ```bash
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["text"])' "$F" | grep 'name="Forms"'
  ```

  The same goes for any tool output saved to disk — check whether you are
  reading the payload or its JSON encoding before trusting a negative result.

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
- **A component's variable bindings come from its component set, not from a
  page that happens to use it.** The Buttons set (`43:6818`) binds the
  mode-dependent Purple / Dark Purple / Midnight Purple, so button fills
  shift with the color scheme; the dark Home frame separately binds
  `Purple Fixed` for unrelated artwork, and reading that as the button's
  color is how the styles ended up wrongly pinned to one palette.
- `get_variable_defs` resolves variables in **one** mode — whichever the
  queried node sits in — and the output gives no hint which. Light and dark
  values therefore look indistinguishable in isolation: call it on both twins
  and diff them before deciding a value is mode-independent.
- Download image and SVG assets into `src/assets/` and commit them. Figma's
  asset URLs expire after about 7 days.
- Icons and logos exported from Figma may have hardcoded fills. Swap them for
  `currentColor` so they follow the color scheme — the Firefox wordmark
  shipped with the light-mode heading color baked in.

## Color tokens

Get dark values from the dark Home panel (node `42:3623`) via
`get_variable_defs`. Never invent them. See "Design tokens" in `AGENTS.md`
for how those values are then written — every color token uses
`light-dark()`, and there is no parallel palette of fixed colors.
