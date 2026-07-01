import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { useListReports, useListDepartments, useListEmployees } from "@workspace/api-client-react";
import { CheckCircle, XCircle, Eye, Search, Filter, X, Loader2, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { formatIndonesianDate, formatJakartaTime, getJakartaDateString } from "@/lib/date";
import {
  missingDailyReportsQueryKey,
  type MissingDailyReportUser,
  useMissingDailyReportsToday,
} from "@/hooks/use-daily-report-reminder";
import { useEditPermissions } from "@/hooks/use-edit-permissions";
import { MONITORING_FILTERS_STORAGE_KEY } from "@/lib/storageKeys";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
type MonitoringFilters = {
  dateFrom: string;
  dateTo: string;
  departmentId: string;
  userId: string;
  status: string;
  search: string;
};

const REPORT_STATUSES = [
  { value: "belum_submit", label: "Belum Submit", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "draf", label: "Draf", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "dikirim", label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "direview", label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "perlu_revisi", label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "selesai", label: "Selesai", color: "bg-green-100 text-green-700 border-green-200" },
];

const REMINDER_ACCESS_ROLES = ["admin", "hr", "direktur", "director", "atasan", "leader", "supervisor", "spv", "manager", "kepala_departemen"];

const REMOVED_EMPLOYEE_EMAILS = new Set([
  "ahmad@perusahaan.com",
  "engineering3@adiyasa.com",
  "mkspec@adiyasa.com",
]);

const NON_REPORTING_ROLES = new Set(["admin", "hr", "direktur", "director"]);

type EmployeeOption = {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId?: number | null;
  departmentName?: string | null;
};

type ReportSummaryLike = {
  id: number;
  reportId?: number | null;
  userId: number;
  userName: string;
  userEmail?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  date: string;
  dayName: string;
  taskCount: number;
  avgProgress: number;
  status: string;
  submittedAt?: string | null;
  reportIds?: number[];
  periodStartDate?: string;
  periodEndDate?: string;
};

type MonitoringReportRow = {
  id: number;
  reportId: number | null;
  userId: number;
  userName: string;
  userEmail: string;
  departmentId: number | null;
  departmentName: string | null;
  date: string;
  dayName: string;
  taskCount: number;
  avgProgress: number;
  status: string;
  submittedAt: string | null;
  hasReport: boolean;
  isSubmitted: boolean;
  reportIds?: number[];
  periodStartDate?: string;
  periodEndDate?: string;
};

function getStatusInfo(status: string) {
  if (/^\d+\s+Revisi$/i.test(status)) {
    return { value: status, label: status, color: "bg-orange-100 text-orange-700 border-orange-200" };
  }
  if (status === "Selesai") {
    return { value: status, label: "Selesai", color: "bg-green-100 text-green-700 border-green-200" };
  }
  if (status === "Direview") {
    return { value: status, label: "Direview", color: "bg-blue-100 text-blue-700 border-blue-200" };
  }
  return REPORT_STATUSES.find((item) => item.value === status) ?? REPORT_STATUSES[0];
}

function isSubmittedStatus(status: string) {
  return status !== "draf" && status !== "belum_submit";
}

function getDayName(date: string) {
  const dateObject = new Date(`${date}T00:00:00`);
  return DAY_NAMES[dateObject.getDay()] ?? "-";
}

function formatSubmitTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function buildMissingSummary(users: MissingDailyReportUser[], totalEmployees: number, reportDate: string) {
  const formattedDate = formatIndonesianDate(reportDate);

  if (users.length === 0) {
    return `Semua karyawan yang wajib submit sudah mengisi laporan harian pada tanggal ${formattedDate}.`;
  }

  if (totalEmployees > 0 && users.length === totalEmployees) {
    return `Seluruh karyawan belum mengisi laporan harian pada tanggal ${formattedDate}.`;
  }

  const names = users.map((user) => user.name).filter(Boolean);

  return `${names.join(", ")} belum mengisi laporan harian pada tanggal ${formattedDate}.`;
}

function buildRowsFromEmployeesAndReports(
  employees: EmployeeOption[],
  reports: ReportSummaryLike[],
  reportDate: string,
): MonitoringReportRow[] {
  const reportByUserId = new Map<number, ReportSummaryLike>();

  for (const report of reports) {
    reportByUserId.set(report.userId, report);
  }

  return employees.map((employee) => {
    const report = reportByUserId.get(employee.id);
    const status = report?.status ?? "belum_submit";

    return {
      id: report?.id ?? -employee.id,
      reportId: report?.reportId ?? report?.id ?? null,
      userId: employee.id,
      userName: report?.userName ?? employee.name,
      userEmail: report?.userEmail ?? employee.email,
      departmentId: report?.departmentId ?? employee.departmentId ?? null,
      departmentName: report?.departmentName ?? employee.departmentName ?? null,
      date: report?.date ?? reportDate,
      dayName: report?.dayName ?? getDayName(reportDate),
      taskCount: report?.taskCount ?? 0,
      avgProgress: report?.avgProgress ?? 0,
      status,
      submittedAt: report?.submittedAt ?? null,
      hasReport: !!report,
      isSubmitted: isSubmittedStatus(status),
      reportIds: report?.reportIds,
      periodStartDate: report?.periodStartDate,
      periodEndDate: report?.periodEndDate,
    };
  });
}

export default function Monitoring() {
  const todayString = getJakartaDateString();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { canEdit } = useEditPermissions();
  const defaultFilters: MonitoringFilters = {
    dateFrom: todayString,
    dateTo: todayString,
    departmentId: "",
    userId: "",
    status: "",
    search: "",
  };
  const readFiltersFromUrl = (): MonitoringFilters => {
    const params = new URLSearchParams(searchParams);
    const hasUrlFilters = ["dateFrom", "dateTo", "departmentId", "userId", "status", "search"].some((key) =>
      params.has(key),
    );

    if (!hasUrlFilters) {
      const savedFilters = localStorage.getItem(MONITORING_FILTERS_STORAGE_KEY);
      if (savedFilters) {
        try {
          return { ...defaultFilters, ...JSON.parse(savedFilters) };
        } catch {
          localStorage.removeItem(MONITORING_FILTERS_STORAGE_KEY);
        }
      }
    }

    return {
      dateFrom: params.get("dateFrom") || defaultFilters.dateFrom,
      dateTo: params.get("dateTo") || defaultFilters.dateTo,
      departmentId: params.get("departmentId") || "",
      userId: params.get("userId") || "",
      status: params.get("status") || "",
      search: params.get("search") || "",
    };
  };
  const [filters, setFilters] = useState<MonitoringFilters>(readFiltersFromUrl);
  const [draftFilters, setDraftFilters] = useState<MonitoringFilters>(filters);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    localStorage.setItem(MONITORING_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const userRole = user?.role?.toLowerCase() ?? "";
  const canManageReminder =
    REMINDER_ACCESS_ROLES.includes(userRole) && canEdit("monitoring_send_reminder", true);
  const jakartaHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
  const isAfterReminderTime = jakartaHour >= 16;
  const showReminderNotice = true;
  const showReminderSection = canManageReminder;
  const reminderDate = filters.dateTo || todayString;

  const { data: departments } = useListDepartments();
  const { data: employees, isLoading: isLoadingEmployees } = useListEmployees();
  const {
    data: missingUsersFromApi,
    isLoading: isLoadingMissing,
  } = useMissingDailyReportsToday(canManageReminder, reminderDate);

  const params: Record<string, string> = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.departmentId) params.departmentId = filters.departmentId;
  if (filters.userId) params.userId = filters.userId;
  if (filters.search) params.search = filters.search;

  const { data: reports, isLoading: isLoadingReports } = useListReports(params);

  const employeeList: EmployeeOption[] = Array.isArray(employees)
    ? (employees as EmployeeOption[]).filter((employee) => {
      const email = String(employee.email ?? "").toLowerCase();
      const role = String(employee.role ?? "").toLowerCase();
      return !REMOVED_EMPLOYEE_EMAILS.has(email) && !NON_REPORTING_ROLES.has(role);
    })
    : [];
  const reportList: ReportSummaryLike[] = Array.isArray(reports) ? (reports as ReportSummaryLike[]) : [];

  const reportRows = useMemo(() => {
    if (employeeList.length > 0) {
      return buildRowsFromEmployeesAndReports(employeeList, reportList, filters.dateTo || filters.dateFrom);
    }

    return reportList.map((report) => ({
      id: report.id,
      reportId: report.reportId ?? report.id,
      userId: report.userId,
      userName: report.userName,
      userEmail: report.userEmail ?? "",
      departmentId: report.departmentId ?? null,
      departmentName: report.departmentName ?? null,
      date: report.date,
      dayName: report.dayName,
      taskCount: report.taskCount,
      avgProgress: report.avgProgress,
      status: report.status,
      submittedAt: report.submittedAt ?? null,
      hasReport: true,
      isSubmitted: isSubmittedStatus(report.status),
      reportIds: report.reportIds,
      periodStartDate: report.periodStartDate,
      periodEndDate: report.periodEndDate,
    }));
  }, [employeeList, filters.dateFrom, filters.dateTo, reportList]);

  const filteredRows = useMemo(() => {
    return reportRows.filter((row) => {
      if (filters.departmentId && String(row.departmentId ?? "") !== filters.departmentId) return false;
      if (filters.userId && String(row.userId) !== filters.userId) return false;
      if (filters.search && !row.userName.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.status === "perlu_revisi" && !/^\d+\s+Revisi$/i.test(row.status) && row.status !== "perlu_revisi") return false;
      if (filters.status === "direview" && !["Direview", "direview"].includes(row.status)) return false;
      if (filters.status === "selesai" && !["Selesai", "selesai"].includes(row.status)) return false;
      if (
        filters.status &&
        !["perlu_revisi", "direview", "selesai"].includes(filters.status) &&
        row.status !== filters.status
      ) return false;
      return true;
    });
  }, [filters.departmentId, filters.search, filters.status, filters.userId, reportRows]);

  const fallbackMissingList: MissingDailyReportUser[] = useMemo(() => {
    return reportRows
      .filter((row) => !row.isSubmitted)
      .map((row) => ({
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        role: "karyawan",
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        reportDate: reminderDate,
        status: "Belum Mengisi",
        reminderSent: false,
        reminderSentAt: null,
        reminderStatusText: null,
      }));
  }, [reminderDate, reportRows]);

  const missingList = useMemo(() => {
    const apiList = Array.isArray(missingUsersFromApi) ? missingUsersFromApi : [];
    const apiReminderByUserId = new Map(apiList.map((item) => [item.id, item]));

    return fallbackMissingList.map((item) => {
      const apiItem = apiReminderByUserId.get(item.id);

      return {
        ...item,
        reminderSent: apiItem?.reminderSent ?? item.reminderSent,
        reminderSentAt: apiItem?.reminderSentAt ?? item.reminderSentAt,
        reminderStatusText: apiItem?.reminderStatusText ?? item.reminderStatusText,
      };
    });
  }, [fallbackMissingList, missingUsersFromApi]);

  const missingSummaryText = buildMissingSummary(missingList, employeeList.length, reminderDate);
  const unsentReminderCount = missingList.filter((item) => !item.reminderSent).length;
  const isLoading = isLoadingReports || isLoadingEmployees;
  const hasActiveFilters =
    filters.dateFrom !== defaultFilters.dateFrom ||
    filters.dateTo !== defaultFilters.dateTo ||
    !!filters.departmentId ||
    !!filters.userId ||
    !!filters.status ||
    !!filters.search;

  const buildMonitoringUrl = (nextFilters: MonitoringFilters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `/monitoring?${params.toString()}`;
  };

  const setDraftFilter = (key: keyof MonitoringFilters, value: string) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    const nextFilters = {
      ...draftFilters,
      dateFrom: draftFilters.dateFrom || defaultFilters.dateFrom,
      dateTo: draftFilters.dateTo || defaultFilters.dateTo,
    };
    setFilters(nextFilters);
    navigate(buildMonitoringUrl(nextFilters), { replace: true });
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setDraftFilters(defaultFilters);
    localStorage.setItem(MONITORING_FILTERS_STORAGE_KEY, JSON.stringify(defaultFilters));
    navigate(buildMonitoringUrl(defaultFilters), { replace: true });
  };

  const periodLabel = `${new Date(`${filters.dateFrom}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} - ${new Date(`${filters.dateTo}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`;
  const monitoringReturnTo = buildMonitoringUrl(filters);

  return (
    <Layout>
      <div className="page-shell space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Monitoring Laporan Harian</h1>
            <p className="text-sm text-muted-foreground">Pantau laporan harian seluruh karyawan</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showReminderNotice && (
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                Reminder akan dikirim otomatis setiap jam 16.00 WIB.
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="w-4 h-4 mr-2" />
              Filter
              {hasActiveFilters && (
                <Badge className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground border-none">!</Badge>
              )}
            </Button>
          </div>
        </div>

        {showReminderSection && (
          <Card className="border border-border bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Reminder Belum Isi Laporan Hari Ini</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => queryClient.invalidateQueries({ queryKey: missingDailyReportsQueryKey(reminderDate) })}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingMissing || isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : !isAfterReminderTime ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Reminder akan dikirim otomatis setiap jam 16.00 WIB.
                </div>
              ) : missingList.length === 0 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4">
                  <p className="text-sm font-semibold text-green-700">{missingSummaryText}</p>
                  <p className="text-xs text-green-600 mt-1">
                    Laporan yang masih pending/belum/proses akan otomatis masuk ke daftar tugas hari ini pada hari berikutnya.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-700">{missingSummaryText}</p>
                        <p className="text-xs text-red-600">Reminder otomatis sudah dijadwalkan pada jam 16.00 WIB.</p>
                      </div>
                      <Badge className="w-fit border-red-200 bg-white text-red-700 hover:bg-white">{missingList.length} belum mengisi</Badge>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Nama</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Departemen</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status Laporan</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status Reminder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingList.map((item) => (
                          <tr key={item.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.email || "-"}</p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{item.departmentName ?? "—"}</td>
                            <td className="px-4 py-3">
                              <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">Belum Mengisi</Badge>
                            </td>
                            <td className="px-4 py-3">
                              {item.reminderSent ? (
                                <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                                  {item.reminderStatusText ?? (item.reminderSentAt ? `Sudah dikirim pada pukul ${formatJakartaTime(item.reminderSentAt)}` : "Sudah dikirim")}
                                </Badge>
                              ) : (
                                <Badge variant="outline">Belum Dikirim</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showFilters && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">Filter Laporan</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-8 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-xs">Dari Tanggal</Label>
                  <Input
                    type="date"
                    value={draftFilters.dateFrom}
                    onChange={(event) => setDraftFilter("dateFrom", event.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sampai Tanggal</Label>
                  <Input
                    type="date"
                    value={draftFilters.dateTo}
                    onChange={(event) => setDraftFilter("dateTo", event.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Departemen</Label>
                  <Select value={draftFilters.departmentId || "all"} onValueChange={(value) => setDraftFilter("departmentId", value === "all" ? "" : value)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Departemen</SelectItem>
                      {Array.isArray(departments) && departments.map((department: { id: number; name: string }) => (
                        <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Progress</Label>
                  <Select value={draftFilters.status || "all"} onValueChange={(value) => setDraftFilter("status", value === "all" ? "" : value)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      {REPORT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={draftFilters.search}
                      onChange={(event) => setDraftFilter("search", event.target.value)}
                      placeholder="Cari nama karyawan..."
                      className="h-8 text-sm pl-8"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2 md:col-span-5">
                  <Button type="button" size="sm" onClick={applyFilters}>
                    Terapkan Filter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Tidak ada data monitoring yang ditemukan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nama Karyawan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Departemen</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Waktu Submit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Periode</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Tanggal</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Jml Tugas</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status Laporan</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status Submit</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((report) => {
                      const statusInfo = getStatusInfo(report.status);
                      const detailParams = new URLSearchParams({
                        returnTo: monitoringReturnTo,
                      });
                      if (filters.dateFrom && filters.dateTo && filters.dateFrom !== filters.dateTo) {
                        detailParams.set("periodUserId", String(report.userId));
                        detailParams.set("dateFrom", filters.dateFrom);
                        detailParams.set("dateTo", filters.dateTo);
                      }
                      return (
                        <tr key={`${report.userId}-${report.date}-${report.id}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{report.userName}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{report.departmentName ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatSubmitTime(report.submittedAt)}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{periodLabel}</td>
                          <td className="px-4 py-3">
                            <p className="text-foreground">{new Date(`${report.date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</p>
                            <p className="text-xs text-muted-foreground">{report.dayName}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold text-foreground">{report.taskCount}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${report.avgProgress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-foreground w-8 text-right">{report.avgProgress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {report.isSubmitted ? (
                              <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {report.reportId ? (
                              <Link href={`/laporan/${report.reportId}?${detailParams.toString()}`}>
                                <Button variant="ghost" size="icon" className="w-7 h-7">
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            ) : (
                              <Button variant="ghost" size="icon" className="w-7 h-7 opacity-40" disabled>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
