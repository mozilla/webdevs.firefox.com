import type { CollectionEntry } from 'astro:content';

export interface ReleaseNote {
  version: string;
  title: string;
  shortTitle: string;
  releaseDate: Date;
  year: string;
  href: string;
}

export function releaseNote(
  entry: CollectionEntry<'releaseNotes'>,
): ReleaseNote {
  const version = entry.data.version ?? entry.id;
  const { releaseDate } = entry.data;
  const year = String(releaseDate.getUTCFullYear());

  return {
    version,
    title:
      entry.data.title ?? `Firefox ${version} release notes for developers`,
    shortTitle: entry.data.shortTitle ?? `Firefox ${version}`,
    releaseDate,
    year,
    href: `/release-notes/${year}/${version}/`,
  };
}
