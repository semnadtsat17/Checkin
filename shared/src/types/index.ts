// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'admin'        // formerly hr_global — all-branch access, assigned by super_admin
  | 'hr_branch'    // branch-scoped HR, auto-created per branch
  | 'manager'
  | 'employee'
  | 'part_time';

// ─── Org Info (global, 1 record) ──────────────────────────────────────────────

export interface OrgInfo {
  id:           string;
  nameTh:       string;
  nameEn?:      string;
  logoPath?:    string;
  createdAt:    string;
  updatedAt:    string;
}

// ─── Branch Settings (per-branch, replaces global org_settings) ───────────────

export interface BranchSettings {
  id:                       string;
  branchId:                 string;

  // Attendance mode
  attendanceMode:           'NORMAL' | 'SIMPLE';
  requireManagerApproval:   boolean;

  // Snap Time Engine
  continuousGapMinutes:     number;
  retroApprovalMode:        'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';

  // Late / Absent thresholds
  checkInWindowMinutes:     number;   // minutes before shift start allowed to check in
  lateGraceMinutes:         number;   // minutes after shift start before "late"
  absentAfterMinutes:       number;   // minutes after shift start → auto absent (0 = off)
  earlyLeaveGraceMinutes:   number;   // minutes before shift end → early_leave

  // Checkout late
  checkoutLateThresholdMinutes: number;  // minutes after shift end before reason required (0 = off)

  // Consecutive shift bridge
  consecutiveShiftGapMinutes: number;   // gap ≤ this → no checkout required between shifts

  // in_progress auto-close
  maxInProgressHours:       number;   // hours before in_progress auto-closes (default 24)

  // Location
  locationEnabled:          boolean;

  // Photo
  requireCheckInPhoto:      boolean;
  requireCheckOutPhoto:     boolean;

  // OT
  otEnabled:                boolean;
  otStartAfterMinutes:      number;
  otRequireApproval:        boolean;

  // HR Report
  hrReportImageMode:        'ALWAYS' | 'ON_DEMAND' | 'OFF';

  createdAt:                string;
  updatedAt:                string;
}

// ─── User / Employee ──────────────────────────────────────────────────────────

/**
 * Shared personal data — same across all branches.
 * Branch-specific employment data lives in BranchMembership.
 * @see UserProfile for the combined view returned by the auth API
 */
export interface User {
  id: string;

  // Personal (shared)
  nationalId?:      string;
  firstName:        string;
  lastName:         string;
  firstNameTh:      string;
  lastNameTh:       string;
  email:            string;
  phone?:           string;
  dateOfBirth?:     string;   // YYYY-MM-DD

  // Derived: min(branchMembership.branchStartDate) across all branches
  // Not stored — computed on read
  startDate?:       string;   // YYYY-MM-DD earliest branch start

  mustChangePassword?: boolean;
  isActive:         boolean;
  createdAt:        string;
  updatedAt:        string;
}

/**
 * Branch-specific employment data for one (employee, branch) pair.
 * An employee can have multiple BranchMembership records (one per branch).
 */
export interface BranchMembership {
  id:                     string;
  userId:                 string;
  branchId:               string;

  employeeCode:           string;
  role:                   UserRole;
  departmentId:           string;
  positionId?:            string;
  workSchedulePatternId?: string;
  monthlyHoursOverride?:  number;   // part_time override
  managerDepartments?:    string[]; // dept IDs this manager oversees (manager role)

  branchStartDate:        string;   // YYYY-MM-DD — when they started at THIS branch
  isActive:               boolean;
  createdAt:              string;
  updatedAt:              string;
}

/**
 * Combined view returned by the auth API — personal User data + current-branch
 * employment context.  This is what the frontend stores as the logged-in user.
 */
export interface UserProfile extends User {
  role:                   UserRole;
  employeeCode:           string;
  departmentId:           string;
  branchId:               string;
  positionId?:            string;
  workSchedulePatternId?: string;
  monthlyHoursOverride?:  number;
  managerDepartments?:    string[];
  branchStartDate?:       string;
}

// ─── Admin Branch Access ──────────────────────────────────────────────────────

/**
 * Controls which branches an `admin` role user may access.
 * Managed by super_admin only.
 */
export interface AdminBranchAccess {
  id:           string;
  userId:       string;       // must have role = 'admin'
  branchIds:    string[];     // specific branches, OR ['*'] for all
  createdAt:    string;
  updatedAt:    string;
}

// ─── Work Schedule Pattern ────────────────────────────────────────────────────

export interface WorkSchedulePatternShift {
  code:         string;
  nameTh:       string;
  nameEn?:      string;
  startTime:    string;   // HH:mm
  endTime:      string;   // HH:mm
  isOvernight:  boolean;
  breakMinutes: number;
  otThresholdMinutes?: number;  // SHIFT_TIME: minutes past shift end before counting as OT
}

export type WorkSchedulePatternType = 'SHIFT_TIME' | 'WEEKLY_WORKING_TIME';

export interface WeeklyScheduleDay {
  dayOfWeek: number;  // 0 = Sunday … 6 = Saturday
  startTime: string;  // HH:mm
  endTime:   string;  // HH:mm
}

export interface WorkSchedulePattern {
  id:                   string;
  branchId:             string;   // per-branch
  nameTh:               string;
  nameEn?:              string;
  forRole:              UserRole;
  type:                 WorkSchedulePatternType;
  monthlyWorkingHours?: number;   // required for SHIFT_TIME, omitted for WEEKLY_WORKING_TIME
  shifts:               WorkSchedulePatternShift[];
  weeklySchedule?:      WeeklyScheduleDay[];
  importedFromBranchId?: string;  // set when imported from another branch
  isActive:             boolean;
  createdAt:            string;
  updatedAt:            string;
}

/** @deprecated Use WorkSchedulePatternShift */
export type SubRoleShift = WorkSchedulePatternShift;
/** @deprecated Use WorkSchedulePattern */
export type SubRole = WorkSchedulePattern;

// ─── Department ───────────────────────────────────────────────────────────────

export interface Department {
  id:                   string;
  branchId:             string;   // per-branch
  nameTh:               string;
  nameEn:               string;
  managerId?:           string;
  workSchedulePatternId?: string;
  requireHrApproval?:   boolean;
  holidayTypeId?:       string;

  // Approval chain for AdditionalWork / OT requests
  additionalWorkApprovalChain: 'manager_only' | 'hr_only' | 'manager_then_hr';

  isActive:             boolean;
  createdAt:            string;
  updatedAt:            string;
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface Branch {
  id:             string;
  nameTh:         string;
  nameEn:         string;
  province?:      string;
  address?:       string;
  latitude?:      number;
  longitude?:     number;
  radiusMeters?:  number;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'early_leave'
  | 'on_leave'
  | 'holiday'
  | 'in_progress'       // checked-in (no schedule), awaiting checkout
  | 'pending_approval'; // no-schedule + checked out → awaiting manager review

export type CheckInType =
  | 'NORMAL_CHECKIN'
  | 'OUT_OF_SCHEDULE_CHECKIN'
  | 'RETROACTIVE_CHECKIN';

export type CheckoutLateReason =
  | 'forgot'
  | 'extra_work'
  | 'compensate'
  | 'ot';

export interface AttendanceRecord {
  id:                   string;
  userId:               string;
  branchId:             string;
  date:                 string;             // YYYY-MM-DD (shift start date for overnight)
  shiftCode?:           string;             // null = single-shift day (backward compat)

  checkInTime?:         string;             // ISO datetime (actual)
  checkOutTime?:        string;             // ISO datetime (actual)
  checkInPhoto?:        string;
  checkOutPhoto?:       string;
  checkInLat?:          number;
  checkInLng?:          number;
  checkOutLat?:         number;
  checkOutLng?:         number;

  // Claimed times (out-of-schedule / checkout confirmation dialog)
  claimedCheckInTime?:  string;             // HH:mm — user-confirmed start
  claimedCheckOutTime?: string;             // HH:mm — user-confirmed end

  status:               AttendanceStatus;
  checkInType?:         CheckInType;
  outOfScheduleReason?: string;
  coveringForUserId?:   string;             // set when reason = "มาเข้าแทน"

  // Checkout late
  checkoutLateReason?:  CheckoutLateReason;
  forgotCheckout?:      boolean;            // true when HR approved "ลืม checkout"
  effectiveCheckOutTime?: string;           // shift end time used for hours when forgotCheckout

  // Consecutive shift bridge
  autoBridged?:         boolean;            // true when gap between shifts was auto-bridged

  // Shift transfer reference
  shiftTransferId?:     string;             // FK → ShiftTransferRequest (if shift was transferred)
  originalOwnerId?:     string;             // original employee who owned this shift before transfer

  note?:                string;
  editRequestId?:       string;
  approvedBy?:          string;
  rejectedBy?:          string;
  createdAt:            string;
  updatedAt:            string;
}

// ─── Additional Work Record ───────────────────────────────────────────────────

export type AdditionalWorkReason = 'extra_work' | 'compensate' | 'ot' | 'covering';

export type AdditionalWorkHourType = 'regular' | 'ot';

export type AdditionalWorkStatus =
  | 'pending'
  | 'returned'         // rejected with note — employee must revise
  | 'approved'
  | 'rejected_final';  // permanently rejected

export interface AdditionalWorkRevision {
  reason:       string;
  attachments:  string[];   // file paths
  submittedAt:  string;     // ISO datetime
}

export interface AdditionalWorkRecord {
  id:                   string;
  attendanceRecordId:   string;   // FK → base shift AttendanceRecord
  userId:               string;
  branchId:             string;
  departmentId:         string;
  date:                 string;   // YYYY-MM-DD

  startTime:            string;   // HH:mm — shift end time (start of additional work)
  endTime:              string;   // HH:mm — actual checkout time

  reason:               AdditionalWorkReason;
  hourType:             AdditionalWorkHourType;  // HR can override
  hrOverrideHourType?:  boolean;  // true if HR changed the default hourType
  countInTotal:         boolean;  // whether approved hours count toward monthly total

  note?:                string;
  attachments:          string[];
  revisionHistory:      AdditionalWorkRevision[];
  hrNote?:              string;   // HR note sent back on 'returned'

  status:               AdditionalWorkStatus;
  approvedBy?:          string;
  approvedAt?:          string;
  createdAt:            string;
  updatedAt:            string;
}

// ─── Shift Transfer ───────────────────────────────────────────────────────────

export type ShiftTransferStatus =
  | 'pending_target'    // waiting for receiver to accept
  | 'pending_manager'   // receiver accepted, waiting for sender's manager
  | 'approved'
  | 'rejected';

export interface ShiftTransferRequest {
  id:                 string;
  senderId:           string;       // Employee A (giving up shift)
  receiverId:         string;       // Employee B (receiving shift)
  senderBranchId:     string;
  receiverBranchId:   string;
  senderDeptId:       string;
  receiverDeptId:     string;

  shiftDate:          string;       // YYYY-MM-DD
  shiftCode:          string;       // shift code being transferred
  startTime:          string;       // HH:mm
  endTime:            string;       // HH:mm
  isOvernight:        boolean;
  breakMinutes:       number;

  status:             ShiftTransferStatus;
  targetResponse?:    'accepted' | 'declined';
  targetRespondedAt?: string;

  approvedBy?:        string;       // Manager of sender's dept
  managerNote?:       string;
  resolvedAt?:        string;

  createdAt:          string;
  updatedAt:          string;
}

// ─── OT Request (WEEKLY_WORKING_TIME departments) ────────────────────────────

export type OvertimeStatus = 'pending' | 'approved' | 'rejected';

export interface OvertimeRequest {
  id:               string;
  userId:           string;
  branchId:         string;
  departmentId:     string;
  date:             string;         // YYYY-MM-DD
  startTime:        string;         // HH:mm
  endTime:          string;         // HH:mm
  durationMinutes:  number;
  reason:           string;
  hourType:         AdditionalWorkHourType;  // HR can override
  approvedBy?:      string;
  status:           OvertimeStatus;
  createdAt:        string;
  updatedAt:        string;
}

// ─── Edit Request ─────────────────────────────────────────────────────────────

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface EditRequest {
  id:            string;
  attendanceId:  string;
  requestedBy:   string;
  approvedBy?:   string;
  rejectedBy?:   string;
  rejectReason?: string;
  reason:        string;
  originalData:  Partial<AttendanceRecord>;
  requestedData: Partial<AttendanceRecord>;
  status:        EditRequestStatus;
  createdAt:     string;
  updatedAt:     string;
}

// ─── Work Schedule ────────────────────────────────────────────────────────────

export interface ShiftSchedule {
  id:           string;
  nameTh:       string;
  nameEn:       string;
  startTime:    string;
  endTime:      string;
  breakMinutes: number;
  isOvernight:  boolean;
}

export interface ScheduleTimeOverride {
  startTime:     string;
  endTime:       string;
  isOvernight?:  boolean;
  breakMinutes?: number;
}

export interface ScheduleDay {
  shiftCode:      string | null;
  shiftCodes?:    string[];
  isDayOff:       boolean;
  timeOverride?:  ScheduleTimeOverride;
  note?:          string;
}

export interface WorkSchedule {
  id:         string;
  userId:     string;
  branchId:   string;
  weekStart:  string;
  days:       Record<string, ScheduleDay>;
  createdBy:  string;
  updatedBy?: string;
  createdAt:  string;
  updatedAt:  string;
}

// ─── Extra Working Time ───────────────────────────────────────────────────────

export type ExtraWorkReason = 'ot' | 'compensate' | 'training' | 'meeting' | 'other';

export interface ExtraWork {
  id:            string;
  employeeId:    string;
  departmentId:  string;
  branchId:      string;
  date:          string;
  startTime:     string;
  endTime:       string;
  reason:        ExtraWorkReason;
  customReason?: string;
  status?:       'draft' | 'published';
  deletedAt?:    string;
  createdBy:     string;
  createdAt:     string;
  updatedAt:     string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  message?: string;
  error?:  string;
}

export interface PaginatedResponse<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

// ─── Schedule Approval ────────────────────────────────────────────────────────

export type ScheduleApprovalStatus = 'pending_hr_approval' | 'published' | 'rejected';

export interface ScheduleApproval {
  id:                           string;
  departmentId:                 string;
  branchId:                     string;
  month:                        string;
  status:                       ScheduleApprovalStatus;
  submittedBy:                  string;
  submittedAt:                  string;
  reviewedBy?:                  string;
  reviewedAt?:                  string;
  rejectReason?:                string;
  requireHrApprovalSnapshot:    boolean;
  createdAt:                    string;
  updatedAt:                    string;
}

// ─── Holiday Policy ───────────────────────────────────────────────────────────

export interface HolidayType {
  id:        string;
  branchId:  string;   // per-branch
  name:      string;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayDate {
  id:        string;
  typeId:    string;
  name:      string;
  date:      string;   // MM-DD
  enabled:   boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Department Transfer ──────────────────────────────────────────────────────

export interface DepartmentAssignment {
  id:               string;
  userId:           string;
  branchId:         string;
  fromDepartmentId: string;
  toDepartmentId:   string;
  effectiveDate:    string;
  transferredBy:    string;
  createdAt:        string;
  updatedAt:        string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type AppNotificationType =
  | 'schedule_approved'
  | 'schedule_rejected'
  | 'schedule_pending'
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_RESULT'
  | 'SHIFT_TRANSFER_REQUEST'    // B receives transfer request from A
  | 'SHIFT_TRANSFER_RESULT'     // A/B notified of manager decision
  | 'ADDITIONAL_WORK_RETURNED'  // employee notified of HR rejection + note
  | 'ADDITIONAL_WORK_RESULT'    // employee notified of final approve/reject
  | 'ABSENT_MARKED';            // employee notified when auto-marked absent

export interface AppNotification {
  id:         string;
  userId:     string;
  branchId:   string;
  type:       AppNotificationType;
  title:      string;
  body:       string;
  relatedId?: string;
  isRead:     boolean;
  createdAt:  string;
  updatedAt:  string;
}

// ─── Monthly Summary ──────────────────────────────────────────────────────────

export interface DeptHourSummary {
  departmentId:   string;
  departmentName: string;
  regularHours:   number;   // rounded to 0.5
  receivedHours:  number;   // from shift transfers received (same dept = merged here)
  sentHours:      number;   // shift transfers sent out
}

export interface MonthlyHourSummary {
  userId:         string;
  branchId:       string;
  month:          string;   // YYYY-MM

  // Own branch totals
  regularHours:   number;
  otHours:        number;
  absentHours:    number;   // from absent shifts (shift duration - break)
  compensateHours: number;  // out-of-schedule approved (regular)

  // Cross-branch (received from other depts)
  crossDeptHours: DeptHourSummary[];

  // Transfer summary
  shiftTransferReceived: number;   // hours received from same dept (already in regularHours)
  shiftTransferSent:     number;   // hours given away

  // Absent vs compensate comparison
  absentVsCompensateDiff: number;  // absentHours - compensateHours (negative = surplus)
}
