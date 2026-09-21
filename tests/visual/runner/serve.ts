/**
 * A static file server for the built site.
 *
 * Small and local rather than a dependency, because the two things it has
 * to get right are both specific to this build and both silently produce a
 * *working* server that serves the wrong bytes:
 *
 * - **No SPA fallback.** `serve --single` rewrites every unmatched URL to
 *   `index.html`, so a typo'd target route returns the home page with a
 *   200 and the screenshot compares cleanly against the wrong content.
 *   Here a miss is a 404 and the test fails loudly.
 * - **`build.format: 'preserve'`** emits `__vrt/buttons.html`, not
 *   `__vrt/buttons/index.html`. A request for `/__vrt/buttons/` therefore
 *   has to try `<path>.html` with the trailing slash removed, which is the
 *   mapping Astro's own preview server applies and a generic static server
 *   does not.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** The file a URL path maps to, or undefined if nothing matches. */
const resolveFile = async (
  root: string,
  pathname: string,
): Promise<string | undefined> => {
  /* `normalize` after prefixing with the root would still let `..` escape,
     so normalise the URL path on its own and strip any leading traversal. */
  const clean = path
    .normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, '');
  const base = path.join(root, clean);

  const candidates = clean.endsWith('/')
    ? /* `preserve` writes `foo.html`, so try that before `foo/index.html`. */
      [`${base.replace(/\/$/, '')}.html`, path.join(base, 'index.html')]
    : [base, `${base}.html`, path.join(base, 'index.html')];

  for (const candidate of candidates) {
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      /* Try the next shape. */
    }
  }

  return undefined;
};

/** Starts the server and resolves once it is accepting connections. */
export const serve = (root: string, port: number): Promise<Server> => {
  const server = createServer((request, response) => {
    void (async () => {
      const { pathname } = new URL(
        request.url ?? '/',
        `http://localhost:${String(port)}`,
      );
      const file = await resolveFile(root, pathname);

      if (file === undefined) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end(`Not found: ${pathname}`);
        return;
      }

      response.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        /* The screenshots must reflect this build, not a cached earlier
           one — the browser is fresh each run, but the site is
           rebuilt in place and the URLs never change. */
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(response);
    })();
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      resolve(server);
    });
  });
};
