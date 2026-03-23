/**
 * JsonRepository<T> — IRepository adapter backed by JsonStorageService.
 *
 * Every public method delegates directly to JsonStorageService.
 *
 * Swap to a real database:
 *   Create PostgresRepository<T> (or any other adapter) that implements
 *   IRepository<T> using the new driver. Replace `new JsonRepository<X>()`
 *   calls in each service with `new PostgresRepository<X>()`. The service
 *   layer requires zero changes because it only depends on IRepository<T>.
 */

import { JsonStorageService } from '../storage/JsonStorageService';
import type {
  BaseEntity,
  Predicate,
  PaginateOptions,
  PageResult,
} from '../storage/JsonStorageService';
import type { IRepository } from './IRepository';

export class JsonRepository<T extends BaseEntity> implements IRepository<T> {
  private readonly store: JsonStorageService<T>;

  /**
   * @param collection  Name of the JSON file (without .json extension).
   *                    Equivalent to a database table name.
   */
  constructor(collection: string) {
    this.store = new JsonStorageService<T>(collection);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  findAll(filter?: Predicate<T>): T[] {
    return this.store.findAll(filter);
  }

  findById(id: string): T | null {
    return this.store.findById(id);
  }

  findOne(predicate: Predicate<T>): T | null {
    return this.store.findOne(predicate);
  }

  findMany(predicate: Predicate<T>): T[] {
    return this.store.findMany(predicate);
  }

  count(predicate?: Predicate<T>): number {
    return this.store.count(predicate);
  }

  exists(predicate: Predicate<T>): boolean {
    return this.store.exists(predicate);
  }

  paginate(options?: PaginateOptions<T>): PageResult<T> {
    return this.store.paginate(options);
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
    return this.store.create(data);
  }

  updateById(id: string, patch: Partial<Omit<T, 'id' | 'createdAt'>>): T | null {
    return this.store.updateById(id, patch);
  }

  updateOne(
    predicate: Predicate<T>,
    patch: Partial<Omit<T, 'id' | 'createdAt'>>,
  ): T | null {
    return this.store.updateOne(predicate, patch);
  }

  deleteById(id: string): boolean {
    return this.store.deleteById(id);
  }

  softDelete(id: string): T | null {
    return this.store.softDelete(id);
  }

  transaction(transform: (items: T[]) => T[]): T[] {
    return this.store.transaction(transform);
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  seed(records: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): void {
    this.store.seed(records);
  }

  clear(): void {
    this.store.clear();
  }
}
