import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineMdastPlugin } from 'satteri';
import type { Custom, MdastNode, MdastVisitorContext } from 'satteri';

import {
  formatVariants,
  hasParser,
  stripBuildDirectives,
  TIERS,
} from './format.ts';

/* Both derived from satteri's own exports rather than imported from
   `@types/mdast`, which is only present here as satteri's dependency — the
   same reasoning as in `definition-groups.ts`. */

/** A fenced code block. */
type Code = Extract<MdastNode, { type: 'code' }>;
/** What a `Custom` node may hold, which is narrower than `MdastContent`. */
type Child = NonNullable<Custom['children']>[number];

/**
 * Formats every code block at several print widths, so the reader gets the
 * one laid out for the space the block actually has.
 *
 * A code sample has to pick a line length, and on the web there is no single
 * right one: the same block sits in a 79-character column at full desktop
 * measure and a 40-character one on a phone. Formatting once means either
 * wasting the desktop measure or overflowing the phone, and the usual
 * fallbacks are worse — horizontal scrolling is miserable on a phone, and
 * `white-space: pre-wrap` breaks lines mid-expression with no indentation
 * continuation, which for code is actively misleading.
 *
 * So each block is run through Prettier at each width in `TIERS`, every
 * distinct result is emitted, and the container queries in `prose.css` show
 * the widest one that fits.
 *
 * This runs at mdast, before Astro's Shiki step — a hast plugin matching any
 * `pre` in the tree — so each variant is highlighted with the project's
 * configured theme and transformers rather than this plugin instantiating a
 * highlighter or hand-rolling highlighted markup.
 *
 * Both objections you would expect measure far smaller than they sound. The
 * variants are near-identical text, so a compressor eats them: three
 * highlighted variants of a twelve-line snippet came to 1.2x one variant over
 * brotli. And most blocks don't reflow at all — they format the same at every
 * width, which the widest-first short-circuit in `format.ts` establishes
 * after a single Prettier call, and they emit one `pre` exactly as they would
 * have without this plugin.
 *
 * Every block is wrapped in `.code-block` whether it has variants or not, so
 * one set of rules owns the block's background, padding and query container
 * however the block was treated.
 */
export const codeWidths = defineMdastPlugin({
  name: 'code-widths',

  async code(node, context) {
    const { lang, meta, noFormat, width } = parseFence(node);

    /** The author's language and meta, carrying `value` instead. */
    const fence = (value: string): Child => ({
      type: 'code',
      lang: node.lang,
      meta,
      value: stripBuildDirectives(value),
    });

    /* A block that opted out, or one written on a bare fence, ships as
       authored and says nothing about it. */
    if (noFormat || lang === undefined) {
      context.replaceNode(node, block([fence(node.value)]));
      return;
    }

    const variants = await formatVariants(node.value, lang, {
      tiers: width === undefined ? TIERS : [width],
    });

    if (variants === undefined) {
      /* A language with no parser is expected. A block that should have
         formatted and didn't is worth a line in the build log, so an author
         finds out rather than silently shipping their own layout. */
      if (hasParser(lang)) warn(context, node, lang);

      context.replaceNode(node, block([fence(node.value)]));
      return;
    }

    /* One variant is the common case, and it gets no variant wrapper at all —
       the same `.code-block > pre` an opted-out block produces. */
    if (variants.length === 1) {
      context.replaceNode(node, block(variants.map(({ code }) => fence(code))));
      return;
    }

    context.replaceNode(
      node,
      block(
        variants.map(({ code, tiers }) => ({
          type: 'codeVariant',
          data: {
            hName: 'div',
            /* Every width this variant serves, so the container queries can
               show it by the tier that matched rather than by position. */
            hProperties: {
              class: [
                'code-variant',
                ...tiers.map((tier) => `tier-${String(tier)}`),
              ].join(' '),
            },
          },
          children: [fence(code)],
        })),
      ),
    );
  },
});

/**
 * Tells the author about a block that asked to be formatted and couldn't.
 *
 * `context.report` is the API for this, but satteri collects its diagnostics
 * into an array the compile step never surfaces, so nothing reaches the build
 * log.
 * A plain `console.warn` does, and carries the file and the block's opening
 * line, which is enough to find it.
 */
function warn(
  context: MdastVisitorContext,
  node: Readonly<Code>,
  lang: string,
): void {
  const file =
    context.fileURL === undefined
      ? 'markdown'
      : path.relative(process.cwd(), fileURLToPath(context.fileURL));
  const [opening = ''] = node.value.split('\n', 1);

  console.warn(
    `[code-widths] ${file}: Prettier could not format a \`${lang}\` block, ` +
      `so it ships as authored. It starts: ${opening.trim()}`,
  );
}

/** The block wrapper: the query container, and what the CSS hangs off. */
const block = (children: Child[]): Child => ({
  type: 'codeBlock',
  data: { hName: 'div', hProperties: { class: 'code-block' } },
  children,
});

const NO_FORMAT = /(?:^|\s)no-format(?=\s|$)/;
const WIDTH = /(?:^|\s)width=(\d+)(?=\s|$)/;

/**
 * The fence's language and meta string, with the authoring escape hatches
 * read out of the latter:
 *
 * - `no-format` — ship exactly what the author wrote.
 * - `width=80` — one variant at a fixed width, for a sample whose point is a
 *   particular line layout.
 *
 * Both are stripped from the meta this returns, so a Shiki transformer never
 * sees a directive that was already acted on. Anything else in the meta
 * string is passed through untouched.
 */
function parseFence(node: Readonly<Code>): {
  lang: string | undefined;
  meta: string | undefined;
  noFormat: boolean;
  width: number | undefined;
} {
  const raw = node.meta ?? '';
  const width = WIDTH.exec(raw)?.[1];
  const stripped = raw.replace(NO_FORMAT, '').replace(WIDTH, '').trim();

  return {
    lang: node.lang ?? undefined,
    meta: stripped === '' ? undefined : stripped,
    noFormat: NO_FORMAT.test(raw),
    width: width === undefined ? undefined : Number(width),
  };
}
