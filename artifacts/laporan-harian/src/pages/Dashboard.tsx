import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDepartmentProductivity,
  useGetDashboardSummary,
  useListNotifications,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  CheckSquare,
  AlertTriangle,
  ClipboardList,
  Clock3,
  Loader2,
  FileCheck2,
  CalendarDays,
  Filter,
  Copy,
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
import { Link } from "wouter";
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
  const revisionNotifications = Array.isArray(notifications)
    ? (notifications as Array<{
        id: number;
        type: string;
        title: string;
        message: string;
        relatedReportId?: number | null;
      }>).filter((item) => item.type === "revision").slice(0, 3)
    : [];

  const todayFormatted = formatJakartaDateLong();
  const periodRangeText = summary
    ? `${summary.periodStartDate} s/d ${summary.periodEndDate}`
    : today;
  const missingEmployees = summary?.missingEmployees ?? [];
  const isDirector = ["direktur", "director", "dir"].includes(String(user?.role ?? "").toLowerCase());

  const copyMissingReportTemplate = async () => {
    const referenceDate = selectedDate;
    const formattedDate = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${referenceDate}T12:00:00+07:00`));
    const formattedDay = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${referenceDate}T12:00:00+07:00`));
    const numberedNames = missingEmployees
      .map((employee, index) => `${index + 1}. ${employee.name}`)
      .join("\n");
    const template = `📌 REMINDER LAPORAN HARIAN
${formattedDay}, ${formattedDate}

Karyawan yang belum mengirim laporan:
❌ Belum Submit (${missingEmployees.length}) karyawan
${numberedNames}

Mohon segera mengisi laporan harian melalui Website Pelaporan PTAA:
https://www.adiyasawork.com/
atau
https://ptaa-laporan.vercel.app/

Terima kasih.`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(template);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = template;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard tidak tersedia");
      }
      toast({
        title: "Template berhasil disalin",
        description: "Teks reminder siap ditempel ke WhatsApp.",
      });
    } catch {
      toast({
        title: "Gagal menyalin template",
        description: "Browser tidak memberikan izin clipboard.",
        variant: "destructive",
      });
    }
  };

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
  const dateRateByDate = new Map(
    dailyDepartmentData.map(({ date, rows }) => {
      const submitted = rows.reduce((sum, item) => sum + Number(item.submittedCount ?? 0), 0);
      const expected = rows.reduce(
        (sum, item) => sum + Number(item.expectedSubmissions ?? item.employeeCount ?? 0),
        0,
      );
      return [date, expected > 0 ? Math.round((submitted / expected) * 100) : null];
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
  const todoNotifications = Array.isArray(notifications)
    ? (notifications as Array<{
        id: number;
        type: string;
        message: string;
        isRead: boolean;
        relatedTodoId?: number | null;
      }>).filter((item) => item.type === "todo" && !item.isRead).slice(0, 3)
    : [];

  return (
    <Layout>
      <div className="page-shell space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-950">Dashboard</h1>
        </div>

        <section className={cn(
          "relative overflow-hidden rounded-xl bg-[#062bbd] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6",
          todoNotifications.length > 0 && "lg:pr-[430px]",
        )}>
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
          {todoNotifications.length > 0 && (
            <div className="relative mt-4 space-y-2 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm lg:absolute lg:inset-y-3 lg:right-4 lg:mt-0 lg:w-[390px] lg:overflow-y-auto">
              <p className="text-xs font-black uppercase tracking-wide text-blue-100">
                To Do List Baru
              </p>
              {todoNotifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={`/to-do-list?task=${notification.relatedTodoId ?? ""}`}
                  className="block rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                >
                  {notification.message}
                </Link>
              ))}
            </div>
          )}
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
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard
                title={summary.scope === "personal" ? "Hari Kerja" : "Karyawan Office"}
                value={summary.scope === "personal" ? summary.expectedWorkDays : summary.totalEmployees}
                icon={Users}
                iconClass="bg-blue-50 text-blue-600"
                description={summary.scope === "personal" ? "Denominator periode aktif" : "Wajib submit laporan"}
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
              <StatCard
                title="Total Tugas"
                value={summary.totalTasksToday}
                icon={ClipboardList}
                iconClass="bg-violet-50 text-violet-600"
              />
              <StatCard
                title="Tugas Selesai"
                value={summary.tasksCompleted}
                icon={FileCheck2}
                iconClass="bg-green-50 text-green-600"
                description={`${summary.completionRate}% selesai`}
              />
              <StatCard
                title="Tugas Pending"
                value={summary.tasksPending}
                icon={Clock3}
                iconClass="bg-orange-50 text-orange-600"
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
                            const dayRate = dateRateByDate.get(day.date);

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
                                {day.isCurrentMonth && dayRate !== undefined && dayRate !== null && (
                                  <span className={cn(
                                    "mt-1 inline-flex rounded px-1 text-[10px] font-black",
                                    dayRate >= 90
                                      ? "bg-emerald-100 text-emerald-700"
                                      : dayRate > 0
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-red-100 text-red-700",
                                  )}>
                                    {dayRate}%
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
                    Ringkasan {periodSummaryLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Laporan periode yang belum disubmit {periodSummaryLabel.toLowerCase()}
                        </p>
                        <p className="text-xs text-slate-500">
                          Jumlah kewajiban laporan yang belum terpenuhi
                        </p>
                      </div>
                      <Badge className="border-amber-300 bg-white text-amber-700">
                        {summary.notSubmittedToday}
                      </Badge>
                    </div>
                    {isDirector && missingEmployees.length > 0 && (
                      <div className="mt-3 border-t border-amber-200 pt-3">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <p className="text-xs font-semibold text-amber-900">
                            Belum submit hari ini:{" "}
                            {missingEmployees.map((employee) => employee.name).join(", ")}
                          </p>
                          <Badge className="shrink-0 border-amber-300 bg-white text-amber-700">
                            {summary.notSubmittedSelectedDate}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                          onClick={copyMissingReportTemplate}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Salin Teks Template
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Submit Rate
                        </p>
                        <p className="text-xs text-slate-500">
                          Persentase pengumpulan laporan
                        </p>
                      </div>
                      <Badge className="border-blue-300 bg-white text-blue-700">
                        {summary.submitRate}%
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Completion Rate
                        </p>
                        <p className="text-xs text-slate-500">
                          Tingkat penyelesaian tugas
                        </p>
                      </div>
                      <Badge className="border-emerald-300 bg-white text-emerald-700">
                        {summary.completionRate}%
                      </Badge>
                    </div>
                  </div>

                  {summary.pendingAssignedTasksCount > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              Tugas Baru
                            </p>
                            <p className="text-xs text-slate-500">
                              Masuk di halaman Laporan Harian
                            </p>
                          </div>
                          <Badge className="border-red-300 bg-white text-red-700">
                            {summary.pendingAssignedTasksCount}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {summary.pendingAssignedTasksByAssigner.map((item) => (
                            <Link
                              key={item.assignedByName}
                              href="/laporan-saya"
                              className="block rounded-md text-xs font-semibold text-red-700 underline-offset-2 hover:underline"
                            >
                              {item.assignedByName} telah memberimu{" "}
                              {item.count} tugas baru pada Halaman
                              Laporan Harian.
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {revisionNotifications.map((notification) => (
                    <div key={notification.id} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                      <p className="text-sm font-bold text-orange-900">{notification.title}</p>
                      <p className="mt-1 text-xs text-orange-800">{notification.message}</p>
                      <Link
                        href={notification.relatedReportId ? `/laporan/${notification.relatedReportId}` : "/laporan-saya"}
                        className="mt-2 inline-flex rounded-md bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
                      >
                        Revisi
                      </Link>
                    </div>
                  ))}
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
