import { Branch } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';

// ── Repository ─────────────────────────────────────────────────────────────

const branchStore: IRepository<Branch> = new JsonRepository<Branch>('branches');

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateBranchDto {
  nameTh:        string;
  nameEn:        string;
  address?:      string;
  latitude?:     number;
  longitude?:    number;
  radiusMeters?: number;
}

export interface UpdateBranchDto {
  nameTh?:       string;
  nameEn?:       string;
  address?:      string;
  latitude?:     number;
  longitude?:    number;
  radiusMeters?: number;
  isActive?:     boolean;
}

export interface BranchFilters {
  isActive?: boolean;
  search?:   string;   // matches nameTh or nameEn
}

// ── Helpers ───────────────────────────────────────────────────────────────

function validateGps(lat?: number, lon?: number, radius?: number): void {
  if (lat !== undefined && (lat < -90 || lat > 90)) {
    throw new AppError(400, 'Latitude must be between -90 and 90');
  }
  if (lon !== undefined && (lon < -180 || lon > 180)) {
    throw new AppError(400, 'Longitude must be between -180 and 180');
  }
  if (radius !== undefined && radius <= 0) {
    throw new AppError(400, 'Radius must be greater than 0');
  }
}

function hasGps(b: Branch): boolean {
  return (
    b.latitude  !== undefined && b.latitude  !== null &&
    b.longitude !== undefined && b.longitude !== null &&
    b.radiusMeters !== undefined && b.radiusMeters !== null
  );
}

// ── Service ───────────────────────────────────────────────────────────────

export const branchService = {

  findAll(filters: BranchFilters = {}) {
    let items = branchStore.findAll();

    if (filters.isActive !== undefined) {
      items = items.filter(b => b.isActive === filters.isActive);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        b => b.nameTh.toLowerCase().includes(q) ||
             b.nameEn.toLowerCase().includes(q),
      );
    }

    return items;
  },

  findById(id: string): Branch {
    const branch = branchStore.findById(id);
    if (!branch) throw new AppError(404, 'Branch not found');
    return branch;
  },

  create(dto: CreateBranchDto): Branch {
    if (!dto.nameTh?.trim()) throw new AppError(400, 'nameTh is required');
    if (!dto.nameEn?.trim()) throw new AppError(400, 'nameEn is required');

    validateGps(dto.latitude, dto.longitude, dto.radiusMeters);

    // Duplicate name check (active branches only)
    const duplicate = branchStore.findOne(
      b => b.isActive &&
           b.nameTh.toLowerCase() === dto.nameTh.trim().toLowerCase(),
    );
    if (duplicate) throw new AppError(409, 'Branch name already exists');

    return branchStore.create({
      nameTh:        dto.nameTh.trim(),
      nameEn:        dto.nameEn.trim(),
      address:       dto.address?.trim(),
      latitude:      dto.latitude,
      longitude:     dto.longitude,
      radiusMeters:  dto.radiusMeters,
      isActive:      true,
    });
  },

  update(id: string, dto: UpdateBranchDto): Branch {
    const branch = branchService.findById(id);

    validateGps(dto.latitude, dto.longitude, dto.radiusMeters);

    if (dto.nameTh !== undefined && dto.nameTh.trim() === '') {
      throw new AppError(400, 'nameTh cannot be empty');
    }
    if (dto.nameEn !== undefined && dto.nameEn.trim() === '') {
      throw new AppError(400, 'nameEn cannot be empty');
    }

    // Duplicate name check (skip self)
    if (dto.nameTh) {
      const dup = branchStore.findOne(
        b => b.id !== id &&
             b.isActive &&
             b.nameTh.toLowerCase() === dto.nameTh!.trim().toLowerCase(),
      );
      if (dup) throw new AppError(409, 'Branch name already exists');
    }

    const updated = branchStore.updateById(id, {
      ...(dto.nameTh       !== undefined && { nameTh:       dto.nameTh.trim() }),
      ...(dto.nameEn       !== undefined && { nameEn:       dto.nameEn.trim() }),
      ...(dto.address      !== undefined && { address:      dto.address.trim() }),
      ...(dto.latitude     !== undefined && { latitude:     dto.latitude }),
      ...(dto.longitude    !== undefined && { longitude:    dto.longitude }),
      ...(dto.radiusMeters !== undefined && { radiusMeters: dto.radiusMeters }),
      ...(dto.isActive     !== undefined && { isActive:     dto.isActive }),
    });

    return updated!;
  },

  /**
   * Update only the GPS fence (latitude, longitude, radiusMeters).
   * Convenience method for the PATCH /branches/:id/gps endpoint.
   */
  setGps(id: string, latitude: number, longitude: number, radiusMeters: number): Branch {
    branchService.findById(id); // 404 guard
    validateGps(latitude, longitude, radiusMeters);

    const updated = branchStore.updateById(id, { latitude, longitude, radiusMeters });
    return updated!;
  },

  /**
   * Remove GPS fence from a branch (check-in becomes location-free).
   */
  clearGps(id: string): Branch {
    branchService.findById(id); // 404 guard
    const updated = branchStore.updateById(id, {
      latitude:      undefined,
      longitude:     undefined,
      radiusMeters:  undefined,
    } as any);
    return updated!;
  },

  remove(id: string): void {
    branchService.findById(id); // 404 guard
    branchStore.softDelete(id);
  },

  /** Exported for use by the check-in service in STEP 10. */
  hasGpsFence: hasGps,
};
