import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
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

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const REPORT_STATUSES = [
  { value: "belum_submit", label: "Belum Submit", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "draf", label: "Draf", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "dikirim", label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "direview", label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "perlu_revisi", label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

const REMINDER_ACCESS_ROLES = ["admin", "direktur", "director", "atasan", "leader", "supervisor", "spv", "manager", "kepala_departemen"];

const REMOVED_EMPLOYEE_EMAILS = new Set([
  "admin@ptaa.com",
  "ahmad@perusahaan.com",
  "budi@perusahaan.com",
  "eko@perusahaan.com",
  "engineering3@adiyasa.com",
  "mkspec@adiyasa.com",
]);

const NON_REPORTING_ROLES = new Set(["admin", "direktur", "director"]);

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
  userId: number;
  userName: string;
  departmentId?: number | null;
  departmentName?: string | null;
  date: string;
  dayName: string;
  taskCount: number;
  avgProgress: number;
  status: string;
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
  hasReport: boolean;
  isSubmitted: boolean;
};

function getStatusInfo(status: string) {
  return REPORT_STATUSES.find((item) => item.value === status) ?? REPORT_STATUSES[0];
}

function isSubmittedStatus(status: string) {
  return status !== "draf" && status !== "belum_submit";
}

function getDayName(date: string) {
  const dateObject = new Date(`${date}T00:00:00`);
  return DAY_NAMES[dateObject.getDay()] ?? "-";
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
      reportId: report?.id ?? null,
      userId: employee.id,
      userName: report?.userName ?? employee.name,
      userEmail: employee.email,
      departmentId: report?.departmentId ?? employee.departmentId ?? null,
      departmentName: report?.departmentName ?? employee.departmentName ?? null,
      date: report?.date ?? reportDate,
      dayName: report?.dayName ?? getDayName(reportDate),
      taskCount: report?.taskCount ?? 0,
      avgProgress: report?.avgProgress ?? 0,
      status,
      hasReport: !!report,
      isSubmitted: isSubmittedStatus(status),
    };
  });
}

export default function Monitoring() {
  const todayString = getJakartaDateString();
  const today = new Date();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    date: todayString,
    month: "",
    year: "",
    departmentId: "",
    userId: "",
    status: "",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const userRole = user?.role?.toLowerCase() ?? "";
  const canManageReminder = REMINDER_ACCESS_ROLES.includes(userRole);
  const jakartaHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
  const isAfterReminderTime = jakartaHour >= 16;
  const showReminderSection = canManageReminder;
  const reminderDate = filters.date || todayString;

  const { data: departments } = useListDepartments();
  const { data: employees, isLoading: isLoadingEmployees } = useListEmployees();
  const {
    data: missingUsersFromApi,
    isLoading: isLoadingMissing,
  } = useMissingDailyReportsToday(canManageReminder, reminderDate);

  const params: Record<string, string> = {};
  if (filters.date) {
    params.date = filters.date;
  } else if (filters.month && filters.year) {
    params.month = filters.month;
    params.year = filters.year;
  } else if (filters.year) {
    params.year = filters.year;
  }
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
    const hasSpecificDate = !!filters.date;

    if (hasSpecificDate && employeeList.length > 0) {
      return buildRowsFromEmployeesAndReports(employeeList, reportList, filters.date);
    }

    return reportList.map((report) => ({
      id: report.id,
      reportId: report.id,
      userId: report.userId,
      userName: report.userName,
      userEmail: "",
      departmentId: report.departmentId ?? null,
      departmentName: report.departmentName ?? null,
      date: report.date,
      dayName: report.dayName,
      taskCount: report.taskCount,
      avgProgress: report.avgProgress,
      status: report.status,
      hasReport: true,
      isSubmitted: isSubmittedStatus(report.status),
    }));
  }, [employeeList, filters.date, reportList]);

  const filteredRows = useMemo(() => {
    return reportRows.filter((row) => {
      if (filters.departmentId && String(row.departmentId ?? "") !== filters.departmentId) return false;
      if (filters.userId && String(row.userId) !== filters.userId) return false;
      if (filters.search && !row.userName.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.status && row.status !== filters.status) return false;
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
  const years = Array.from({ length: 5 }, (_, index) => String(today.getFullYear() - index));
  const isLoading = isLoadingReports || isLoadingEmployees;
  const hasActiveFilters =
    filters.date !== todayString ||
    !!filters.month ||
    !!filters.year ||
    !!filters.departmentId ||
    !!filters.userId ||
    !!filters.status ||
    !!filters.search;

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => {
      if (key === "date") {
        return { ...prev, date: value, month: value ? "" : prev.month, year: value ? "" : prev.year };
      }

      if (key === "month") {
        return { ...prev, date: "", month: value, year: prev.year || String(today.getFullYear()) };
      }

      if (key === "year") {
        return { ...prev, date: "", year: value };
      }

      return { ...prev, [key]: value };
    });
  };

  const resetFilters = () => {
    setFilters({
      date: todayString,
      month: "",
      year: "",
      departmentId: "",
      userId: "",
      status: "",
      search: "",
    });
  };

  return (
    <Layout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Monitoring Laporan Harian</h1>
            <p className="text-sm text-muted-foreground">Pantau laporan harian seluruh karyawan</p>
          </div>
          <div className="flex items-center gap-2">
            {showReminderSection && (
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
                    <table className="w-full text-sm">
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
              <CardTitle className="text-sm flex items-center justify-between">
                Filter Laporan
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground h-7">
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Reset
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tanggal Spesifik</Label>
                  <Input
                    type="date"
                    value={filters.date}
                    onChange={(event) => setFilter("date", event.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={filters.month || "none"} onValueChange={(value) => setFilter("month", value === "none" ? "" : value)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Pilih bulan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pilih bulan</SelectItem>
                      {MONTHS.map((month, index) => (
                        <SelectItem key={month} value={String(index + 1)}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tahun</Label>
                  <Select value={filters.year || "none"} onValueChange={(value) => setFilter("year", value === "none" ? "" : value)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Pilih tahun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pilih tahun</SelectItem>
                      {years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Departemen</Label>
                  <Select value={filters.departmentId || "all"} onValueChange={(value) => setFilter("departmentId", value === "all" ? "" : value)}>
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
                  <Label className="text-xs">Karyawan</Label>
                  <Select value={filters.userId || "all"} onValueChange={(value) => setFilter("userId", value === "all" ? "" : value)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Karyawan</SelectItem>
                      {employeeList.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>{employee.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status Laporan</Label>
                  <Select value={filters.status || "all"} onValueChange={(value) => setFilter("status", value === "all" ? "" : value)}>
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
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Cari Nama</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={filters.search}
                      onChange={(event) => setFilter("search", event.target.value)}
                      placeholder="Cari nama karyawan..."
                      className="h-8 text-sm pl-8"
                    />
                  </div>
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nama Karyawan</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Departemen</th>
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
                      return (
                        <tr key={`${report.userId}-${report.date}-${report.id}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{report.userName}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{report.departmentName ?? "—"}</td>
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
                              <Link href={`/laporan/${report.reportId}`}>
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
