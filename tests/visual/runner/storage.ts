/**
 * The storage interface the runner talks to, and the local implementation
 * standing in for a bucket until a provider is chosen.
 *
 * The plan's storage model is one folder per baseline, named by a hash of
 * its contents, with stable human-readable names inside:
 *
 * ```text
 * baselines/<hash>/<target>/<browser>/<width>/<scheme>.png
 * ```
 *
 * Everything above this interface is written against those five methods, so
 * swapping in GCS, S3 or R2 is a new implementation of {@link Storage} and
 * nothing else. `copy` and the hash on `list` are the two the design leans
 * on: accepting server-side-copies the previous baseline folder to the new
 * hash and overwrites only what changed, and hydrating reads every object's
 * hash from a single listing so it can skip what the local cache already
 * holds. GCS exposes that hash as `md5Hash` on `objects.list`, S3 and R2 as
 * the ETag, which is a plain MD5 below the multipart threshold — and PNGs
 * this size are far below it.
 *
 * MD5 rather than something modern for exactly that reason: it is not a
 * security boundary here, it is the hash the object stores already return,
 * and choosing anything else would mean fetching bytes to compute it.
 */
import { createHash } from 'node:crypto';
import {
  mkdir,
  copyFile,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

/** One stored object, as a listing reports it. */
export interface StoredObject {
  /** Key relative to the store root, `/`-separated. */
  key: string;
  /** MD5 of the bytes, hex — what the cloud providers hand back. */
  hash: string;
  /** Size in bytes. */
  size: number;
  /** Last modification time, used by the garbage collector's grace period. */
  modified: Date;
}

export interface Storage {
  /** Every object whose key starts with `prefix`. */
  list(prefix: string): Promise<StoredObject[]>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Server-side where the provider supports it; a file copy here. */
  copy(from: string, to: string): Promise<void>;
  /** Removes everything under a prefix. Whole folders only — see the plan. */
  remove(prefix: string): Promise<void>;
  /** A URL a human can open, for PR comments. */
  publicUrl(key: string): string;
}

/** MD5 of a buffer, hex — the hash the cloud providers report. */
export const hashBytes = (body: Buffer): string =>
  createHash('md5').update(body).digest('hex');

/**
 * A {@link Storage} backed by a directory on disk.
 *
 * This is what the local workflow runs against while there is no bucket. It
 * is not a mock — the runner has no other implementation yet, and the
 * accept, hydrate and compare flow is fully exercised through it.
 */
export class FileStorage implements Storage {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  #path(key: string): string {
    return path.join(this.#root, ...key.split('/'));
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const base = this.#path(prefix);
    const found: StoredObject[] = [];

    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        /* A prefix with nothing under it lists empty, as a bucket would —
           there are no directories in an object store, so "missing" and
           "empty" are the same answer. */
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }

      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
          continue;
        }

        const [body, stats] = await Promise.all([
          readFile(entryPath),
          stat(entryPath),
        ]);
        found.push({
          key: path.relative(this.#root, entryPath).split(path.sep).join('/'),
          hash: hashBytes(body),
          size: stats.size,
          modified: stats.mtime,
        });
      }
    };

    await walk(base);
    return found.toSorted((a, b) => a.key.localeCompare(b.key));
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.#path(key));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.#path(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async copy(from: string, to: string): Promise<void> {
    const target = this.#path(to);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.#path(from), target);
  }

  async remove(prefix: string): Promise<void> {
    await rm(this.#path(prefix), { recursive: true, force: true });
  }

  publicUrl(key: string): string {
    return `file://${this.#path(key)}`;
  }
}
