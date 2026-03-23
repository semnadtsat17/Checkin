import { apiFetch } from './client';

export interface EmployeeMeta {
  userId:       string;
  employeeCode: string;
  fullNameTh:   string;
  departmentId: string;
}

export interface WeeklyEmployeeRow extends EmployeeMeta {
  presentDays:    number;
  lateDays:       number;
  earlyLeaveDays: number;
  absentDays:     number;
  pendingDays:    number;
  leaveDays:      number;
  workedHours:    number;
}

export interface WeeklySummaryReport {
  weekStart:    string;
  weekEnd:      string;
  departmentId: string | null;
  employees:    WeeklyEmployeeRow[];
  totals:       Omit<WeeklyEmployeeRow, keyof EmployeeMeta>;
}

export interface MonthlyEmployeeRow extends EmployeeMeta {
  workedHours:    number;
  overtime:       number;
  presentDays:    number;
  lateDays:       number;
  earlyLeaveDays: number;
  absentDays:     number;
  pendingDays:    number;
  leaveDays:      number;
}

export interface MonthlySummaryReport {
  month:        string;
  departmentId: string | null;
  employees:    MonthlyEmployeeRow[];
  totals:       Omit<MonthlyEmployeeRow, keyof EmployeeMeta>;
}

export interface PlannedVsActualRow extends EmployeeMeta {
  plannedHours: number;
  actualHours:  number;
  difference:   number;
}

export interface PlannedVsActualReport {
  month:        string;
  departmentId: string | null;
  employees:    PlannedVsActualRow[];
}

export interface PendingApprovalRow extends EmployeeMeta {
  attendanceId:  string;
  date:          string;
  checkInTime?:  string;
  checkOutTime?: string;
  note?:         string;
}

export interface PendingApprovalsReport {
  departmentId: string | null;
  total:        number;
  records:      PendingApprovalRow[];
}

export const reportApi = {
  weekly(weekStart: string, deptId?: string) {
    const p = new URLSearchParams({ weekStart });
    if (deptId) p.set('deptId', deptId);
    return apiFetch<WeeklySummaryReport>(`/api/reports/weekly?${p}`);
  },

  monthly(month: string, deptId?: string) {
    const p = new URLSearchParams({ month });
    if (deptId) p.set('deptId', deptId);
    return apiFetch<MonthlySummaryReport>(`/api/reports/monthly?${p}`);
  },

  plannedVsActual(month: string, deptId?: string) {
    const p = new URLSearchParams({ month });
    if (deptId) p.set('deptId', deptId);
    return apiFetch<PlannedVsActualReport>(`/api/reports/planned-vs-actual?${p}`);
  },

  pendingApprovals(deptId?: string) {
    const p = deptId ? `?deptId=${deptId}` : '';
    return apiFetch<PendingApprovalsReport>(`/api/reports/pending-approvals${p}`);
  },
};
