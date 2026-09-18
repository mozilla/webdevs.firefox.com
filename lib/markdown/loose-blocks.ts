import { defineMdastPlugin } from 'satteri';

/**
 * Makes every list item's and description's content a paragraph.
 *
 * Markdown distinguishes "tight" lists from "loose" ones: items separated by a
 * blank line get their content wrapped in `<p>`, items written without one get
 * bare text. The distinction is a spacing hint from CommonMark, expressed in
 * the AST as `spread` on the list and its items. Definition lists carry the
 * same flag on each description.
 *
 * That leaves two shapes for the same construct, so every rule for list text
 * has to be written for both `li` and `li > p` — and the two differ in more
 * than a selector, since a `<p>` is a block that takes margins while bare text
 * is not. Forcing `spread` on means an author's blank lines change nothing
 * about the markup, and `prose.css` styles `li > p` and `dd > p` alone.
 *
 * The spacing the flag used to imply is set in CSS instead, which is where the
 * rest of the prose spacing already lives.
 *
 * `setProperty` rather than returning an edited copy: nodes are read-only, and
 * a spread copy of one is not cheap. Satteri's nodes are stubs over a Rust
 * arena whose fields are getters, so `{ ...node }` materializes the whole
 * subtree and the returned tree is re-encoded child by child — where a
 * property patch is a few bytes naming the node and the flag. On a list-heavy
 * page the copy cost about four times as much as the rest of the markdown
 * pipeline put together.
 */
export const looseBlocks = defineMdastPlugin({
  name: 'loose-blocks',

  /* Both the list and its items carry `spread`: the list drives the compiler's
     choice, and an item's own flag would otherwise override it for that item.
     `listItem` reaches items of nested lists too, which the `list` visitor
     sees as separate lists of their own. */
  list: (node, context) => {
    context.setProperty(node, 'spread', true);
  },
  listItem: (node, context) => {
    context.setProperty(node, 'spread', true);
  },

  /* A description's content is already a paragraph in the AST — `spread` is
     what decides whether the compiler keeps it or unwraps it to bare text.
     There is no list-level equivalent to set: unlike `list`, a
     `descriptionList` holds terms as well as descriptions, and a term is never
     wrapped. */
  descriptionDetails: (node, context) => {
    context.setProperty(node, 'spread', true);
  },
});
