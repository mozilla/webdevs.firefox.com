import type { CollectionEntry } from 'astro:content';

export interface ReleaseNote {
  version: string;
  /** The sub-page segment, or `undefined` for the release's own page. */
  subPage: string | undefined;
  title: string;
  shortTitle: string;
  releaseDate: Date;
  year: string;
  href: string;
}

export function releaseNote(
  entry: CollectionEntry<'releaseNotes'>,
): ReleaseNote {
  // The id is the directory path: `3` for a release, `3/updating_extensions`
  // for one of its sub-pages.
  const [idVersion = '', subPage] = entry.id.split('/', 2);
  const version = entry.data.version ?? idVersion;
  const { releaseDate } = entry.data;
  const year = String(releaseDate.getUTCFullYear());

  // A sub-page's title is carried across from MDN, because it is prose that
  // the version number can't reconstruct; a release page's is derived.
  return {
    version,
    subPage,
    title:
      entry.data.title ?? `Firefox ${version} release notes for developers`,
    shortTitle: entry.data.shortTitle ?? `Firefox ${version}`,
    releaseDate,
    year,
    href: `/release-notes/${year}/${version}/${subPage ? `${subPage}/` : ''}`,
  };
}
