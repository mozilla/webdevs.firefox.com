import {
  defineConfig,
  fontProviders,
  passthroughImageService,
} from 'astro/config';

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';

import { writeCssModuleTypes } from './lib/css-module-types.ts';
import { codeTheme } from './lib/markdown/code-theme.ts';
import { codeWidths } from './lib/markdown/code-widths/plugin.ts';
import { transformerIndentWrap } from './lib/markdown/code-widths/indent-wrap.ts';
import { definitionGroups } from './lib/markdown/definition-groups.ts';
import { looseBlocks } from './lib/markdown/loose-blocks.ts';
import { proseComponents } from './lib/markdown/prose-components.ts';
import { tableScroll } from './lib/markdown/table-scroll.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://webdevs.firefox.com',
  integrations: [preact(), mdx()],
  build: {
    format: 'preserve',
  },
  image: {
    /*
     * Don't re-encode images. We're professionals. Honest.
     */
    service: passthroughImageService(),
  },
  markdown: {
    shikiConfig: {
      /* Syntax colors from the design's Code * variables */
      theme: codeTheme,
      /* Responsive code block widths */
      transformers: [transformerIndentWrap()],
    },
    processor: satteri({
      features: { definitionList: true },
      mdastPlugins: [looseBlocks, codeWidths],
      hastPlugins: [definitionGroups, tableScroll],
    }),
  },
  vite: {
    server: {
      watch: {
        /*
         * A visual regression run writes continuously into `.vrt/` — the
         * built fixture site, every screenshot, and Playwright's trace
         * artifacts, which are thousands of small files. The dev server
         * has no reason to watch any of it, and left alone it logs a
         * `[watch]` line per file while a run is in progress.
         */
        ignored: ['**/.vrt/**'],
      },
    },
    build: {
      /*
       * The oldest browsers Lightning CSS, which minifies the built CSS, may
       * assume. Left unset it assumes every browser implements every draft,
       * and writes some of them out: `animation-timeline: view()` came back
       * folded into the `animation` shorthand, a Level 2 syntax that was
       * withdrawn over a parsing ambiguity and that nothing implements, which
       * made the whole declaration invalid and the parallax silently dead in
       * the built site while dev, which doesn't minify, was fine. That is
       * parcel-bundler/lightningcss#1283, open, with an unreviewed fix in
       * #1306; Astro closed its own copy as upstream.
       *
       * The list has to keep a non-Chromium browser in it. Lightning CSS
       * takes the shorthand from MDN's data, which has Chrome supporting it
       * since 115 and records the caveat in a `partial_implementation` flag
       * that doesn't reach the check, so it folds whenever every listed
       * browser is Chromium. Firefox and Safari are what hold this open, not
       * the version numbers.
       *
       * Recent versions rather than a wide baseline, because the lowering it
       * does below them is worse than the modern syntax it avoids: an older
       * Safari or Firefox turns every `light-dark()` into a pair of rules and
       * flattens all the nesting, and lowered `light-dark()` no longer
       * answers to a pinned `color-scheme`, which is how the footer and the
       * code blocks get their colors. The numbers are where the narrowest
       * thing here already lands — `text-box` is Chrome 133 and Safari 18.2 —
       * so this is not a claim about what the site supports. Everything below
       * degrades, as it did before.
       *
       * It has to be `build.cssTarget`: the minify path spreads
       * `css.lightningcss` first and then overwrites `targets` with this.
       */
      cssTarget: ['chrome133', 'edge133', 'firefox145', 'safari18.2'],
    },
    plugins: [proseComponents()],
    resolve: {
      extensions: [
        '.astro',
        '.mjs',
        '.js',
        '.mts',
        '.ts',
        '.jsx',
        '.tsx',
        '.json',
      ],
    },
    css: {
      modules: {
        getJSON: writeCssModuleTypes,
      },
    },
  },
  fonts: [
    {
      // Local rather than Fontsource: Fontsource has no italic for this
      // family, and a family cannot span two providers.
      provider: fontProviders.local(),
      name: 'Mozilla Text',
      cssVariable: '--font-mozilla-text',
      options: {
        variants: [
          {
            weight: '200 700',
            style: 'normal',
            src: ['./src/assets/fonts/MozillaText-Variable.woff2'],
          },
          {
            weight: '200 700',
            style: 'italic',
            src: ['./src/assets/fonts/MozillaTextItalic-Variable.woff2'],
          },
        ],
      },
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Mozilla Headline',
      cssVariable: '--font-mozilla-headline',
      weights: ['200 700'],
      styles: ['normal'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Inconsolata',
      cssVariable: '--font-inconsolata',
      weights: ['200 900'],
      styles: ['normal'],
      fallbacks: ['monospace'],
    },
  ],
});
