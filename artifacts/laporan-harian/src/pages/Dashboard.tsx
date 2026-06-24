import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetDepartmentProductivity,
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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

function DepartmentAxisTick(props: any) {
  const { x, y, payload } = props;
  const label = formatDepartmentChartLabel(String(payload?.value ?? ""));

  return (
    <text x={x} y={y + 14} textAnchor="middle" fill="#94a3b8" fontSize={11}>
      {label}
    </text>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [requestedName, setRequestedName] = useState("");
  const today = getJakartaDateString();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const periodLabels = {
    daily: "Harian",
    weekly: "Mingguan",
    monthly: "Bulanan",
    yearly: "Tahunan",
  } as const;
  const periodSummaryLabels = {
    daily: "Hari Ini",
    weekly: "Minggu Ini",
    monthly: "Bulan Ini",
    yearly: "Tahun Ini",
  } as const;
  const periodLabel = periodLabels[period];
  const periodSummaryLabel = periodSummaryLabels[period];
  const dashboardParams = { date: today, period };

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    dashboardParams,
    { query: { queryKey: ["dashboard-summary", today, period] } },
  );

  const { data: deptData, isLoading: deptLoading } =
    useGetDepartmentProductivity(
      dashboardParams,
      { query: { queryKey: ["dept-productivity", today, period] } },
    );
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
    ? period === "daily"
      ? new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(new Date(`${summary.periodStartDate}T12:00:00+07:00`))
      : `${summary.periodStartDate} s/d ${summary.periodEndDate}`
    : today;
  const missingEmployees = summary?.missingEmployees ?? [];
  const isDirector = ["direktur", "director", "dir"].includes(String(user?.role ?? "").toLowerCase());

  const copyMissingReportTemplate = async () => {
    const referenceDate = today;
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

  const chartData = Array.isArray(deptData)
    ? Array.from(
        deptData.reduce((groups, dept: any) => {
          const name = formatDepartmentChartLabel(dept.departmentName);
          const current = groups.get(name) ?? { name, Submit: 0, Target: 0 };
          current.Submit += Number(dept.submittedCount ?? 0);
          current.Target += Number(dept.expectedSubmissions ?? dept.employeeCount ?? 0);
          groups.set(name, current);
          return groups;
        }, new Map<string, { name: string; Submit: number; Target: number }>())
        .values(),
      ).map((item) => ({
        ...item,
        ringkasan: `${item.Submit}/${item.Target} Submit`,
      }))
    : [];
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
                <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base font-bold text-slate-800">
                    Rekap Laporan Departemen {periodLabel}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <Select value={period} onValueChange={(value) => setPeriod(value as "daily" | "weekly" | "monthly" | "yearly")}>
                      <SelectTrigger className="h-9 w-36 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Harian</SelectItem>
                        <SelectItem value="weekly">Mingguan</SelectItem>
                        <SelectItem value="monthly">Bulanan</SelectItem>
                        <SelectItem value="yearly">Tahunan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold">
                      Periode: {periodRangeText}
                    </span>
                    <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">
                      Submit: {summary.submittedEmployeeCount} / {summary.requiredEmployeeCount}
                    </span>
                    <span className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">
                      Total Tugas: {summary.totalTasksToday}
                    </span>
                  </div>
                  {deptLoading ? (
                    <div className="flex h-[285px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#06258d]" />
                    </div>
                  ) : chartData.length > 0 ? (
                    <div className="min-w-[560px] sm:min-w-0">
                    <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          interval={0}
                          minTickGap={0}
                          height={45}
                          axisLine={false}
                          tickLine={false}
                          tick={<DepartmentAxisTick />}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "#e5e7eb",
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="Submit"
                          fill="#06258d"
                          radius={[5, 5, 0, 0]}
                        />
                        <Bar
                          dataKey="Target"
                          fill="#ef0012"
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      {chartData.map((item) => (
                        <span key={item.name} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {formatDepartmentChartLabel(item.name)}: {item.ringkasan}
                        </span>
                      ))}
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
