import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Resolves MDN doc URLs against a checkout of `mdn/content`.
 *
 * The KumaScript macros build URLs that were correct when they were written:
 * `HTMLElement` emits `/Web/HTML/Element/a`, whereas MDN now serves
 * `/Web/HTML/Reference/Elements/a`. The prose links in these same files
 * already use the current paths, so passing the macro URLs through unchanged
 * would make a converted page link inconsistently with itself and take a
 * redirect hop on every macro link.
 *
 * Three things resolve a URL, in order of how much they are trusted:
 *
 * 1. `files/en-us/_redirects.txt`, MDN's own tab-separated `from<TAB>to`
 *    table, which is authoritative for pages that have moved.
 * 2. The slug index below, which fixes casing. MDN slugs are mixed-case and
 *    case-sensitive, so `Glossary/asynchronous` is a redirect to
 *    `Glossary/Asynchronous` — 19 links took a hop for this reason alone.
 * 3. For macros only, a suffix search — see `locate`.
 *
 * The index covers every page in `files/en-us`, not just the trees a
 * particular macro needs. Walking 14,660 pages and reading the first 1 KB of
 * each takes about 1.5 seconds, which is cheaper than reasoning about which
 * subset is enough, and it is the same data `web.smartLink()` consults in
 * Yari.
 */

export const MDN_BASE = 'https://developer.mozilla.org';
const DOCS_PREFIX = '/en-US/docs/';

/** Enough of a page to cover its frontmatter. */
const HEAD_BYTES = 1024;

interface Page {
  /** The slug as written, which is the authority for casing. */
  slug: string;
  pageType: string | undefined;
}

export class Mdn {
  readonly #redirects = new Map<string, string>();
  /** Lower-cased slug → page. */
  readonly #pages = new Map<string, Page>();
  /** Lower-cased final slug segment → the lower-cased slugs ending in it. */
  readonly #byLeaf = new Map<string, string[]>();

  constructor(root: string) {
    this.#loadRedirects(root);
    this.#indexPages(root);
  }

  #loadRedirects(root: string): void {
    const file = path.join(root, '_redirects.txt');
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      // Keyed lower-case: the table's `from` column is lower-cased, while the
      // macros build mixed-case URLs.
      this.#redirects.set(
        line.slice(0, tab).trim().toLowerCase(),
        line.slice(tab + 1).trim(),
      );
    }
  }

  #indexPages(root: string): void {
    const walk = (directory: string): void => {
      const entries = readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.name === 'index.md') this.#indexPage(child);
      }
    };
    walk(root);
  }

  #indexPage(file: string): void {
    const head = readHead(file);
    const slug = frontmatterValue(head, 'slug');
    if (slug === undefined) return;

    const key = slug.toLowerCase();
    this.#pages.set(key, {
      slug,
      pageType: frontmatterValue(head, 'page-type'),
    });

    const leaf = key.slice(key.lastIndexOf('/') + 1);
    const list = this.#byLeaf.get(leaf);
    if (list) list.push(key);
    else this.#byLeaf.set(leaf, [key]);
  }

  /** The indexed page a doc URL names, after following redirects. */
  #page(documentUrl: string): Page | undefined {
    return this.#pages.get(slugKey(this.#followRedirects(documentUrl)[0]));
  }

  /**
   * Follows `_redirects.txt` to a fixed point, guarding against cycles.
   * Returns the path and the hash that should be appended to it.
   */
  #followRedirects(url: string): [string, string] {
    const [pathPart, hash] = splitHash(url);
    let current = pathPart;
    const seen = new Set<string>();
    for (;;) {
      const key = current.toLowerCase();
      if (seen.has(key)) break;
      seen.add(key);
      const next = this.#redirects.get(key);
      if (next === undefined) break;
      // A redirect target may carry its own anchor, which wins over ours only
      // when we don't have one — MDN's own resolution order.
      const [nextPath, nextHash] = splitHash(next);
      current = nextPath;
      if (nextHash && !hash) return [current, nextHash];
    }
    return [current, hash];
  }

  /**
   * The slug of the page a lower-cased slug key most likely meant, out of the
   * pages sharing its last segment.
   *
   * Narrowed first by the longest run of *leading* segments any candidate
   * shares, which is what says `Web/CSS/param` means the CSS `param()`
   * function rather than HTML's `<param>` element — both are pages whose slug
   * ends in `param`.
   *
   * Then, if that leaves more than one, by the longest run of *trailing*
   * segments that names exactly one of them: `web/http/headers/…` picks out
   * `Web/HTTP/Reference/Headers/…` on `headers/…`, the section having gained
   * a `Reference` level in the middle.
   *
   * Ambiguity that survives both is left unresolved rather than guessed at.
   */
  #search(key: string): string | undefined {
    const parts = key.split('/');
    const leaf = parts.at(-1);
    if (leaf === undefined) return undefined;
    const candidates = this.#byLeaf.get(leaf);
    if (candidates === undefined) return undefined;

    let best = candidates;
    for (let depth = 1; depth < parts.length; depth += 1) {
      const prefix = `${parts.slice(0, depth).join('/')}/`;
      const narrowed = best.filter((c) => c.startsWith(prefix));
      if (narrowed.length === 0) break;
      best = narrowed;
    }
    if (best.length === 1) return this.#pages.get(best[0] ?? '')?.slug;

    for (let start = 1; start < parts.length; start += 1) {
      const suffix = parts.slice(start).join('/');
      const matches = best.filter((c) => c.endsWith(`/${suffix}`));
      if (matches.length === 1) return this.#pages.get(matches[0] ?? '')?.slug;
      if (matches.length > 1 && start === parts.length - 1) {
        // A bare CSS name matching both a property and an at-rule descriptor
        // — `font-width` is both — is the property. That is how MDN reads an
        // unqualified name; a descriptor is always written with its at-rule
        // (`@font-face/font-width`), which a longer suffix already caught.
        const property = matches.find((c) =>
          c.includes(`/properties/${suffix}`),
        );
        return property === undefined
          ? undefined
          : this.#pages.get(property)?.slug;
      }
    }
    return undefined;
  }

  /**
   * The URL MDN serves for a doc URL: redirects followed, then casing taken
   * from the target page's own `slug`.
   *
   * Deliberately exact. A URL naming no page comes back unchanged rather than
   * being guessed at, which is what keeps this safe to run over the prose
   * links as well as the macro-built ones.
   */
  resolve(url: string): string {
    const [pathPart, hash] = this.#followRedirects(url);
    const page = this.#pages.get(slugKey(pathPart));
    return (page === undefined ? pathPart : DOCS_PREFIX + page.slug) + hash;
  }

  /**
   * `resolve`, plus `#search` for pages it can't place.
   *
   * `_redirects.txt` only records pages that have *moved*. A reference page
   * created in the same release cycle as the note citing it was never
   * anywhere else, so it is absent from the table — and release notes cite
   * new features by definition. Without this, `{{httpheader}}` for a header
   * introduced in Firefox 145 is left on `/Web/HTTP/Headers/Integrity-Policy`,
   * which 404s, while every other header link on the page resolves.
   *
   * Macros only. Prose links were authored against current paths, so a prose
   * link `resolve` can't place is a genuinely dead link, and pointing it at a
   * same-named page would turn a visible 404 into a silently wrong
   * destination.
   */
  locate(url: string): string {
    const [pathPart, hash] = splitHash(this.resolve(url));
    if (this.#pages.has(slugKey(pathPart))) return pathPart + hash;

    const found = this.#search(slugKey(pathPart));
    return (found === undefined ? pathPart : DOCS_PREFIX + found) + hash;
  }

  /** Whether a doc URL names a page that exists, exactly. */
  pageExists(documentUrl: string): boolean {
    return this.#page(documentUrl) !== undefined;
  }

  /**
   * The `page-type` frontmatter of a doc URL's target.
   *
   * `cssxref` branches on this: a `css-function` gets `()` appended to its
   * link text and a `css-type` gets wrapped in `<…>`, so without it 430 of the
   * in-scope calls would render the wrong text.
   */
  pageType(documentUrl: string): string | undefined {
    return this.#page(documentUrl)?.pageType;
  }
}

/** Reads the first `HEAD_BYTES` of a file, which is where frontmatter lives. */
function readHead(file: string): string {
  const descriptor = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(descriptor, buffer, 0, HEAD_BYTES, 0);
    return buffer.toString('utf8', 0, read);
  } finally {
    closeSync(descriptor);
  }
}

/** Reads one scalar key out of a YAML frontmatter block. */
function frontmatterValue(source: string, key: string): string | undefined {
  const end = source.indexOf('\n---', 4);
  const frontmatter = end === -1 ? source : source.slice(0, end);
  const match = new RegExp(String.raw`^${key}:\s*(.+)$`, 'm').exec(frontmatter);
  return match?.[1]?.trim().replaceAll(/^["']|["']$/g, '');
}

/** The `#pages` key for a doc URL: its slug, lower-cased. */
function slugKey(documentPath: string): string {
  return documentPath.startsWith(DOCS_PREFIX)
    ? documentPath.slice(DOCS_PREFIX.length).toLowerCase()
    : ' ';
}

function splitHash(url: string): [string, string] {
  const hash = url.indexOf('#');
  return hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash)];
}
