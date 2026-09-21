/**
 * Runs a VRT command inside the container.
 *
 * Every `pnpm vrt*` script goes through here, so the browsers and their
 * font stack are the image's rather than the host's. Running the underlying
 * scripts directly on a host works and is useful for debugging, but the
 * pixels will not match a baseline accepted from the container.
 *
 * The repository is bind-mounted rather than copied in, so an edit-run loop
 * does not rebuild the image. `node_modules` is mounted too: the image and
 * the host are the same platform here — Docker Desktop runs an arm64 Linux
 * VM on an Apple Silicon machine — but a native module built for macOS
 * would not load in the container, so the install is redone into an
 * anonymous volume that shadows the host's copy.
 */
import { spawn } from 'node:child_process';
import { argv, env, exit, stdout } from 'node:process';

import { repoRoot } from './config.ts';

const IMAGE = 'webdevs-firefox-vrt:local';

const run = (command: string, arguments_: string[]): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repoRoot,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

/** Whether the image exists locally. */
const hasImage = async (): Promise<boolean> =>
  (await run('docker', ['image', 'inspect', IMAGE])) === 0;

const command = argv.slice(2);

if (!(await hasImage())) {
  stdout.write(`[vrt] building ${IMAGE} — first run only\n`);
  const built = await run('docker', [
    'build',
    '-f',
    'tests/visual/Dockerfile',
    '-t',
    IMAGE,
    'tests/visual',
  ]);
  if (built !== 0) exit(built);
}

/*
 * `--ipc=host` because Chromium's default 64MB /dev/shm makes it crash on
 * large pages, which a `fullPage` capture of the prose specimen certainly
 * is. `--init` so a browser that outlives the run is reaped rather than
 * left as a zombie holding the container open.
 */
const code = await run('docker', [
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  '-v',
  `${repoRoot}:/work`,
  '-v',
  '/work/node_modules',
  '-w',
  '/work',
  ...(env['VRT_TIER'] === undefined
    ? []
    : ['-e', `VRT_TIER=${env['VRT_TIER']}`]),
  ...(command[0] === 'shell' ? ['-it'] : []),
  IMAGE,
  'bash',
  '-lc',
  command[0] === 'shell'
    ? 'pnpm install --frozen-lockfile && exec bash'
    : `pnpm install --frozen-lockfile && ${command.join(' ')}`,
]);

exit(code);
