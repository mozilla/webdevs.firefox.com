import { defineConfig, fontProviders } from 'astro/config';

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';

import { writeCssModuleTypes } from './lib/css-module-types.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://webdevs.firefox.com',
  integrations: [preact(), mdx()],
  build: {
    format: 'preserve',
  },
  markdown: {
    processor: satteri({ features: { definitionList: true } }),
  },
  vite: {
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
  ],
});
