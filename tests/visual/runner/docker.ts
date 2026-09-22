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
 * would not load in the container, so the install is redone into a volume
 * that shadows the host's copy.
 *
 * That volume and the cache beside it are **named**, and the anonymous
 * volume they replaced was the run's largest fixed cost. Docker seeds an
 * anonymous volume from the image, and the image has nothing at a path
 * that only exists inside the bind mount, so it arrived empty every
 * `docker run` — every run reinstalled the whole tree from the registry,
 * and corepack re-downloaded pnpm, before a single screenshot was taken.
 * Measured at 11.6s per run against 0.6s once the volumes persist.
 *
 * `pnpm install --frozen-lockfile` still runs each time, so a persisted
 * volume cannot drift from the lockfile — it reconciles or it fails. If
 * one is ever wedged, `docker volume rm` it and the next run rebuilds it.
 */
import { spawn } from 'node:child_process';
import { argv, env, exit, stdout } from 'node:process';

import { repoRoot } from './config.ts';

const IMAGE = 'webdevs-firefox-vrt:local';

/** Survives `docker run --rm`, so the install is paid once. */
const MODULES_VOLUME = 'webdevs-firefox-vrt-node-modules';
/** pnpm's store and corepack's download of pnpm itself. */
const CACHE_VOLUME = 'webdevs-firefox-vrt-cache';
/** Inside {@link CACHE_VOLUME}, so a cold install has the tarballs. */
const STORE_DIRECTORY = '/root/.cache/pnpm-store';

const run = (
  command: string,
  arguments_: string[],
  /* `inherit` for the real work, so Docker's own progress is the run's
     progress. `ignore` for anything asked only for its exit code. */
  stdio: 'inherit' | 'ignore' = 'inherit',
): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repoRoot,
      stdio,
      env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

/**
 * `run`, for the one binary everything here needs.
 *
 * `spawn` reports a missing executable as an `error` event, so without
 * this a machine with no Docker gets an unhandled ENOENT stack trace
 * naming `spawn docker` — which is the one fact it does explain, buried
 * under ten frames that explain nothing.
 */
const docker = async (
  arguments_: string[],
  stdio?: 'inherit' | 'ignore',
): Promise<number> => {
  try {
    return await run('docker', arguments_, stdio);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    stdout.write(
      '[vrt] docker is not on PATH — the suite only runs in the container\n',
    );
    return exit(1);
  }
};

/** Whether the image exists locally. Asked for the exit code alone — left
    on `inherit` it printed the image's whole JSON before every run, or the
    daemon's "No such image" before every build. */
const hasImage = async (): Promise<boolean> =>
  (await docker(['image', 'inspect', IMAGE], 'ignore')) === 0;

const command = argv.slice(2);

if (!(await hasImage())) {
  stdout.write(`[vrt] building ${IMAGE} — first run only\n`);
  const built = await docker([
    'build',
    '-f',
    'tests/visual/Dockerfile',
    '-t',
    IMAGE,
    'tests/visual',
  ]);
  if (built !== 0) exit(built);
}

const install = `pnpm install --frozen-lockfile --store-dir ${STORE_DIRECTORY}`;

/*
 * `--ipc=host` because Chromium's default 64MB /dev/shm makes it crash on
 * large pages, which a `fullPage` capture of the prose specimen certainly
 * is. `--init` so a browser that outlives the run is reaped rather than
 * left as a zombie holding the container open.
 */
const code = await docker([
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  '-v',
  `${repoRoot}:/work`,
  '-v',
  `${MODULES_VOLUME}:/work/node_modules`,
  '-v',
  `${CACHE_VOLUME}:/root/.cache`,
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
    ? `${install} && exec bash`
    : `${install} && ${command.join(' ')}`,
]);

exit(code);
