/**
 * Entry point for the static server, started by Playwright's
 * `webServer`. See `serve.ts` for why this is not `npx serve`.
 */
import { env, stdout } from 'node:process';

import { distributionDirectory } from './config.ts';
import { serve } from './serve.ts';

const port = Number(env['VRT_PORT'] ?? 4319);

await serve(distributionDirectory, port);
stdout.write(
  `[vrt] serving ${distributionDirectory} on http://localhost:${String(port)}\n`,
);
