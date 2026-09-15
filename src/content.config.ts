import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Firefox release notes
 */
const releaseNotes = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/content/release-notes',
  }),
  schema: z.object({
    title: z.string().optional(),
    shortTitle: z.string().optional(),
    version: z.string().optional(),
    releaseDate: z.date(),
  }),
});

export const collections = { releaseNotes };
