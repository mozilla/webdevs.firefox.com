import { expandMacro, type MacroContext } from './macros.ts';
import { MDN_BASE, type Mdn } from './mdn.ts';
import { parseMacros } from './parse.ts';

/**
 * Converts one release note's markdown body to MDX.
 *
 * Line-wise, tracking fenced-code state so nothing inside a fence is touched.
 * No in-scope macro currently sits inside a fence, but the guard is free and
 * keeps future re-runs honest.
 *
 * Every transformation errors rather than guessing: an unknown macro and an
 * unknown alert type both name the file and line.
 */

export interface ConvertOptions {
  mdn: Mdn;
  /** Version → release year, for rewriting in-scope release-note links. */
  years: Map<string, number>;
  /** For error messages. */
  file: string;
}

export interface Converted {
  body: string;
  /** Whether the body uses `<Note>`, so the import can be added. */
  hasNote: boolean;
}

export class ConvertError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${String(line)}: ${message}`);
    this.name = 'ConvertError';
  }
}

/**
 * A GitHub alert opener, capturing its indentation: `> [!NOTE]`, or
 * `  > [!NOTE]` where the alert sits inside a list item. Five of the 20
 * in-scope alerts are indented, and dropping the indentation would lift the
 * note out of the item it belongs to.
 */
const ALERT = /^(\s*)>\s*\[!(\w+)\]\s*$/;
/** MDN's definition-list continuation: `  - : definition text`. */
const MDN_DEFINITION = /^(\s*)-\s*:\s+(.*)$/;
/** An MDN doc link in markdown: `](/en-US/docs/…)`. */
const DOC_LINK = /\]\((\/en-US\/docs\/[^)\s]+)\)/g;
/** A release-note doc path, capturing version and anchor. */
const RELEASE_NOTE_PATH =
  /^\/en-US\/docs\/Mozilla\/Firefox\/Releases\/(\d+)(#.*)?$/i;

export function convertBody(body: string, options: ConvertOptions): Converted {
  const { mdn, file } = options;
  const lines = body.split('\n');
  const out: string[] = [];
  let isInFence = false;
  let fenceMarker = '';
  let hasNote = false;

  /**
   * Rewrites a resolved MDN doc URL for output. In-scope release notes become
   * local paths; everything else becomes an absolute MDN URL.
   */
  const linkUrl = (documentUrl: string): string => {
    const resolved = mdn.resolve(documentUrl);
    const release = RELEASE_NOTE_PATH.exec(resolved);
    if (release !== null) {
      const [, version = '', anchor = ''] = release;
      const year = options.years.get(version);
      // Out-of-scope versions stay on MDN — there is no local page to link to.
      if (year !== undefined) {
        return `/release-notes/${String(year)}/${version}/${anchor}`;
      }
    }
    return MDN_BASE + resolved;
  };

  const context: MacroContext = { mdn, linkUrl };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    let line = lines[index] ?? '';

    // Fence tracking comes first, and compares against the opening marker so
    // a shorter run inside a longer fence doesn't close it.
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    const marker = fence?.[1];
    if (marker !== undefined) {
      if (isInFence) {
        if (
          marker[0] === fenceMarker[0] &&
          marker.length >= fenceMarker.length
        ) {
          isInFence = false;
          fenceMarker = '';
        }
      } else {
        isInFence = true;
        fenceMarker = marker;
      }
      out.push(line);
      continue;
    }
    if (isInFence) {
      out.push(line);
      continue;
    }

    // Alerts. Only `[!NOTE]` occurs in scope; anything else is an upstream
    // change worth looking at rather than silently downgrading.
    const alert = ALERT.exec(line);
    if (alert !== null) {
      const indent = alert[1] ?? '';
      const kind = (alert[2] ?? '').toUpperCase();
      if (kind !== 'NOTE') {
        throw new ConvertError(
          file,
          lineNumber,
          `unsupported alert type [!${kind}] — only [!NOTE] has a component`,
        );
      }
      hasNote = true;

      // The alert body is the blockquote lines that follow, at the same
      // indentation. Consume them here and advance the outer index past them.
      const quoted = new RegExp(String.raw`^${indent}>\s?`);
      const content: string[] = [];
      let cursor = index + 1;
      while (quoted.test(lines[cursor] ?? '')) {
        content.push((lines[cursor] ?? '').replace(quoted, ''));
        cursor += 1;
      }
      index = cursor - 1;

      out.push(`${indent}<Note>`);
      for (const [offset, text] of content.entries()) {
        const converted = convertInline(
          text,
          context,
          file,
          lineNumber + offset + 1,
        );
        out.push(
          text === '' ? '' : `${indent}  ${escapeBareAngles(converted)}`,
        );
      }
      out.push(`${indent}</Note>`);
      continue;
    }

    // Definition lists: MDN's `- Term` / `  - : Definition` becomes pandoc's
    // `Term` / `: Definition`, which is what Sätteri's `definitionList`
    // feature implements.
    const definition = MDN_DEFINITION.exec(line);
    if (definition) {
      const termIndex = out.length - 1;
      const term = out.at(-1);
      if (term !== undefined) {
        // Unwrap the term from its list item, now that it isn't one.
        out[termIndex] = term.replace(/^(\s*)-\s+/, '');
        // Pandoc form needs a blank line between pairs. Without it the next
        // term is read as a continuation of this definition, and both pairs
        // collapse into a single `<dt>`/`<dd>`.
        if (termIndex > 0 && out[termIndex - 1]?.startsWith(': ')) {
          out.splice(termIndex, 0, '');
        }
      }
      line = `: ${definition[2] ?? ''}`;
    }

    // A `<!--` with no `-->` after it on the same line opens a comment that
    // spans lines. MDX has no HTML comments at all, so the whole block has to
    // become one `{/* … */}`; swapping the delimiters line by line would put
    // the opener and closer in separate expressions and fail to compile.
    const opener = line.indexOf('<!--');
    if (opener !== -1 && !line.includes('-->', opener)) {
      const block = [line];
      let cursor = index + 1;
      while (cursor < lines.length && !(lines[cursor] ?? '').includes('-->')) {
        block.push(lines[cursor] ?? '');
        cursor += 1;
      }
      if (cursor >= lines.length) {
        throw new ConvertError(file, lineNumber, 'unterminated HTML comment');
      }
      block.push(lines[cursor] ?? '');
      index = cursor;
      out.push(toMdxComment(block.join('\n'), file, lineNumber));
      continue;
    }

    // HTML comments: MDX reads `<!--` as a JSX tag and fails. Converting
    // rather than stripping keeps re-run diffs meaningful when an author
    // uncomments a heading upstream.
    line = toMdxComment(line, file, lineNumber);

    out.push(escapeBareAngles(convertInline(line, context, file, lineNumber)));
  }

  return { body: out.join('\n'), hasNote };
}

/**
 * Rewrites every `<!-- … -->` in a chunk of source as `{/* … *\/}`, MDX's
 * only comment form. The chunk is one line, or the whole of a comment that
 * spans lines.
 *
 * A `*\/` in the comment's own text would close the expression early and
 * can't be represented, so it stops the run rather than emitting a file that
 * won't compile. Nothing upstream contains one today.
 */
function toMdxComment(source: string, file: string, line: number): string {
  return source.replaceAll(/<!--([\s\S]*?)-->/g, (_, inner: string) => {
    if (inner.includes('*/')) {
      throw new ConvertError(file, line, 'HTML comment contains `*/`');
    }
    return `{/*${inner}*/}`;
  });
}

/**
 * Backslash-escapes a `<` that MDX would read as the start of a JSX tag and
 * then fail on, as in `(+, =, <, etc.)` and `Escape < and > in attributes`.
 *
 * Markdown prose is allowed a bare `<`; MDX is not, and the error it gives
 * ("Unexpected character after `<`") points at the line rather than the
 * construct. Only a `<` that can't legally open a tag is escaped, so real
 * elements — the 21 in-scope uses of `<code>`, `<kbd>` and `<sup>`, plus the
 * `<Note>` this converter emits — are left alone.
 *
 * Code spans are skipped: inside backticks a `<` is already literal, and
 * escaping there would put the backslash on the page.
 */
function escapeBareAngles(line: string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) =>
      // Odd indices are the captured code spans.
      index % 2 === 1
        ? part
        : part.replaceAll(/<(?![A-Za-z/!])/g, String.raw`\<`),
    )
    .join('');
}

/** Expands macros and rewrites doc links within one line. */
function convertInline(
  line: string,
  context: MacroContext,
  file: string,
  lineNumber: number,
): string {
  const expanded = expandMacros(line, context, file, lineNumber);

  // Prose links to MDN. Macro output is already absolute, so this only sees
  // links that were authored as doc paths.
  return expanded.replaceAll(DOC_LINK, (_, url: string) => {
    return `](${context.linkUrl(url)})`;
  });
}

function expandMacros(
  line: string,
  context: MacroContext,
  file: string,
  lineNumber: number,
): string {
  const macros = parseMacros(line);
  if (macros.length === 0) return line;

  // Right to left, so earlier offsets stay valid as the string is spliced.
  let result = line;
  for (const macro of macros.toReversed()) {
    let markdown: string;
    try {
      markdown = expandMacro(macro, context).markdown;
    } catch (error) {
      throw new ConvertError(
        file,
        lineNumber,
        error instanceof Error ? error.message : String(error),
      );
    }
    result = result.slice(0, macro.start) + markdown + result.slice(macro.end);
  }
  return result;
}
