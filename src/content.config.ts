import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Firefox release notes
 */
const releaseNotes = defineCollection({
  loader: glob({
    pattern: '**/index.mdx',
    base: './src/content/release-notes',
    /*
     * The directory path, verbatim. Astro's default runs every path segment
     * through `github-slugger`, which drops the dot from a version: `1.5`
     * becomes `15`, collides with Firefox 15, and one of the two entries
     * silently replaces the other — no error, just a missing page at a URL
     * that is wrong anyway. The ids here are already the URL segments we
     * want, so there is nothing to slugify.
     */
    generateId: ({ entry }) => entry.replace(/\/index\.mdx$/, ''),
  }),
  schema: z.object({
    title: z.string().optional(),
    shortTitle: z.string().optional(),
    version: z.string().optional(),
    releaseDate: z.date(),
  }),
});

export const collections = { releaseNotes };
