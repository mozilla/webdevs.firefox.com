/**
 * Splits KumaScript macro calls out of a line of markdown.
 *
 * A brace-counting scan rather than a regex, because one in-scope macro
 * argument contains braces of its own:
 *
 *     {{WebExtAPIRef("windows.update","windows.update(windowId, { focused: true })")}}
 *
 * A `\{\{[^}]*\}\}` pattern stops at the wrong `}`. That call only survives on
 * MDN because `WebExtAPIRef` code-wraps its output by default, so the brace
 * never reaches MDX as an expression — worth knowing if a macro that emits
 * bare text ever gains a brace.
 */

const QUOTES = new Set(['"', "'"]);
const OPENERS = new Set(['(', '{', '[']);
const CLOSERS = new Set([')', '}', ']']);

export interface ParsedMacro {
  name: string;
  args: string[];
  /** Offsets of the whole `{{…}}` within the input. */
  start: number;
  end: number;
}

/**
 * Splits a macro's argument list on top-level commas, respecting quotes and
 * nesting, then strips one layer of matching quotes from each argument.
 *
 * Unquoted numeric arguments occur (`{{RFC(3550, "", "6.4.1")}}`) and come
 * back as the string `"3550"`, which is what the macros expect.
 */
function splitArguments(raw: string): string[] {
  if (raw.trim() === '') return [];
  const arguments_: string[] = [];
  let current = '';
  let quote: string | undefined;
  let depth = 0;

  for (const char of raw) {
    if (quote !== undefined) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (QUOTES.has(char)) {
      quote = char;
      current += char;
      continue;
    }
    if (OPENERS.has(char)) depth += 1;
    else if (CLOSERS.has(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      arguments_.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  arguments_.push(current);

  return arguments_.map((argument) => {
    const trimmed = argument.trim();
    const isQuoted =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"));
    return isQuoted && trimmed.length >= 2 ? trimmed.slice(1, -1) : trimmed;
  });
}

/**
 * Finds the offset of the `)` closing the `(` at `openIndex`, or -1 if the
 * parentheses are unbalanced. Quote-aware, so a `)` inside a string argument
 * doesn't end the list early.
 */
function findCloseParen(line: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = openIndex; index < line.length; index += 1) {
    const char = line[index];
    if (char === undefined) break;
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (QUOTES.has(char)) {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Finds every macro call in a line, in source order. */
export function parseMacros(line: string): ParsedMacro[] {
  const found: ParsedMacro[] = [];
  let index = 0;

  while (index < line.length) {
    const start = line.indexOf('{{', index);
    if (start === -1) break;

    const nameMatch = /^\{\{\s*([A-Za-z_][\w-]*)\s*/.exec(line.slice(start));
    const name = nameMatch?.[1];
    if (nameMatch === null || name === undefined) {
      index = start + 2;
      continue;
    }

    let cursor = start + nameMatch[0].length;
    let arguments_: string[] = [];

    if (line[cursor] === '(') {
      const close = findCloseParen(line, cursor);
      if (close === -1) {
        index = start + 2;
        continue;
      }
      arguments_ = splitArguments(line.slice(cursor + 1, close));
      cursor = close + 1;
    }

    const closeMatch = /^\s*\}\}/.exec(line.slice(cursor));
    if (!closeMatch) {
      index = start + 2;
      continue;
    }

    const end = cursor + closeMatch[0].length;
    found.push({ name: name.toLowerCase(), args: arguments_, start, end });
    index = end;
  }

  return found;
}

export interface Frontmatter {
  keys: Map<string, string>;
  body: string;
}

/** Splits YAML frontmatter from the body. MDN's keys are all flat scalars. */
export function parseFrontmatter(source: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  const block = match?.[1];
  if (match === null || block === undefined) {
    throw new Error('no frontmatter');
  }

  const keys = new Map<string, string>();
  const lines = block.split('\n');
  for (const line of lines) {
    const entry = /^([\w-]+):\s*(.*)$/.exec(line);
    const [, key, value] = entry ?? [];
    if (key !== undefined && value !== undefined) keys.set(key, value.trim());
  }
  return { keys, body: source.slice(match[0].length) };
}
