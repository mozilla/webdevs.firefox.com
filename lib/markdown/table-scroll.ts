import { defineHastPlugin } from 'satteri';
import type { HastParentContent } from 'satteri';

/**
 * Wraps each `<table>` in a `<div class="table-scroll">`.
 *
 * The design's tables are wider than the text column, so a table has to
 * scroll horizontally rather than force the column wider. Scrolling needs
 * `overflow-x: auto`, and that needs a block container.
 *
 * Putting both jobs on the `table` itself does not work. `display: block`
 * gives the element a block box, but the rows and cells then generate an
 * *anonymous* table box inside it, and that anonymous box is what sizes
 * itself to its content — so `width: 100%` stretches the outer block while
 * the cells stay at their intrinsic widths, the opposite of what the
 * declaration reads as. Splitting the two jobs across two elements gives the
 * wrapper the overflow and leaves the `table` an actual table, where
 * `width: 100%` resolves against the wrapper and a table's used width is
 * still floored at its min-content width — so a wide table overflows and
 * scrolls instead of squashing.
 *
 * The wrapper becomes the block-level sibling in the flow, so the
 * between-block margin in `prose.css` belongs to `.table-scroll` and not to
 * `table`.
 *
 * Both visitors are needed because a table written as markdown arrives as an
 * `element` while one written as JSX arrives as an `mdxJsxFlowElement` — see
 * the note about JSX bypassing the parser in `CLAUDE.md`.
 *
 * `wrapNode` rather than returning a replacement node: it states the
 * intent directly, and a visitor that returned a `div` containing the very
 * table it matched would be describing a tree the same filter matches again.
 */
/* A function rather than a shared constant: `wrapNode` takes an `Element`,
   whose `properties` and `children` are mutable, so each call gets its own. */
function wrapper(): HastParentContent {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['table-scroll'] },
    children: [],
  };
}

export const tableScroll = defineHastPlugin({
  name: 'table-scroll',
  element: {
    filter: ['table'],
    visit: (node, context) => {
      context.wrapNode(node, wrapper());
    },
  },
  mdxJsxFlowElement: {
    filter: ['table'],
    visit: (node, context) => {
      context.wrapNode(node, wrapper());
    },
  },
});
