import { useState } from "react";
import { useGetDashboardSummary, useGetDepartmentProductivity } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Users, CheckCircle, XCircle, ListTodo, TrendingUp, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import Layout from "@/components/Layout";

const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

function StatCard({ title, value, icon: Icon, color, description }: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  description?: string;
}) {
  return (
    <Card className="border border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    { date: today },
    { query: { queryKey: ["dashboard-summary", today] } }
  );

  const { data: deptData, isLoading: deptLoading } = useGetDepartmentProductivity(
    { date: today },
    { query: { queryKey: ["dept-productivity", today] } }
  );

  const todayFormatted = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const submitPieData = summary ? [
    { name: "Sudah Submit", value: summary.submittedToday },
    { name: "Belum Submit", value: summary.notSubmittedToday },
  ] : [];

  const taskPieData = summary ? [
    { name: "Selesai", value: summary.tasksCompleted },
    { name: "Pending", value: summary.tasksPending },
    { name: "Lainnya", value: Math.max(0, summary.totalTasksToday - summary.tasksCompleted - summary.tasksPending) },
  ].filter(d => d.value > 0) : [];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{todayFormatted}</p>
        </div>

        {summaryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : summary ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                title="Total Karyawan"
                value={summary.totalEmployees}
                icon={Users}
                color="bg-blue-100 text-blue-600"
              />
              <StatCard
                title="Sudah Submit"
                value={summary.submittedToday}
                icon={CheckCircle}
                color="bg-green-100 text-green-600"
                description={`${summary.submitRate}% dari total`}
              />
              <StatCard
                title="Belum Submit"
                value={summary.notSubmittedToday}
                icon={XCircle}
                color="bg-red-100 text-red-600"
              />
              <StatCard
                title="Total Tugas"
                value={summary.totalTasksToday}
                icon={ListTodo}
                color="bg-purple-100 text-purple-600"
              />
              <StatCard
                title="Tugas Selesai"
                value={summary.tasksCompleted}
                icon={TrendingUp}
                color="bg-emerald-100 text-emerald-600"
                description={`${summary.completionRate}% completion`}
              />
              <StatCard
                title="Tugas Pending"
                value={summary.tasksPending}
                icon={Clock}
                color="bg-amber-100 text-amber-600"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Department Productivity */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Produktivitas Departemen</CardTitle>
                  <CardDescription>Rata-rata progress tugas per departemen hari ini</CardDescription>
                </CardHeader>
                <CardContent>
                  {deptLoading ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  ) : deptData && deptData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={deptData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="departmentName"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => v.split(" ").map((w: string) => w[0]).join("")}
                        />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip
                          formatter={(v: number) => [`${v}%`, "Avg Progress"]}
                          labelFormatter={(label) => label}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Bar dataKey="avgProgress" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Tidak ada data hari ini
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Submit Rate */}
              <div className="grid grid-rows-2 gap-5">
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Submit Rate</CardTitle>
                    <CardDescription>Tingkat pengumpulan laporan hari ini</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={submitPieData} cx="50%" cy="50%" innerRadius={28} outerRadius={48} dataKey="value">
                            {submitPieData.map((_, i) => (
                              <Cell key={i} fill={i === 0 ? "#2563eb" : "#e5e7eb"} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-primary">{summary.submitRate}%</p>
                      <p className="text-sm text-muted-foreground">{summary.submittedToday} dari {summary.totalEmployees} karyawan</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Completion Rate</CardTitle>
                    <CardDescription>Tingkat penyelesaian tugas hari ini</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <div className="w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={taskPieData} cx="50%" cy="50%" innerRadius={28} outerRadius={48} dataKey="value">
                            {taskPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.name === "Selesai" ? "#10b981" : entry.name === "Pending" ? "#f59e0b" : "#e5e7eb"} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-emerald-600">{summary.completionRate}%</p>
                      <p className="text-sm text-muted-foreground">{summary.tasksCompleted} dari {summary.totalTasksToday} tugas selesai</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <Card className="border border-border p-8 text-center text-muted-foreground">
            Gagal memuat data dashboard
          </Card>
        )}
      </div>
    </Layout>
  );
}
