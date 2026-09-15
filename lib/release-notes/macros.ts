import type { Mdn } from './mdn.ts';

/**
 * Ports the 13 KumaScript macros the in-scope release notes use.
 *
 * The originals are EJS templates in `mdn/yari`, under
 * `kumascript/macros/*.ejs`; each macro below cites the file it came from.
 * They emit HTML because KumaScript runs before the markdown parser. We are
 * generating source files a human will read in a diff, so these emit the
 * markdown equivalent instead: ``[`text`](url)``, never `<a><code>`.
 *
 * Two behaviours in the originals can't be ported and are replaced rather
 * than dropped:
 *
 * - `web.smartLink()` resolves a link against the whole content repo and
 *   flags links to pages that don't exist. `Mdn` does the same against the
 *   checkout: `_redirects.txt`, then the page's own `slug`, then a suffix
 *   search for pages neither knows about (see `mdn.ts`).
 * - The macros build legacy URLs that MDN now redirects. Every URL here goes
 *   through `Mdn.locate` so the output matches what MDN serves today, and
 *   what the prose links in these same files already use.
 *
 * Anything not in this table is a hard error — the closed list is what makes
 * the error-on-unknown rule enforceable.
 */

export interface MacroCall {
  name: string;
  args: string[];
}

export interface MacroContext {
  mdn: Mdn;
  /** Rewrites a resolved MDN doc URL for output; see `convert.ts`. */
  linkUrl: (documentUrl: string) => string;
}

/** A macro's markdown output: link text plus the URL it points at. */
interface Link {
  text: string;
  url: string;
  /** Whether the text is wrapped in backticks. */
  code: boolean;
}

function render({ text, url, code }: Link): string {
  const label = code ? `\`${text}\`` : text;
  return `[${label}](${url})`;
}

/**
 * The trailing `$3` on several macros means "do not put the text in code".
 * KumaScript treats any non-empty argument as set, including the string "0".
 */
function isSet(argument: string | undefined): argument is string {
  return argument !== undefined && argument !== '';
}

/**
 * The shared shape of `WebExtAPIRef`, `HTTPHeader`, `HTTPMethod` and `CSP`:
 * `$0` path, `$1` display text, `$2` anchor — which is also appended to the
 * text as `.$2` — and `$3` to suppress code formatting.
 */
function anchorSuffixMacro(
  arguments_: string[],
  basePath: string,
  slugify: (api: string) => string,
): Link {
  const api = arguments_[0] ?? '';
  let text = arguments_[1] || api;
  let url = basePath + slugify(api);
  const anchor = arguments_[2];
  if (isSet(anchor)) {
    text += `.${anchor}`;
    url += `#${anchor}`;
  }
  return { text, url, code: !isSet(arguments_[3]) };
}

type MacroFunction = (arguments_: string[], context: MacroContext) => Link;

const MACROS: Record<string, MacroFunction> = {
  /** `DOMxRef.ejs` */
  domxref(arguments_) {
    const api = (arguments_[0] ?? '')
      .replaceAll(' ', '_')
      .replaceAll('()', '')
      .replaceAll('.prototype.', '.')
      .replaceAll('.', '/');
    // "Ensure Interfaces are always uppercased in links."
    const slug = api.charAt(0).toUpperCase() + api.slice(1);
    let text = arguments_[1] || (arguments_[0] ?? '');
    let url = `/en-US/docs/Web/API/${slug}`;
    const anchor = arguments_[2];
    if (isSet(anchor)) {
      text += `.${anchor}`;
      url += `#${anchor}`;
    }
    return { text, url, code: !isSet(arguments_[3]) };
  },

  /**
   * `cssxref.ejs`
   *
   * The original calls `wiki.getPage()` for the target's `page-type` and uses
   * it to append `()` to functions and wrap types in `<…>`. That lookup is
   * load-bearing for 430 of the in-scope calls, so it is reproduced against
   * the checkout rather than skipped.
   */
  cssxref(arguments_, { mdn }) {
    const raw = decodeEntities(arguments_[0] ?? '');
    const display = arguments_[1] ?? '';
    const anchor = arguments_[2] ?? '';

    let slug = raw.replace(/^<(.*)>$/, '$1').replaceAll('()', '');
    // Special-cased on MDN because the bare names collide with properties.
    if (/^<(color|flex|overflow|position)>$/.test(raw)) slug += '_value';
    if (/^(:host|fit-content)\(\)$/.test(raw)) slug += '_function';

    const target = mdn.locate(`/en-US/docs/Web/CSS/${slug}`);
    let text = display || raw.slice(raw.lastIndexOf('/') + 1);

    if (!display) {
      const pageType = mdn.pageType(target);
      if (pageType === 'css-function' && !text.endsWith('()')) text += '()';
      if (pageType === 'css-type' && !/^<.+>$/.test(text)) text = `<${text}>`;
    }
    return { text, url: target + anchor, code: true };
  },

  /**
   * `jsxref.ejs`
   *
   * `Array.prototype.at()` is documented at `Global_Objects/Array/at`, but
   * `Statements/try...catch` sits directly under the reference root. The
   * original picks between them with `wiki.hasPage`; this does the same
   * against the checkout, which resolves all 157 distinct in-scope slugs.
   */
  jsxref(arguments_, { mdn }) {
    const api = arguments_[0] ?? '';
    const base = '/en-US/docs/Web/JavaScript/Reference/';

    let slug = api.replace('()', '').replace('.prototype.', '.');
    // E.g. "Array.filter", but not "Statements/try...catch".
    if (api.includes('.') && !api.includes('/')) slug = slug.replace('.', '/');

    // `Array.prototype.at()` lives under `Global_Objects/`, while
    // `Statements/try...catch` sits at the reference root. Fall back to the
    // direct path when neither exists, matching the original's behaviour.
    const globalObjects = `${base}Global_Objects/${slug}`;
    let url = base + slug;
    if (!mdn.pageExists(url) && mdn.pageExists(globalObjects)) {
      url = globalObjects;
    }

    const anchor = arguments_[2] ?? '';
    return {
      text: arguments_[1] || api,
      url: anchor ? `${url}${anchor.startsWith('#') ? '' : '#'}${anchor}` : url,
      code: !isSet(arguments_[3]),
    };
  },

  /** `HTMLElement.ejs` */
  htmlelement(arguments_) {
    const element = (arguments_[0] ?? '').toLowerCase();
    const given = arguments_[1] ?? '';
    const url = `/en-US/docs/Web/HTML/Element/${element}${arguments_[2] ?? ''}`;
    // The original angle-brackets the text only when it wasn't overridden and
    // is a single word, so "the img element" stays prose.
    const isBare = !given || given === element;
    return isBare && !element.includes(' ')
      ? { text: `<${element}>`, url, code: true }
      : { text: given || element, url, code: false };
  },

  /** `SVGElement.ejs` */
  svgelement(arguments_) {
    const term = arguments_[0] ?? '';
    return {
      text: `<${term}>`,
      url: `/en-US/docs/Web/SVG/Element/${term}`,
      code: true,
    };
  },

  /** `SVGAttr.ejs` */
  svgattr(arguments_) {
    const attribute = arguments_[0] ?? '';
    return {
      text: attribute,
      url: `/en-US/docs/Web/SVG/Attribute/${attribute}`,
      code: true,
    };
  },

  /** `MathMLElement.ejs` */
  mathmlelement(arguments_) {
    const name = arguments_[0] ?? '';
    return {
      text: `<${name}>`,
      url: `/en-US/docs/Web/MathML/Element/${name}`,
      code: true,
    };
  },

  /** `Glossary.ejs` — note this one does *not* wrap its text in code. */
  glossary(arguments_) {
    const term = arguments_[0] ?? '';
    return {
      text: arguments_[1] || term,
      url: `/en-US/docs/Glossary/${term.replaceAll(/\s+/g, '_')}`,
      code: false,
    };
  },

  /** `WebExtAPIRef.ejs` */
  webextapiref(arguments_) {
    return anchorSuffixMacro(
      arguments_,
      '/en-US/docs/Mozilla/Add-ons/WebExtensions/API/',
      // Note `.replace`, not `.replaceAll`, in the original: only the first
      // space and first `()` are stripped.
      (api) => api.replace(' ', '_').replace('()', '').replaceAll('.', '/'),
    );
  },

  /** `httpheader.ejs` */
  httpheader(arguments_) {
    return anchorSuffixMacro(
      arguments_,
      '/en-US/docs/Web/HTTP/Headers/',
      (h) => h,
    );
  },

  /** `HTTPMethod.ejs` */
  httpmethod(arguments_) {
    return anchorSuffixMacro(arguments_, '/en-US/docs/Web/HTTP/Methods/', (m) =>
      // "Methods are always uppercase" — but the link text keeps `$0` as
      // written, which `anchorSuffixMacro` already does.
      m.toUpperCase(),
    );
  },

  /** `CSP.ejs` */
  csp(arguments_) {
    return anchorSuffixMacro(
      arguments_,
      '/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/',
      (d) => d,
    );
  },

  /**
   * `RFC.ejs` — the one macro that links off MDN, so its URL is returned
   * as-is rather than resolved.
   */
  rfc(arguments_) {
    const number = arguments_[0] ?? '';
    let url = `https://datatracker.ietf.org/doc/html/rfc${number}`;
    let text = `RFC ${number}`;
    const section = arguments_[2];
    const name = arguments_[1];
    if (isSet(section)) {
      url += `#section-${section}`;
      text += `, section ${section}`;
    }
    if (isSet(name)) text += `: ${name}`;
    return { text, url, code: false };
  },
};

export const MACRO_NAMES: ReadonlySet<string> = new Set(Object.keys(MACROS));

export interface MacroResult {
  markdown: string;
  /** The doc URL before output rewriting, for reporting. */
  docUrl: string;
}

/** Expands one macro call, or throws if its name isn't in the table. */
export function expandMacro(
  call: MacroCall,
  context: MacroContext,
): MacroResult {
  const macro = MACROS[call.name];
  if (!macro) {
    throw new Error(`unknown macro {{${call.name}}}`);
  }
  const link = macro(call.args, context);
  const isExternal = /^https?:/.test(link.url);
  // `locate` rather than `resolve`: a macro builds the URL a page had when
  // the macro was written, so it is exactly the case the suffix search exists
  // for. Prose links skip it — see `Mdn.locate`.
  const url = isExternal
    ? link.url
    : context.linkUrl(context.mdn.locate(link.url));
  return { markdown: render({ ...link, url }), docUrl: link.url };
}

/**
 * The source writes `&lt;length&gt;` inside macro arguments, because
 * KumaScript HTML-escapes them before the macro sees them. The ported macros
 * work on the unescaped text.
 */
function decodeEntities(text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}
