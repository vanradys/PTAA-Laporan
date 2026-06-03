import {
  useGetDashboardSummary,
  useGetDepartmentProductivity,
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Layout from "@/components/Layout";
import { formatJakartaDateLong, getJakartaDateString } from "@/lib/date";

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
  const today = getJakartaDateString();

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    { date: today },
    { query: { queryKey: ["dashboard-summary", today] } },
  );

  const { data: deptData, isLoading: deptLoading } =
    useGetDepartmentProductivity(
      { date: today },
      { query: { queryKey: ["dept-productivity", today] } },
    );

  const todayFormatted = formatJakartaDateLong();

  const chartData = Array.isArray(deptData)
    ? deptData.map((dept: any) => ({
        name: dept.departmentName,
        Submit: dept.submitRate,
        Progres: dept.avgProgress,
      }))
    : [];

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

        {summaryLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#06258d]" />
          </div>
        ) : summary ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard
                title="Karyawan Office"
                value={summary.totalEmployees}
                icon={Users}
                iconClass="bg-blue-50 text-blue-600"
                description="Wajib submit laporan"
              />
              <StatCard
                title="Sudah Submit"
                value={summary.submittedToday}
                icon={CheckSquare}
                iconClass="bg-emerald-50 text-emerald-600"
                description={`${summary.submitRate}% dari total`}
              />
              <StatCard
                title="Belum Submit"
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-slate-800">
                    Rekap Laporan Departemen Hari Ini
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {deptLoading ? (
                    <div className="flex h-[285px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-[#06258d]" />
                    </div>
                  ) : chartData.length > 0 ? (
                    <div className="h-[285px] min-w-[560px] sm:min-w-0">
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
                          domain={[0, 100]}
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
                          dataKey="Progres"
                          fill="#ef0012"
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-[285px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                      Belum ada data laporan hari ini
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-slate-800">
                    Ringkasan Hari Ini
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Belum Submit Laporan
                        </p>
                        <p className="text-xs text-slate-500">
                          Karyawan yang belum mengirim laporan hari ini
                        </p>
                      </div>
                      <Badge className="border-amber-300 bg-white text-amber-700">
                        {summary.notSubmittedToday}
                      </Badge>
                    </div>
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
