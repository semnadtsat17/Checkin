// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'hr' | 'manager' | 'employee' | 'part_time';

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  firstNameTh: string;
  lastNameTh: string;
  email: string;
  phone?: string;
  role: UserRole;
  workSchedulePatternId?: string;  // Work Schedule Pattern assigned to this employee
  departmentId: string;
  branchId: string;
  positionId?: string;
  startDate?: string;              // YYYY-MM-DD — employment start date
  monthlyHoursOverride?: number;   // part-time: overrides default monthly hours
  mustChangePassword?: boolean;    // true after HR generates/resets a password
  managerDepartments?: string[];   // dept IDs this manager is allowed to manage (manager role only)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Work Schedule Pattern ────────────────────────────────────────────────────
// Defines the shift time format for a group of employees.
// (formerly called "SubRole" — renamed for clarity: this is NOT a job role,
//  it is a template of shift codes + time ranges + monthly working hours.)

/**
 * A single shift definition embedded inside a WorkSchedulePattern.
 *
 * Time invariant:
 *   startTime ALWAYS belongs to the date the shift is assigned to.
 *   isOvernight=false → endTime is on the SAME calendar day.
 *   isOvernight=true  → endTime is on the NEXT calendar day.
 *
 * Special midnight sentinel:
 *   endTime="00:00" with isOvernight=false represents "ends exactly at midnight"
 *   (i.e. 24:00 same day). normalizeHhmm() handles this via end≤start detection.
 *   Example: "บ 16:00–24:00" → startTime "16:00", endTime "00:00", isOvernight false.
 *
 * Cross-midnight example:
 *   "N 20:00–08:00" → startTime "20:00", endTime "08:00", isOvernight true.
 *
 * Dawn shift (starts at midnight, same day):
 *   "ด 00:00–08:00" → startTime "00:00", endTime "08:00", isOvernight false.
 *
 * Forbidden state: startTime="00:00" AND isOvernight=true.
 *   normalizeHhmm() cannot detect this case — it must be prevented at input
 *   and rejected by backend validation (INVALID_SHIFT_CONFIGURATION).
 */
export interface WorkSchedulePatternShift {
  code:         string;   // short label: D, N, ช, บ, ด …
  nameTh:       string;
  nameEn?:      string;
  startTime:    string;   // HH:mm
  endTime:      string;   // HH:mm  ("00:00" = midnight-end or midnight-start)
  isOvernight:  boolean;  // true = crosses midnight
  breakMinutes: number;   // paid/unpaid break duration
}

export type WorkSchedulePatternType = 'SHIFT_TIME' | 'WEEKLY_WORKING_TIME';

/**
 * One day's entry in a WEEKLY_WORKING_TIME pattern.
 * dayOfWeek follows JS Date.getDay() convention: 0 = Sunday, 1 = Monday … 6 = Saturday.
 */
export interface WeeklyScheduleDay {
  dayOfWeek: number;  // 0–6
  startTime: string;  // HH:mm
  endTime:   string;  // HH:mm
}

export interface WorkSchedulePattern {
  id: string;
  nameTh: string;
  nameEn?: string;
  forRole: UserRole;                       // which role group this pattern applies to
  type: WorkSchedulePatternType;           // 'SHIFT_TIME' (default) | 'WEEKLY_WORKING_TIME'
  monthlyWorkingHours: number;             // total contracted hours per month
  shifts: WorkSchedulePatternShift[];      // used when type = SHIFT_TIME
  weeklySchedule?: WeeklyScheduleDay[];    // used when type = WEEKLY_WORKING_TIME
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use WorkSchedulePatternShift */
export type SubRoleShift = WorkSchedulePatternShift;
/** @deprecated Use WorkSchedulePattern */
export type SubRole = WorkSchedulePattern;

// ─── Department ───────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  nameTh: string;
  nameEn: string;
  branchId: string;
  managerId?: string;
  workSchedulePatternId?: string;  // Work Schedule Pattern used by this department
  requireHrApproval?: boolean;     // if true, schedule submissions must be approved by HR before publishing
  holidayTypeId?: string;          // FK → HolidayType.id; undefined = no holiday policy
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  nameTh: string;
  nameEn: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'early_leave'
  | 'on_leave'
  | 'holiday'
  | 'pending_approval';  // check-in with no scheduled shift — awaits manager review

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;            // YYYY-MM-DD
  checkInTime?: string;    // ISO datetime
  checkOutTime?: string;   // ISO datetime
  checkInPhoto?: string;   // file path or base64 ref
  checkOutPhoto?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  status: AttendanceStatus;
  note?: string;
  editRequestId?: string;
  approvedBy?: string;      // userId of manager who approved a pending_approval record
  rejectedBy?: string;      // userId of manager who rejected a pending_approval record
  createdAt: string;
  updatedAt: string;
}

// ─── Edit Request ─────────────────────────────────────────────────────────────

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface EditRequest {
  id: string;
  attendanceId: string;
  requestedBy: string;    // userId of manager who submitted the request
  approvedBy?: string;    // userId of HR who approved
  rejectedBy?: string;    // userId of HR who rejected
  rejectReason?: string;  // HR's rejection note
  reason: string;         // manager's stated reason for change
  originalData: Partial<AttendanceRecord>;
  requestedData: Partial<AttendanceRecord>;
  status: EditRequestStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Work Schedule ────────────────────────────────────────────────────────────

export interface ShiftSchedule {
  id: string;
  nameTh: string;
  nameEn: string;
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  breakMinutes: number;
  isOvernight: boolean;
}

/**
 * Optional time override for a single day — replaces the SubRole's default
 * shift times without permanently changing the SubRole template.
 */
export interface ScheduleTimeOverride {
  startTime:    string;   // HH:mm
  endTime:      string;   // HH:mm
  isOvernight?: boolean;
  breakMinutes?: number;
}

/**
 * One day's assignment inside a WorkSchedule.
 * shiftCode references SubRole.shifts[].code (D, N, ช, บ, ด …).
 * null = unassigned (not a day-off, just no shift set yet).
 */
export interface ScheduleDay {
  shiftCode:     string | null;    // primary shift (first of shiftCodes, kept for backward compat)
  shiftCodes?:   string[];         // all assigned shifts for multi-shift days
  isDayOff:      boolean;
  timeOverride?: ScheduleTimeOverride;
  note?:         string;
}

export interface WorkSchedule {
  id: string;
  userId: string;
  weekStart: string;                    // YYYY-MM-DD
  days: Record<string, ScheduleDay>;   // key = YYYY-MM-DD
  createdBy: string;                    // userId of assigning manager/hr
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Extra Working Time ───────────────────────────────────────────────────────

export type ExtraWorkReason = 'ot' | 'compensate' | 'training' | 'meeting' | 'other';

/**
 * A manually created working-time block that overlays on top of the normal
 * shift schedule.  Supports both SHIFT_TIME and WEEKLY_WORKING_TIME departments.
 * Never auto-converted into a shift — it is always an additional entry.
 */
export interface ExtraWork {
  id:            string;
  employeeId:    string;
  departmentId:  string;
  date:          string;          // YYYY-MM-DD
  startTime:     string;          // HH:mm
  endTime:       string;          // HH:mm
  reason:        ExtraWorkReason;
  customReason?: string;          // required when reason === 'other'
  /**
   * Draft/publish lifecycle — mirrors ScheduleDayRecord.status.
   * 'draft'     — saved by manager; invisible to employees.
   * 'published' — explicitly published; visible to employees.
   * undefined   — legacy record (created before this field existed); treated as 'published'.
   */
  status?:       'draft' | 'published';
  /**
   * Soft-delete timestamp.
   * Set by remove() instead of a hard delete so the deletion stays invisible
   * to employees until publishDays() is called (which then hard-deletes the row).
   * undefined = not deleted.
   */
  deletedAt?:    string;
  createdBy:     string;
  createdAt:     string;
  updatedAt:     string;
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

export type OvertimeStatus = 'pending' | 'approved' | 'rejected';

export interface OvertimeRequest {
  id: string;
  userId: string;
  date: string;         // YYYY-MM-DD
  startTime: string;    // HH:mm
  endTime: string;      // HH:mm
  durationMinutes: number;
  reason: string;
  approvedBy?: string;
  status: OvertimeStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Schedule Approval ────────────────────────────────────────────────────────

export type ScheduleApprovalStatus = 'pending_hr_approval' | 'published' | 'rejected';

/**
 * Tracks the HR approval lifecycle for a department's monthly schedule.
 * One record per (departmentId, month) submission attempt.
 */
export interface ScheduleApproval {
  id: string;
  departmentId: string;
  month: string;                          // YYYY-MM
  status: ScheduleApprovalStatus;
  submittedBy: string;                    // manager userId
  submittedAt: string;                    // ISO datetime
  reviewedBy?: string;                    // HR userId
  reviewedAt?: string;                    // ISO datetime
  rejectReason?: string;
  requireHrApprovalSnapshot: boolean;     // value of dept.requireHrApproval at submit time
  createdAt: string;
  updatedAt: string;
}

// ─── Holiday Policy ───────────────────────────────────────────────────────────

/**
 * A named collection of holiday dates managed by HR.
 * Departments reference one HolidayType via holidayTypeId.
 */
export interface HolidayType {
  id:          string;
  name:        string;
  createdAt:   string;
  updatedAt:   string;
}

/**
 * A single recurring holiday entry belonging to a HolidayType.
 * date is stored as MM-DD (e.g. "04-13" for Songkran) and matches yearly.
 * enabled can be toggled without deleting the record.
 */
export interface HolidayDate {
  id:            string;
  typeId:        string;   // FK → HolidayType.id
  name:          string;   // e.g. "วันสงกรานต์"
  date:          string;   // MM-DD
  enabled:       boolean;
  createdAt:     string;
  updatedAt:     string;
}

// ─── Department Transfer ──────────────────────────────────────────────────────

/**
 * Audit trail record created every time HR transfers an employee to a new department.
 * The `effectiveDate` drives which schedule records are cleared / regenerated.
 */
export interface DepartmentAssignment {
  id: string;
  userId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveDate: string;   // YYYY-MM-DD — schedules from this date onward are migrated
  transferredBy: string;   // HR userId who initiated the transfer
  createdAt: string;
  updatedAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type AppNotificationType =
  | 'schedule_approved'
  | 'schedule_rejected'
  | 'schedule_pending';

export interface AppNotification {
  id: string;
  userId: string;                 // recipient
  type: AppNotificationType;
  title: string;
  body: string;
  relatedId?: string;             // scheduleApprovalId
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}
