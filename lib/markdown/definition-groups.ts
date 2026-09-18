import { defineHastPlugin } from 'satteri';
import type { HastNode, HastParentContent } from 'satteri';

/* What a `dl` may hold. Derived from satteri's own export rather than imported
   from `@types/hast`, which is only present here as satteri's dependency:
   `HastNode` includes `root`, which is not valid inside an element. */
type Child = HastParentContent['children'][number];

/**
 * Wraps each term/description pair in a definition list in a `<div>`.
 *
 * HTML gives a `dl` a flat run of `dt`s and `dd`s with no element grouping a
 * term with its description, so CSS has to infer where one pair ends and the
 * next begins. That inference is what makes the two-column layout awkward:
 * every rule has to be written as a sibling-combinator guess about position —
 * `dt:not(dt + dt)` for "the first term of a pair", `dt + dd` for "the
 * description that starts alongside it" — and the hairline rule above each
 * pair has to be drawn twice, once per column, then bled outwards by half the
 * gap so the two halves meet.
 *
 * A wrapper makes the pair a box. The rule is one border on the wrapper, the
 * columns are a grid on it, and nesting stops needing to undo the outer list's
 * placement, because a nested list's pairs are wrapped in their own right.
 *
 * `<div>` is valid there: the HTML spec allows a `dl`'s children to be either
 * the bare run or `div`s each holding one group's terms and descriptions.
 *
 * A group starts at a `dt` that follows a `dd`, which is the same rule an
 * author reads off the source: a run of terms, then the descriptions they
 * share, then the next term starts the next group. Both visitors are needed
 * because a list written as markdown arrives as an `element` while one written
 * as JSX arrives as an `mdxJsxFlowElement` — see the note about JSX bypassing
 * the parser in `CLAUDE.md`.
 */
export const definitionGroups = defineHastPlugin({
  name: 'definition-groups',
  element: { filter: ['dl'], visit: (node) => group(node) },
  mdxJsxFlowElement: { filter: ['dl'], visit: (node) => group(node) },
});

/** A node's tag, whichever of the two element shapes it is. */
function tagOf(node: HastNode): string | undefined {
  if (node.type === 'element') return node.tagName;
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return node.name ?? undefined;
  }
  return undefined;
}

function group<N extends HastNode & { children: Child[] }>(node: N): N {
  const children: Child[] = [];
  /** The `div` the current run of terms and descriptions is collecting into. */
  let wrapper: Extract<Child, { type: 'element' }> | undefined;
  /** A description has been seen, so the next term starts a new group. */
  let hasDescription = false;

  for (const child of node.children) {
    /* The parser puts a newline between every pair of elements. Dropping it
       here is what keeps the wrapper's children to just terms and
       descriptions; the markup is reformatted anyway. */
    if (child.type === 'text' && child.value.trim() === '') continue;

    const tag = tagOf(child);

    /* A term after a description starts a new group, as does the first term.
       A term following another term joins the run already open. */
    if (tag === 'dt' && (wrapper === undefined || hasDescription)) {
      wrapper = {
        type: 'element',
        tagName: 'div',
        properties: {},
        children: [],
      };
      hasDescription = false;
      children.push(wrapper);
    }

    /* Anything that is not a term or description — an author's stray element —
       is left where it is rather than being pulled into a group, so the plugin
       cannot change what such a list means. */
    if (wrapper === undefined || (tag !== 'dt' && tag !== 'dd')) {
      children.push(child);
      wrapper = undefined;
      continue;
    }

    if (tag === 'dd') hasDescription = true;
    wrapper.children.push(child);
  }

  return { ...node, children };
}
