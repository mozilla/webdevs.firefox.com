import type { ShikiTransformer } from 'shiki';
import type { HastNode, HastParentContent } from 'satteri';

/* Derived from satteri's own exports rather than imported from `@types/hast`,
   which is only present here as satteri's dependency — the same reasoning as
   in `definition-groups.ts`. */
type Element = Extract<HastNode, { type: 'element' }>;
type ElementContent = HastParentContent['children'][number];

const NON_BLANK = /[^ \t]/;

const span = (className: string, children: ElementContent[]): Element => ({
  type: 'element',
  tagName: 'span',
  properties: { class: className },
  children,
});

/**
 * Splits each highlighted line into its leading indentation and the rest, so
 * a line that wraps keeps its continuation aligned under the line's content.
 *
 * This is the safety net under the per-width formatting in `plugin.ts`.
 * Prettier reflows what it can, but it never touches the inside of a comment
 * and cannot break a long identifier or URL, so a line can still outrun the
 * tier it was formatted for. With the two parts in separate grid columns
 * (`auto 1fr`, set in `prose.css`) the overflow wraps within the second
 * column and reads as a continuation of the line rather than starting back at
 * the gutter.
 *
 * Modelled on `transformerRenderIndentGuides` from `@shikijs/transformers`,
 * but instead of splitting the indent into per-level guide spans it peels the
 * whole leading-whitespace run into one `.indent` cell and wraps the
 * remainder in a `.content` cell.
 */
export function transformerIndentWrap(): ShikiTransformer {
  return {
    name: 'indent-wrap',

    code(hast) {
      /* Each `.line` becomes a block-level grid, so the literal newlines
         Shiki puts between lines would render as blank lines of their own and
         double every line break. */
      hast.children = hast.children.filter(
        (node) => !(node.type === 'text' && node.value.trim() === ''),
      );

      for (const line of hast.children) {
        if (line.type !== 'element') continue;

        const indent = peelIndent(line.children);

        /* The grid lays the indent and the content out as separate cells, and
           separate cells copy as separate lines. To keep a copied line
           intact, the indent is mirrored into the content as a zero-width,
           select-only prefix — see `.copy-indent` in `prose.css` — and the
           visible `.indent` cell is excluded from selection. */
        line.children = [
          span('indent', indent.children),
          span(
            'content',
            indent.text === ''
              ? line.children
              : [
                  span('copy-indent', [{ type: 'text', value: indent.text }]),
                  ...line.children,
                ],
          ),
        ];
      }

      return hast;
    },
  };
}

/**
 * Removes the leading indentation from `children` and returns it.
 *
 * That means the whitespace-only tokens at the start of the line, plus the
 * leading whitespace of the first token that also carries content — which has
 * to be split, since Shiki colors the whole token as one.
 */
function peelIndent(children: ElementContent[]): {
  children: ElementContent[];
  text: string;
} {
  const indent: ElementContent[] = [];
  let text = '';

  while (children.length > 0) {
    const child = children.at(0);
    if (child === undefined) break;

    const token = child.type === 'element' ? child.children.at(0) : child;
    if (token?.type !== 'text') break;

    const contentStart = token.value.search(NON_BLANK);

    // Whitespace all the way: the token moves into the indent wholesale.
    if (contentStart === -1) {
      text += token.value;
      indent.push(child);
      children.shift();
      continue;
    }

    /* Whitespace then content. The indent slice keeps the token's own
       styling, so the line looks identical either way. */
    if (contentStart > 0) {
      const leading = token.value.slice(0, contentStart);
      text += leading;
      token.value = token.value.slice(contentStart);

      indent.push(
        child.type === 'element'
          ? { ...child, children: [{ type: 'text', value: leading }] }
          : { type: 'text', value: leading },
      );
    }

    // The first token carrying content ends the indent either way.
    break;
  }

  return { children: indent, text };
}
