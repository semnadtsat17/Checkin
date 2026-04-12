/**
 * attendanceApprovalRepo.ts
 *
 * Repository for AttendanceApproval records.
 *
 * Backed by JsonRepository (JSON file storage), which implements IRepository<T>.
 * Swap to PostgresRepository or any other IRepository adapter without touching
 * this file or its callers — the interface is identical.
 *
 * Collection file: <dataDir>/attendance_approvals.json
 */
import type { BaseEntity } from '../../../shared/storage/JsonStorageService';
import { JsonRepository } from '../../../shared/repository/JsonRepository';

// ─── Record shape ─────────────────────────────────────────────────────────────

export type ApprovalType   = 'LATE' | 'OT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AttendanceApprovalRecord extends BaseEntity {
  employeeId:  string;
  type:        ApprovalType;
  minutes:     number;
  status:      ApprovalStatus;
  /** ISO datetime — set when a manager reviews the record. */
  reviewedAt?: string;
  /** userId of the manager who reviewed. */
  reviewerId?: string;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateApprovalData = Omit<
  AttendanceApprovalRecord,
  'id' | 'createdAt' | 'updatedAt' | 'reviewedAt' | 'reviewerId'
>;

// ─── Repository ───────────────────────────────────────────────────────────────

const repo = new JsonRepository<AttendanceApprovalRecord>('attendance_approvals');

/**
 * Insert a new approval record.
 * Callers must only invoke this when status === 'PENDING'.
 * That guard lives in the service layer, not here.
 */
export function createApproval(data: CreateApprovalData): AttendanceApprovalRecord {
  return repo.create(data);
}

/**
 * Return all records with status === 'PENDING', newest first.
 */
export function getPendingApprovals(): AttendanceApprovalRecord[] {
  return repo
    .findMany((r) => r.status === 'PENDING')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Return all records matching the given status, newest first.
 */
export function getApprovalsByStatus(status: ApprovalStatus): AttendanceApprovalRecord[] {
  return repo
    .findMany((r) => r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Return every approval record, newest first.
 */
export function getAllApprovals(): AttendanceApprovalRecord[] {
  return repo
    .findAll()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Return all approvals for a specific employee, newest first.
 */
export function getApprovalsByEmployee(employeeId: string): AttendanceApprovalRecord[] {
  return repo
    .findMany((r) => r.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Find a single record by id.
 */
export function getApprovalById(id: string): AttendanceApprovalRecord | null {
  return repo.findById(id);
}

/**
 * Transition a record's status to APPROVED or REJECTED and stamp the reviewer.
 * Returns the updated record, or null if the id does not exist.
 */
export function updateApprovalStatus(
  id:         string,
  status:     'APPROVED' | 'REJECTED',
  reviewerId: string,
): AttendanceApprovalRecord | null {
  return repo.updateById(id, {
    status,
    reviewerId,
    reviewedAt: new Date().toISOString(),
  });
}

/**
 * Returns true when an unresolved (PENDING) approval already exists for this
 * employee + type combination.  Used by the service layer to prevent duplicates.
 */
export function hasPendingApproval(
  employeeId: string,
  type:       ApprovalType,
): boolean {
  return repo.exists(
    (r) => r.employeeId === employeeId && r.type === type && r.status === 'PENDING',
  );
}

/** Exposed for tests only — clears all records. */
export function _clearForTests(): void {
  repo.clear();
}
