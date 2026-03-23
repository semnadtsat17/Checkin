/**
 * JsonStorageService<T>
 *
 * Simulates a database collection backed by a JSON file.
 * Designed so every public method can be replaced 1-for-1 with a DB driver
 * call during migration (same method signatures, same return shapes).
 *
 * Collections are isolated per-instance and stored as:
 *   <dataDir>/<collection>.json
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';

// ─── Base entity shape every stored record must satisfy ────────────────────────

export interface BaseEntity {
  id: string;
  createdAt: string;   // ISO datetime
  updatedAt: string;   // ISO datetime
}

// ─── Query / pagination types ─────────────────────────────────────────────────

export type Predicate<T> = (item: T) => boolean;
export type SortOrder = 'asc' | 'desc';

export interface SortOptions<T> {
  field: keyof T;
  order?: SortOrder;
}

export interface PaginateOptions<T> {
  page?: number;        // 1-based, default 1
  pageSize?: number;    // default 20
  filter?: Predicate<T>;
  sort?: SortOptions<T>;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function now(): string {
  return new Date().toISOString();
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class JsonStorageService<T extends BaseEntity> {
  private readonly filePath: string;

  constructor(private readonly collection: string) {
    ensureDataDir();
    this.filePath = path.join(config.dataDir, `${collection}.json`);
  }

  // ── Internal read / write ──────────────────────────────────────────────────

  private read(): T[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as T[];
    } catch {
      return [];
    }
  }

  private write(data: T[]): void {
    ensureDataDir();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  /** Return all records, optionally filtered by a predicate. */
  findAll(filter?: Predicate<T>): T[] {
    const all = this.read();
    return filter ? all.filter(filter) : all;
  }

  /** Return record by primary key or null. */
  findById(id: string): T | null {
    return this.read().find((item) => item.id === id) ?? null;
  }

  /** Return first record matching predicate or null. */
  findOne(predicate: Predicate<T>): T | null {
    return this.read().find(predicate) ?? null;
  }

  /** Return all records matching predicate. */
  findMany(predicate: Predicate<T>): T[] {
    return this.read().filter(predicate);
  }

  /** Count records, optionally scoped to a predicate. */
  count(predicate?: Predicate<T>): number {
    const all = this.read();
    return predicate ? all.filter(predicate).length : all.length;
  }

  /** Check existence without loading full result set. */
  exists(predicate: Predicate<T>): boolean {
    return this.read().some(predicate);
  }

  /**
   * Paginate with optional filter + sort.
   * Mirrors typical ORM .findAndCount() shape.
   */
  paginate(options: PaginateOptions<T> = {}): PageResult<T> {
    const { page = 1, pageSize = 20, filter, sort } = options;

    let items = filter ? this.read().filter(filter) : this.read();

    if (sort) {
      const { field, order = 'asc' } = sort;
      items = [...items].sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return order === 'asc' ? cmp : -cmp;
      });
    }

    const total = items.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return { items: paged, total, page: safePage, pageSize, totalPages };
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  /**
   * Insert a new record.
   * `id`, `createdAt`, `updatedAt` are auto-generated if omitted.
   */
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
    const all = this.read();
    const record = {
      ...data,
      id: uuidv4(),
      createdAt: now(),
      updatedAt: now(),
    } as T;
    all.push(record);
    this.write(all);
    return record;
  }

  /**
   * Patch a record by id.
   * `updatedAt` is always refreshed. `id` / `createdAt` are protected.
   */
  updateById(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): T | null {
    const all = this.read();
    const idx = all.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch, id, createdAt: all[idx].createdAt, updatedAt: now() };
    this.write(all);
    return all[idx];
  }

  /**
   * Update the first record matching predicate.
   * Returns updated record or null.
   */
  updateOne(predicate: Predicate<T>, patch: Partial<Omit<T, 'id' | 'createdAt'>>): T | null {
    const all = this.read();
    const idx = all.findIndex(predicate);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch, id: all[idx].id, createdAt: all[idx].createdAt, updatedAt: now() };
    this.write(all);
    return all[idx];
  }

  /** Hard-delete by id. Returns true if a record was removed. */
  deleteById(id: string): boolean {
    const all = this.read();
    const filtered = all.filter((item) => item.id !== id);
    if (filtered.length === all.length) return false;
    this.write(filtered);
    return true;
  }

  /** Soft-delete — sets `isActive: false` and stamps `updatedAt`. */
  softDelete(id: string): T | null {
    return this.updateById(id, { isActive: false } as unknown as Partial<Omit<T, 'id' | 'createdAt'>>);
  }

  // ── Atomic helpers (simulate transactions) ────────────────────────────────

  /**
   * Read-modify-write with a user-supplied transform.
   * The transform receives the current array and must return the new array.
   * The write only happens if the transform doesn't throw.
   */
  transaction(transform: (items: T[]) => T[]): T[] {
    const current = this.read();
    const next = transform([...current]);   // clone so transform can't mutate
    this.write(next);
    return next;
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  /** Wipe the entire collection (useful for tests / seeds). */
  clear(): void {
    this.write([]);
  }

  /** Seed — inserts only if collection is empty. */
  seed(records: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): void {
    if (this.count() > 0) return;
    records.forEach((r) => this.create(r));
  }
}
