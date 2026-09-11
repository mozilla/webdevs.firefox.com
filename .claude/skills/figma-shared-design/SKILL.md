---
name: figma-shared-design
description: Project-specific facts for reading the "Firefox for Developers | Shared Design" Figma file — the file key, Home page node IDs and the light/dark twin offset, how to get dark-mode token values, where variable bindings really come from, and the traps in get_design_context / get_variable_defs / spilled MCP output. Load this alongside figma-design-to-code whenever a task involves implementing, measuring, or checking anything against the Figma design, or adding a colour token that needs a dark value.
---

# Working with the Shared Design file

Load the `figma-design-to-code` skill before calling `get_design_context`.
This skill adds the project-specific detail that skill has no way to know.

- File key: `GULnZuu07g7faYJ7wE1V4v`. The light Home page is node `42:1742`,
  the dark equivalent `42:3623`. Node `42:1079` is the whole "Final Pages"
  canvas and is too large to fetch in one call — target individual frames.
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
  shift with the colour scheme; the dark Home frame separately binds
  `Purple Fixed` for unrelated artwork, and reading that as the button's
  colour is how the styles ended up wrongly pinned to one palette.
- `get_variable_defs` resolves variables in **one** mode — whichever the
  queried node sits in — and the output gives no hint which. Light and dark
  values therefore look indistinguishable in isolation: call it on both twins
  and diff them before deciding a value is mode-independent.
- Download image and SVG assets into `src/assets/` and commit them. Figma's
  asset URLs expire after about 7 days.
- Icons and logos exported from Figma may have hardcoded fills. Swap them for
  `currentColor` so they follow the colour scheme — the Firefox wordmark
  shipped with the light-mode heading colour baked in.

## Colour tokens

Get dark values from the dark Home panel (node `42:3623`) via
`get_variable_defs`. Never invent them. See "Design tokens" in `AGENTS.md`
for how those values are then written — every colour token uses
`light-dark()`, and there is no parallel palette of fixed colours.
