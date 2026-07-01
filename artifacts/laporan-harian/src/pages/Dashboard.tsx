import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDepartmentProductivity,
  getListNotificationsQueryKey,
  useGetDashboardSummary,
  useListNotifications,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  CheckSquare,
  AlertTriangle,
  Loader2,
  CalendarDays,
  Filter,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Minus,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { formatJakartaDateLong, getJakartaDateString } from "@/lib/date";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: number | string;
  icon: React.ElementType;
  iconClass: string;
  description?: string;
};

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
  description,
}: StatCardProps) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {value}
            </p>
            {description && (
              <p className="mt-2 text-xs font-semibold text-emerald-600">
                {description}
              </p>
            )}
          </div>
          <div className={`rounded-xl p-3 ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDepartmentChartLabel(value: string) {
  const label = String(value ?? "")
    .trim()
    .toLowerCase();

  if (label.includes("finance")) return "Finance";
  if (label.includes("general affairs")) return "GA";
  if (label.includes("engineering")) return "Engineering";
  if (label.includes("marketing")) return "Marketing";
  if (label.includes("purchasing")) return "Purchasing";

  return value;
}

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateString: string, amount: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function getWeekDates(dateString: string) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const monday = addDays(dateString, -(day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function getMonthGridDates(dateString: string) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const firstDate = new Date(Date.UTC(year, month, 1));
  const firstDay = firstDate.getUTCDay();
  const gridStart = addDays(firstDate.toISOString().slice(0, 10), -(firstDay === 0 ? 6 : firstDay - 1));

  return Array.from({ length: 42 }, (_, index) => {
    const current = addDays(gridStart, index);
    const currentDate = new Date(`${current}T00:00:00.000Z`);
    return {
      date: current,
      day: currentDate.getUTCDate(),
      isCurrentMonth: currentDate.getUTCMonth() === month,
    };
  });
}

function formatMonthLabel(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${dateString}T12:00:00+07:00`));
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${dateString}T12:00:00+07:00`));
}

function getDepartmentDayStatus(submitted: number, expected: number) {
  if (expected <= 0) {
    return {
      label: "-",
      icon: Minus,
      className: "border-slate-200 bg-slate-50 text-slate-400",
    };
  }

  if (submitted >= expected) {
    return {
      label: "Lengkap",
      icon: CheckCircle2,
      className: "border-emerald-200 bg-emerald-50 text-emerald-600",
    };
  }

  if (submitted > 0) {
    return {
      label: "Sebagian",
      icon: CircleAlert,
      className: "border-amber-200 bg-amber-50 text-amber-600",
    };
  }

  return {
    label: "Belum",
    icon: XCircle,
    className: "border-red-200 bg-red-50 text-red-600",
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [requestedName, setRequestedName] = useState("");
  const today = getJakartaDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const period = "weekly" as const;
  const periodLabel = "Mingguan";
  const periodSummaryLabel = "Minggu Ini";
  const dashboardParams = { date: selectedDate, period };

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    dashboardParams,
    { query: { queryKey: ["dashboard-summary", selectedDate, period] } },
  );

  const selectedWeekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const selectedWeekSet = useMemo(() => new Set(selectedWeekDates), [selectedWeekDates]);
  const monthGridDates = useMemo(() => getMonthGridDates(selectedDate), [selectedDate]);
  const dailyDepartmentQueries = useQueries({
    queries: selectedWeekDates.map((date) => ({
      queryKey: ["dept-productivity", date, "daily"],
      queryFn: () => getDepartmentProductivity({ date, period: "daily" }),
      staleTime: 30000,
      retry: false,
    })),
  });
  const deptLoading = dailyDepartmentQueries.some((query) => query.isLoading);
  const { data: notifications } = useListNotifications();
  const { data: myNameRequests } = useQuery({
    queryKey: ["name-change-requests", "mine"],
    queryFn: () => apiRequest<Array<{ id: number; requestedName: string; status: string }>>("/api/name-change-requests/mine"),
  });
  const pendingNameRequest = myNameRequests?.find((item) => item.status === "pending");

  const submitNameRequest = async () => {
    try {
      await apiRequest("/api/name-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedName }),
      });
      setRequestedName("");
      await queryClient.invalidateQueries({ queryKey: ["name-change-requests", "mine"] });
      toast({ title: "Pengajuan dikirim", description: "Admin akan meninjau perubahan nama Anda." });
    } catch (error) {
      toast({
        title: "Pengajuan gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    }
  };
  const todayFormatted = formatJakartaDateLong();
  const periodRangeText = summary
    ? `${summary.periodStartDate} s/d ${summary.periodEndDate}`
    : today;
  const dailyDepartmentData = selectedWeekDates.map((date, index) => ({
    date,
    rows: Array.isArray(dailyDepartmentQueries[index]?.data)
      ? (dailyDepartmentQueries[index].data as Array<{
          departmentId: number;
          departmentName: string;
          employeeCount: number;
          submittedCount: number;
          expectedSubmissions?: number;
          submitRate?: number;
        }>)
      : [],
  }));
  const dateSummaryByDate = new Map(
    dailyDepartmentData.map(({ date, rows }) => {
      const submitted = rows.reduce((sum, item) => sum + Number(item.submittedCount ?? 0), 0);
      const expected = rows.reduce(
        (sum, item) => sum + Number(item.expectedSubmissions ?? item.employeeCount ?? 0),
        0,
      );
      return [date, expected > 0 ? {
        submitted,
        expected,
        rate: Math.round((submitted / expected) * 100),
      } : null];
    }),
  );
  const weeklyDepartmentRows = Array.from(
    dailyDepartmentData.reduce((groups, { date, rows }) => {
      rows.forEach((item) => {
        const departmentId = Number(item.departmentId);
        const current = groups.get(departmentId) ?? {
          departmentId,
          departmentName: item.departmentName,
          displayName: formatDepartmentChartLabel(item.departmentName),
          submittedTotal: 0,
          expectedTotal: 0,
          days: new Map<string, { submitted: number; expected: number }>(),
        };
        const submitted = Number(item.submittedCount ?? 0);
        const expected = Number(item.expectedSubmissions ?? item.employeeCount ?? 0);
        current.submittedTotal += submitted;
        current.expectedTotal += expected;
        current.days.set(date, { submitted, expected });
        groups.set(departmentId, current);
      });
      return groups;
    }, new Map<number, {
      departmentId: number;
      departmentName: string;
      displayName: string;
      submittedTotal: number;
      expectedTotal: number;
      days: Map<string, { submitted: number; expected: number }>;
    }>()).values(),
  ).sort((a, b) => a.displayName.localeCompare(b.displayName, "id"));
  const departmentOptions = weeklyDepartmentRows.map((row) => ({
    value: String(row.departmentId),
    label: row.displayName,
  }));
  const filteredDepartmentRows = weeklyDepartmentRows.filter((row) => {
    if (departmentFilter !== "all" && String(row.departmentId) !== departmentFilter) return false;
    if (
      departmentSearch.trim() &&
      !row.displayName.toLowerCase().includes(departmentSearch.trim().toLowerCase()) &&
      !row.departmentName.toLowerCase().includes(departmentSearch.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });
  const dashboardSummaryNotificationTypes = new Set(["todo", "report_comment", "revision", "review", "po_note"]);
  const dashboardNotifications = Array.isArray(notifications)
    ? (notifications as Array<{
        id: number;
        type: string;
        title?: string | null;
        message: string;
        isRead: boolean;
        createdAt?: string | null;
        relatedReportId?: number | null;
        relatedTodoId?: number | null;
      }>).filter((item) => dashboardSummaryNotificationTypes.has(item.type)).map((item) => ({
        ...item,
        href: item.relatedTodoId
          ? `/to-do-list?task=${item.relatedTodoId}`
          : item.relatedReportId
            ? `/laporan/${item.relatedReportId}${item.type === "report_comment" ? "?returnTo=/dashboard" : ""}`
            : item.type === "po_note"
              ? "/jadwal-project"
            : "/notifikasi",
      }))
    : [];

  const openDashboardNotification = async (notification: typeof dashboardNotifications[number]) => {
    try {
      await apiRequest(`/api/notifications/${notification.id}/read`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } finally {
      setLocation(notification.href);
    }
  };

  return (
    <Layout>
      <div className="page-shell space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-950">Dashboard</h1>
        </div>

        <section className="relative overflow-hidden rounded-xl bg-[#062bbd] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <p className="text-sm font-medium text-blue-100">
            Selamat datang kembali,
          </p>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">
            {user?.name ?? "Admin PTAA"} — PT Adiyasa Abadi
          </h2>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-100">
            <CalendarDays className="h-4 w-4" />
            {todayFormatted}
          </div>
        </section>
        <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">Ajukan perubahan nama tampilan</p>
              <p className="text-xs text-slate-500">Email dan role tidak dapat diubah melalui pengajuan ini.</p>
              {pendingNameRequest && (
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  Menunggu persetujuan Admin: {pendingNameRequest.requestedName}
                </p>
              )}
            </div>
            <Input
              value={requestedName}
              onChange={(event) => setRequestedName(event.target.value)}
              placeholder="Nama tampilan baru"
              className="sm:w-72"
              disabled={Boolean(pendingNameRequest)}
            />
            <Button onClick={submitNameRequest} disabled={Boolean(pendingNameRequest) || requestedName.trim().length < 2}>
              Ajukan
            </Button>
          </CardContent>
        </Card>

        {summaryLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#06258d]" />
          </div>
        ) : summary ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Target Submit (Periode)"
                value={summary.expectedSubmissions}
                icon={Users}
                iconClass="bg-blue-50 text-blue-600"
                description={`${summary.totalEmployees} karyawan x ${summary.expectedWorkDays} hari kerja`}
              />
              <StatCard
                title="Sudah Submit (Periode)"
                value={summary.submittedToday}
                icon={CheckSquare}
                iconClass="bg-emerald-50 text-emerald-600"
                description={`${summary.submitRate}% dari total`}
              />
              <StatCard
                title="Belum Submit (Periode)"
                value={summary.notSubmittedToday}
                icon={AlertTriangle}
                iconClass="bg-amber-50 text-amber-600"
              />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_470px]">
              <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="flex flex-col gap-3 pb-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-800">
                      Rekap Laporan Departemen {periodLabel}
                    </CardTitle>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatShortDate(selectedWeekDates[0])} - {formatShortDate(selectedWeekDates[6])}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setSelectedDate((current) => addMonths(current, -1))}
                      title="Bulan sebelumnya"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-36 text-center text-sm font-bold text-slate-800">
                      {formatMonthLabel(selectedDate)}
                    </div>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      className="h-9 w-40"
                      title="Filter tanggal"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setSelectedDate((current) => addMonths(current, 1))}
                      title="Bulan berikutnya"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setSelectedDate(today)}
                    >
                      Hari Ini
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold">
                      Periode: {periodRangeText}
                    </span>
                    <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                      Submit: {summary.submittedToday} / {summary.expectedSubmissions}
                    </span>
                    <span className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">
                      Total Tugas: {summary.totalTasksToday}
                    </span>
                  </div>
                  {deptLoading ? (
                    <div className="flex h-[285px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#06258d]" />
                    </div>
                  ) : weeklyDepartmentRows.length > 0 ? (
                    <div className="grid gap-4 2xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500">
                          {WEEKDAY_LABELS.map((day) => (
                            <div key={day}>{day}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {monthGridDates.map((day) => {
                            const isSelected = day.date === selectedDate;
                            const isInSelectedWeek = selectedWeekSet.has(day.date);
                            const daySummary = dateSummaryByDate.get(day.date);

                            return (
                              <button
                                key={day.date}
                                type="button"
                                onClick={() => setSelectedDate(day.date)}
                                className={cn(
                                  "min-h-14 rounded-md border p-1 text-left transition hover:border-blue-300 hover:bg-white",
                                  day.isCurrentMonth ? "border-slate-200 bg-white" : "border-transparent bg-slate-100 text-slate-400",
                                  isInSelectedWeek && "border-blue-200 bg-blue-50",
                                  isSelected && "border-blue-500 bg-white shadow-sm ring-1 ring-blue-500",
                                )}
                              >
                                <span className="block text-xs font-bold">{day.day}</span>
                                {day.isCurrentMonth && daySummary && (
                                  <span className={cn(
                                    "mt-1 inline-flex rounded px-1 text-[10px] font-black",
                                    daySummary.rate >= 90
                                      ? "bg-emerald-100 text-emerald-700"
                                      : daySummary.rate > 0
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700",
                                  )}>
                                    {daySummary.submitted}/{daySummary.expected}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                          <div className="relative flex-1">
                            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              value={departmentSearch}
                              onChange={(event) => setDepartmentSearch(event.target.value)}
                              placeholder="Cari departemen..."
                              className="h-9 pl-9"
                            />
                          </div>
                          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                            <SelectTrigger className="h-9 lg:w-52">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Semua Departemen</SelectItem>
                              {departmentOptions.map((department) => (
                                <SelectItem key={department.value} value={department.value}>
                                  {department.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="sticky-scroll-area max-h-[360px] overflow-auto rounded-lg border border-slate-200">
                          <table className="w-full min-w-[760px] text-sm">
                            <thead className="sticky top-0 z-20 bg-slate-100">
                              <tr className="border-b border-slate-200">
                                <th className="sticky left-0 z-30 bg-slate-100 px-4 py-3 text-left text-xs font-bold text-slate-600">
                                  Departemen
                                </th>
                                {selectedWeekDates.map((date, index) => (
                                  <th key={date} className="px-3 py-3 text-center text-xs font-bold text-slate-600">
                                    <span className="block">{WEEKDAY_LABELS[index]}</span>
                                    <span className="block text-[11px] font-semibold text-slate-400">
                                      {formatShortDate(date)}
                                    </span>
                                  </th>
                                ))}
                                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredDepartmentRows.length === 0 ? (
                                <tr>
                                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                                    Tidak ada departemen sesuai filter.
                                  </td>
                                </tr>
                              ) : (
                                filteredDepartmentRows.map((row) => (
                                  <tr key={row.departmentId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                    <td className="sticky left-0 z-10 bg-white px-4 py-3">
                                      <p className="font-bold text-slate-800">{row.displayName}</p>
                                      <p className="text-xs text-slate-500">{row.departmentName}</p>
                                    </td>
                                    {selectedWeekDates.map((date) => {
                                      const day = row.days.get(date) ?? { submitted: 0, expected: 0 };
                                      const status = getDepartmentDayStatus(day.submitted, day.expected);
                                      const StatusIcon = status.icon;

                                      return (
                                        <td key={date} className="px-3 py-3 text-center">
                                          <span
                                            className={cn(
                                              "mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full border",
                                              status.className,
                                            )}
                                            title={`${status.label}: ${day.submitted}/${day.expected}`}
                                          >
                                            <StatusIcon className="h-4 w-4" />
                                          </span>
                                          <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                                            {day.expected > 0 ? `${day.submitted}/${day.expected}` : "-"}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="px-4 py-3 text-center">
                                      <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                                        {row.submittedTotal}/{row.expectedTotal}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[285px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                      Belum ada data laporan {periodSummaryLabel.toLowerCase()}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-slate-800">
                    Ringkasan Minggu Ini
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="sticky-scroll-area max-h-[520px] space-y-2 overflow-auto pr-1">
                    {summary.pendingAssignedTasksByAssigner.map((item) => (
                      <Link
                        key={`assigned-${item.assignedByName}`}
                        href="/laporan-saya"
                        className="block rounded-lg border border-red-200 bg-red-50 px-4 py-3 transition hover:border-red-300 hover:bg-red-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-red-900">Dapat kiriman tugas</p>
                            <p className="mt-1 text-xs font-semibold text-red-700">
                              {item.assignedByName} mengirim {item.count} tugas harian.
                            </p>
                          </div>
                          <Badge className="border-red-300 bg-white text-red-700">{item.count}</Badge>
                        </div>
                      </Link>
                    ))}
                    {dashboardNotifications.map((notification) => (
                      <Link
                        key={notification.id}
                        href={notification.href}
                        onClick={(event) => {
                          event.preventDefault();
                          void openDashboardNotification(notification);
                        }}
                        className={cn(
                          "block rounded-lg border px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50",
                          notification.isRead
                            ? "border-slate-200 bg-white"
                            : "border-blue-200 bg-blue-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {notification.title || "Notifikasi"}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-600">
                              {notification.message}
                            </p>
                            {notification.createdAt && (
                              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                                {new Date(notification.createdAt).toLocaleString("id-ID")}
                              </p>
                            )}
                          </div>
                          {!notification.isRead && (
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                          )}
                        </div>
                      </Link>
                    ))}
                    {dashboardNotifications.length === 0 && summary.pendingAssignedTasksByAssigner.length === 0 && (
                      <p className="rounded-lg border border-dashed p-8 text-center text-sm font-semibold text-slate-400">
                        Belum ada notifikasi.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        ) : (
          <Card className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Gagal memuat data dashboard
          </Card>
        )}
      </div>
    </Layout>
  );
}
