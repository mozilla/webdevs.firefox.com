/**
 * One test per shot: page × width × scheme, within a browser project.
 *
 * The shot's name is its key in the store —
 * `<target>/<browser>/<width>/<scheme>.png` — and `snapshotPathTemplate`
 * writes it straight into `.vrt/baseline/`, so hydrating a baseline folder
 * into that directory needs no translation between the two layouts.
 *
 * A test per shot rather than one test looping over widths, so the report
 * names the thing that changed and a failure at 375 doesn't stop 1440 from
 * being captured.
 *
 * Every capture is also written to `.vrt/current/` under that same key,
 * whether it matched or not. `toHaveScreenshot` does write a changed shot
 * to the results directory, but under Playwright's own flattened naming of
 * the *test* rather than the snapshot path — and recovering a key with
 * slashes in it from a name that joined them with `-` is ambiguous the
 * moment a segment contains a hyphen, which `firefox-beta` does. Writing
 * the file ourselves means `pnpm vrt:accept` reads an unambiguous tree, and
 * it gets the unchanged shots too, so accept never has to merge the run
 * with the hydrated baseline to reconstruct what the run produced.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import {
  targets,
  targetRoute,
  targetSchemes,
  targetWidths,
  VIEWPORT_HEIGHT,
} from '../targets.ts';
import { currentDirectoryFor, tier } from './config.ts';

const currentDirectory = currentDirectoryFor(tier());

for (const target of targets) {
  test.describe(target.id, () => {
    for (const width of targetWidths(target)) {
      for (const scheme of targetSchemes(target)) {
        test(`${String(width)} ${scheme}`, async ({ page }, testInfo) => {
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

          await page.goto(targetRoute(target), { waitUntil: 'load' });

          /*
           * Both families are variable webfonts, and without this you
           * intermittently screenshot the fallback. `load` is not enough on
           * its own: a font is fetched by the CSS that references it, and
           * that fetch can still be in flight when `load` fires.
           */
          /* eslint-disable-next-line unicorn/isolated-functions --
             `document` is the page's, not this module's: the body of a
             `page.evaluate` callback is serialised and run in the browser,
             which the rule cannot see. */
          await page.evaluate(() => document.fonts.ready);

          /*
           * The key as path segments, not as one slashed string. Playwright
           * sanitises a string name before using it as a file path, and
           * that turns every `/` into `-` — the baseline tree would come
           * out flat as `buttons-firefox-1440-light.png` while the store's
           * layout is nested, and a name with a hyphen already in it
           * (`firefox-beta`) could not be parsed back. An array is joined
           * with the path separator instead, so the two layouts agree.
           */
          const segments = [
            target.id,
            testInfo.project.name,
            String(width),
            `${scheme}.png`,
          ];
          const key = segments.join('/');

          /*
           * Taken once and asserted against, rather than letting
           * `toHaveScreenshot` capture its own: the matcher retakes until
           * two consecutive frames agree, so a second independent capture
           * could differ from the one it settled on. Passing the buffer
           * means the bytes accepted are exactly the bytes compared.
           */
          const shot = await page.screenshot({
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
            scale: 'device',
          });

          /*
           * Re-compress before storing. The browsers optimise for capture
           * speed rather than size, and `zlib` level 9 over the same pixels
           * takes roughly 30% off — most of it from the tall `fullPage`
           * shots, which are the ones that dominate a baseline.
           *
           * This is lossless by construction: `sharp` re-encodes the
           * decoded pixels and PNG's filter-and-deflate has no lossy mode,
           * so only the encoding changes. Keeping the format is the point —
           * a smaller format like JPEG XL would save more, but Playwright
           * picks its comparator from the file extension and implements
           * only PNG and JPEG, so anything else means decoding both sides
           * by hand and giving up the report's Diff and Slider views.
           */
          const stored = await sharp(shot)
            .png({ compressionLevel: 9, effort: 10 })
            .toBuffer();

          const file = path.join(currentDirectory, key);
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, stored);

          /*
           * Compared as stored, so that what a baseline holds is exactly
           * what a later run is checked against — comparing the raw capture
           * and storing the re-encode would leave the two a step apart.
           */
          expect(stored).toMatchSnapshot(segments);
        });
      }
    }
  });
}
