import { useState } from "react";
import { Link } from "wouter";
import {
  useListReports, useListDepartments, useListEmployees
} from "@workspace/api-client-react";
import { CheckCircle, XCircle, Eye, Search, Filter, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/Layout";

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];

const REPORT_STATUSES = [
  { value: "draf", label: "Draf", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "dikirim", label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "direview", label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "perlu_revisi", label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function getStatusInfo(status: string) {
  return REPORT_STATUSES.find(s => s.value === status) ?? REPORT_STATUSES[0];
}

export default function Monitoring() {
  const today = new Date();
  const [filters, setFilters] = useState({
    date: "",
    month: String(today.getMonth() + 1),
    year: String(today.getFullYear()),
    departmentId: "",
    userId: "",
    status: "",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data: departments } = useListDepartments();
  const { data: employees } = useListEmployees();

  const params: Record<string, string> = {};
  if (filters.date) params.date = filters.date;
  else if (filters.month && filters.year) {
    params.month = filters.month;
    params.year = filters.year;
  } else if (filters.year) params.year = filters.year;
  if (filters.departmentId) params.departmentId = filters.departmentId;
  if (filters.userId) params.userId = filters.userId;
  if (filters.status) params.status = filters.status;
  if (filters.search) params.search = filters.search;

  const { data: reports, isLoading } = useListReports(params);

  const setFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      date: "", month: String(today.getMonth() + 1),
      year: String(today.getFullYear()),
      departmentId: "", userId: "", status: "", search: "",
    });
  };

  const years = Array.from({ length: 5 }, (_, i) => String(today.getFullYear() - i));

  const isSubmitted = (status: string) => status !== "draf";

  return (
    <Layout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Monitoring Laporan Harian</h1>
            <p className="text-sm text-muted-foreground">Pantau laporan harian seluruh karyawan</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" />
            Filter
            {Object.values(filters).some(v => v !== "" && v !== String(today.getMonth() + 1) && v !== String(today.getFullYear())) && (
              <Badge className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground border-none">!</Badge>
            )}
          </Button>
        </div>

        {/* Filters */}
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
                    onChange={(e) => setFilter("date", e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={filters.month} onValueChange={(v) => setFilter("month", v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Pilih bulan" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tahun</Label>
                  <Select value={filters.year} onValueChange={(v) => setFilter("year", v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Departemen</Label>
                  <Select value={filters.departmentId} onValueChange={(v) => setFilter("departmentId", v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Departemen</SelectItem>
                      {Array.isArray(departments) && departments.map((d: { id: number; name: string }) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Karyawan</Label>
                  <Select value={filters.userId} onValueChange={(v) => setFilter("userId", v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Karyawan</SelectItem>
                      {Array.isArray(employees) && employees.map((e: { id: number; name: string }) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status Laporan</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      {REPORT_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
                      onChange={(e) => setFilter("search", e.target.value)}
                      placeholder="Cari nama karyawan..."
                      className="h-8 text-sm pl-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card className="border border-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : !reports || !Array.isArray(reports) || reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Tidak ada laporan yang ditemukan</p>
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
                    {(reports as Array<{
                      id: number;
                      userName: string;
                      departmentName: string | null;
                      date: string;
                      dayName: string;
                      taskCount: number;
                      avgProgress: number;
                      status: string;
                    }>).map((report) => {
                      const statusInfo = getStatusInfo(report.status);
                      const submitted = isSubmitted(report.status);
                      return (
                        <tr key={report.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{report.userName}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{report.departmentName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <p className="text-foreground">{new Date(report.date + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</p>
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
                            {submitted ? (
                              <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link href={`/laporan/${report.id}`}>
                              <Button variant="ghost" size="icon" className="w-7 h-7">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
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
