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
