import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import {
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Settings,
  Upload,
} from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type EmployeeSummary = {
  mappingId: number;
  userId: number | null;
  name: string;
  machineName: string;
  employeeType: "Office" | "Produksi";
  department: string | null;
  totalLate: number;
  overtimeProduction: number;
  overtimeOffice: number;
  scanDays: number;
  sick: number;
  permission: number;
  daySwap: number;
  leave: number;
  withoutExplanation: number;
  laidOff: number;
  externalDuty: number;
  status: "Safe" | "Warning" | "SP1";
};

type SummaryResponse = {
  periodStart: string;
  periodEnd: string;
  employees: EmployeeSummary[];
  departments: string[];
  summary: {
    totalEmployees: number;
    totalLate: number;
    totalOvertimeProduction: number;
    totalOvertimeOffice: number;
    warning: number;
    sp1: number;
    unmapped: number;
  };
};

type Holiday = {
  id: number;
  date: string;
  name: string;
  holidayType: string;
  source: string;
  editable?: boolean;
};

type Mapping = {
  id: number;
  machineName: string;
  displayName: string;
  userId: number | null;
  userName: string | null;
  employeeType: "Office" | "Produksi";
  isActive: boolean;
};

type MappingResponse = { mappings: Mapping[]; pendingNames: string[] };
type WebsiteUser = { id: number; name: string; email: string };
type SettingsData = { safeMax: number; warningMax: number; autoIndonesiaHoliday: boolean };
type ImportPreview = {
  batchId: number;
  fileName: string;
  sheetName: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  mappedNames: string[];
  unmappedNames: string[];
  invalidDetails: Array<{ rowNumber: number; errors: string[] }>;
  preview: Array<{
    rowNumber: number;
    machineName: string | null;
    scanDate: string | null;
    scanTime: string | null;
    department: string | null;
    isValid: boolean;
  }>;
};
type ImportBatch = {
  id: number;
  fileName: string;
  status: string;
  createdAt: string;
};

type DetailResponse = {
  employee: EmployeeSummary;
  rawScans: Array<{
    id: number;
    workDate: string;
    scanDate: string;
    scanTime: string;
    ioType: string | null;
  }>;
  daily: Array<{
    id: number;
    workDate: string;
    clockIn: string | null;
    clockOut: string | null;
    totalScans: number;
    entryStatus: string;
    exitStatus: string;
    dailyStatus: string;
    notes: string | null;
    isLate: boolean;
    overtimeProduction: string;
    overtimeOffice: string;
  }>;
};

const MANUAL_STATUS_OPTIONS = [
  "Hadir",
  "Sakit",
  "Izin",
  "Tukar Hari",
  "Cuti",
  "Tanpa Keterangan",
  "Dirumahkan",
  "Dinas Luar / Nginep",
];

function getPayrollPeriod() {
  const now = new Date();
  const day = now.getDate();
  const start = day >= 21
    ? new Date(now.getFullYear(), now.getMonth(), 21)
    : new Date(now.getFullYear(), now.getMonth() - 1, 21);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 20);
  const localIso = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  return { start: localIso(start), end: localIso(end) };
}

function statusClass(status: string) {
  if (status === "SP1") return "border-red-600 bg-red-600 text-white";
  if (status === "Warning") return "border-amber-300 bg-amber-100 text-amber-900";
  return "border-emerald-300 bg-emerald-100 text-emerald-900";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function exportFileName(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" });
  return `Rekap Absensi - ${formatter.format(new Date(`${start}T00:00:00`))} - ${formatter.format(new Date(`${end}T00:00:00`))}.xlsx`;
}

export default function Attendance() {
  const payroll = useMemo(getPayrollPeriod, []);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const role = String(user?.role ?? "").toLowerCase();
  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  const email = String(user?.email ?? "").toLowerCase();
  const canManageAttendance = role === "admin"
    || role === "finance"
    || ["AAF", "FIN"].includes(departmentCode)
    || departmentName.includes("finance")
    || email === "finance@adiyasa.com";
  const canViewAll = canManageAttendance || [
    "direktur",
    "director",
    "dir",
    "monitoring_dummy",
    "monitoring",
    "monitor",
  ].includes(role);
  const [start, setStart] = useState(payroll.start);
  const [end, setEnd] = useState(payroll.end);
  const [quickPeriod, setQuickPeriod] = useState<"payroll" | "month" | "custom">("payroll");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [employeeType, setEmployeeType] = useState("all");
  const [status, setStatus] = useState("all");
  const [mappingStatus, setMappingStatus] = useState("all");
  const [onlyWithScans, setOnlyWithScans] = useState(false);
  const [showAllActive, setShowAllActive] = useState(true);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["attendance-summary", start, end],
    queryFn: () => apiRequest<SummaryResponse>(`/api/attendance/summary?start=${start}&end=${end}`),
  });
  const holidaysQuery = useQuery({
    queryKey: ["attendance-holidays", start, end],
    queryFn: () => apiRequest<Holiday[]>(`/api/attendance/holidays?start=${start}&end=${end}`),
    enabled: canViewAll,
  });
  const mappingsQuery = useQuery({
    queryKey: ["attendance-mappings"],
    queryFn: () => apiRequest<MappingResponse>("/api/attendance/mappings"),
    enabled: canViewAll,
  });
  const settingsQuery = useQuery({
    queryKey: ["attendance-settings"],
    queryFn: () => apiRequest<SettingsData>("/api/attendance/settings"),
    enabled: canManageAttendance,
  });
  const selfEmployee = canViewAll ? null : summaryQuery.data?.employees[0] ?? null;
  const effectiveDetailId = canViewAll ? detailId : selfEmployee?.mappingId ?? null;
  const detailQuery = useQuery({
    queryKey: ["attendance-detail", effectiveDetailId, start, end],
    queryFn: () => apiRequest<DetailResponse>(`/api/attendance/detail/${effectiveDetailId}?start=${start}&end=${end}`),
    enabled: effectiveDetailId !== null,
  });
  const importsQuery = useQuery({
    queryKey: ["attendance-imports"],
    queryFn: () => apiRequest<ImportBatch[]>("/api/attendance/imports"),
    enabled: canManageAttendance,
  });
  const pendingBatch = importsQuery.data?.find((item) => item.status === "preview") ?? null;

  const filteredEmployees = useMemo(() => {
    let employees = summaryQuery.data?.employees ?? [];
    const term = search.trim().toLowerCase();
    if (term) employees = employees.filter((item) => [item.name, item.machineName].some((value) => value.toLowerCase().includes(term)));
    if (department !== "all") employees = employees.filter((item) => item.department === department);
    if (employeeType !== "all") employees = employees.filter((item) => item.employeeType === employeeType);
    if (status !== "all") employees = employees.filter((item) => item.status === status);
    if (onlyWithScans || !showAllActive) employees = employees.filter((item) => item.scanDays > 0);
    if (mappingStatus === "unmapped") employees = [];
    return employees;
  }, [summaryQuery.data, search, department, employeeType, status, onlyWithScans, showAllActive, mappingStatus]);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const visibleEmployees = filteredEmployees.slice((page - 1) * pageSize, page * pageSize);
  const filteredSummary = useMemo(() => ({
    totalEmployees: filteredEmployees.length,
    totalLate: filteredEmployees.reduce((sum, item) => sum + item.totalLate, 0),
    totalOvertimeProduction: filteredEmployees.reduce((sum, item) => sum + item.overtimeProduction, 0),
    totalOvertimeOffice: filteredEmployees.reduce((sum, item) => sum + item.overtimeOffice, 0),
    warning: filteredEmployees.filter((item) => item.status === "Warning").length,
    sp1: filteredEmployees.filter((item) => item.status === "SP1").length,
    unmapped: summaryQuery.data?.summary.unmapped ?? 0,
  }), [filteredEmployees, summaryQuery.data?.summary.unmapped]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const refreshAttendance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["attendance-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-holidays"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-mappings"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-imports"] }),
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    ]);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<ImportPreview>("/api/attendance/import/preview", { method: "POST", body: formData });
      setPreview(result);
      await queryClient.invalidateQueries({ queryKey: ["attendance-mappings"] });
    } catch (error) {
      toast({ title: "Upload file gagal", description: error instanceof Error ? error.message : "Format file tidak valid", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const processImport = async () => {
    if (!preview) return;
    setProcessing(true);
    try {
      const result = await apiRequest<{ periodStart: string; periodEnd: string }>(`/api/attendance/import/${preview.batchId}/process`, { method: "POST" });
      setStart(result.periodStart);
      setEnd(result.periodEnd);
      setQuickPeriod("custom");
      setPreview(null);
      setUploadOpen(false);
      await refreshAttendance();
      toast({ title: "Import selesai", description: "Data lama pada periode yang sama telah diganti dan rekap dihitung ulang." });
    } catch (error) {
      toast({ title: "Import belum dapat diproses", description: error instanceof Error ? error.message : "Periksa mapping karyawan", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const cancelPreview = async () => {
    if (!preview) return;
    const batchId = preview.batchId;
    setPreview(null);
    try {
      await apiRequest(`/api/attendance/import/${batchId}/cancel`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["attendance-mappings"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance-imports"] });
    } catch {
      // Batch preview akan otomatis dibatalkan saat upload berikutnya.
    }
  };

  const resumePreview = async () => {
    if (!pendingBatch) return;
    try {
      setPreview(await apiRequest<ImportPreview>(`/api/attendance/import/${pendingBatch.id}/preview`));
    } catch (error) {
      toast({ title: "Preview tidak dapat dilanjutkan", description: error instanceof Error ? error.message : "Preview sudah tidak tersedia", variant: "destructive" });
      await queryClient.invalidateQueries({ queryKey: ["attendance-imports"] });
    }
  };

  const refreshAfterMapping = async () => {
    await refreshAttendance();
    if (!preview) return;
    try {
      setPreview(await apiRequest<ImportPreview>(`/api/attendance/import/${preview.batchId}/preview`));
    } catch {
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance-imports"] });
    }
  };

  const exportExcel = async () => {
    try {
      const blob = await apiRequest<Blob>(`/api/attendance/export?start=${start}&end=${end}`, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportFileName(start, end);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Export gagal", description: error instanceof Error ? error.message : "Tidak dapat membuat Excel", variant: "destructive" });
    }
  };

  const applyMonthYear = (month: string, year: string) => {
    const numericMonth = Number(month);
    const numericYear = Number(year);
    setSelectedMonth(month);
    setSelectedYear(year);
    setStart(`${numericYear}-${String(numericMonth).padStart(2, "0")}-01`);
    setEnd(new Date(numericYear, numericMonth, 0).toLocaleDateString("sv-SE"));
    setQuickPeriod("custom");
    setPage(1);
  };

  const summary = filteredSummary;
  const personalStatus = selfEmployee?.status ?? "Safe";
  const personalStatusContent = personalStatus === "SP1"
    ? { label: "SP1", icon: "🔴", message: "Anda sudah mencapai batas SP1", className: "border-red-300 bg-red-50 text-red-900" }
    : personalStatus === "Warning"
      ? { label: "WARNING", icon: "🟡", message: "Anda sudah mendekati batas keterlambatan", className: "border-amber-300 bg-amber-50 text-amber-900" }
      : { label: "SAFE", icon: "🟢", message: "Kehadiran Anda masih dalam batas aman", className: "border-emerald-300 bg-emerald-50 text-emerald-900" };

  return (
    <Layout>
      <div className="page-shell max-w-[1600px] space-y-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">Absensi Karyawan</h1>
            <p className="mt-1 text-sm text-slate-500">Import dan analisis data absensi Fingerspot</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageAttendance && (
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Data Absensi dari Mesin
              </Button>
            )}
            {canViewAll && <Button variant="outline" onClick={exportExcel}>
              <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>}
            {canManageAttendance && (
              <>
                <Button variant="outline" onClick={() => setHolidayOpen(true)}>
                  <CalendarDays className="mr-2 h-4 w-4" /> Kelola Libur
                </Button>
                <Button variant="outline" onClick={() => setMappingOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" /> Pengaturan Mapping
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardContent className={cn("grid gap-3 p-4 sm:grid-cols-2", canViewAll && "lg:grid-cols-4 xl:grid-cols-10")}>
            <FilterField label="Tanggal mulai"><Input type="date" value={start} onChange={(event) => { setStart(event.target.value); setQuickPeriod("custom"); setPage(1); }} /></FilterField>
            <FilterField label="Tanggal selesai"><Input type="date" value={end} onChange={(event) => { setEnd(event.target.value); setQuickPeriod("custom"); setPage(1); }} /></FilterField>
            {canViewAll && <>
            <FilterField label="Periode cepat">
              <Select value={quickPeriod} onValueChange={(value) => {
                if (value === "custom") return;
                setQuickPeriod(value as "payroll" | "month");
                setPage(1);
                if (value === "payroll") { setStart(payroll.start); setEnd(payroll.end); }
                if (value === "month") {
                  const now = new Date();
                  setStart(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
                  setEnd(new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("sv-SE"));
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="payroll">Payroll 21–20</SelectItem><SelectItem value="month">Bulan ini</SelectItem>{quickPeriod === "custom" && <SelectItem value="custom">Rentang manual</SelectItem>}</SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Bulan">
              <Select value={selectedMonth} onValueChange={(value) => applyMonthYear(value, selectedYear)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1);
                  const label = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2026, index, 1));
                  return <SelectItem key={value} value={value}>{label}</SelectItem>;
                })}</SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Tahun">
              <Select value={selectedYear} onValueChange={(value) => applyMonthYear(selectedMonth, value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 7 }, (_, index) => String(new Date().getFullYear() - 3 + index)).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Departemen">
              <Select value={department} onValueChange={(value) => { setDepartment(value); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Semua</SelectItem>{(summaryQuery.data?.departments ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Nama karyawan"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari nama..." /></FilterField>
            <FilterField label="Tipe karyawan">
              <Select value={employeeType} onValueChange={(value) => { setEmployeeType(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="Office">Office</SelectItem><SelectItem value="Produksi">Produksi</SelectItem></SelectContent></Select>
            </FilterField>
            <FilterField label="Status mapping">
              <Select value={mappingStatus} onValueChange={(value) => { setMappingStatus(value); setShowUnmapped(value === "unmapped"); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="mapped">Sudah mapping</SelectItem><SelectItem value="unmapped">Belum mapping</SelectItem></SelectContent></Select>
            </FilterField>
            <FilterField label="Status absensi">
              <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="Safe">Safe</SelectItem><SelectItem value="Warning">Warning</SelectItem><SelectItem value="SP1">SP1</SelectItem></SelectContent></Select>
            </FilterField>
            <div className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={onlyWithScans} onCheckedChange={(checked) => { setOnlyWithScans(Boolean(checked)); setPage(1); }} /><Label>Hanya karyawan yang punya scan</Label></div>
            <div className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={showAllActive} onCheckedChange={(checked) => { setShowAllActive(Boolean(checked)); setPage(1); }} /><Label>Tampilkan semua karyawan aktif dari Excel</Label></div>
            <div className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={showUnmapped} onCheckedChange={(checked) => { const value = Boolean(checked); setShowUnmapped(value); setMappingStatus(value ? "unmapped" : "all"); setPage(1); }} /><Label>Tampilkan karyawan belum mapping</Label></div>
            </>}
          </CardContent>
        </Card>

        {canViewAll ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <SummaryCard label="Total karyawan" value={summaryQuery.data?.summary.totalEmployees ?? 0} />
            <SummaryCard label="Total telat" value={summary?.totalLate ?? 0} />
            <SummaryCard label="Lembur produksi" value={formatNumber(summary?.totalOvertimeProduction ?? 0)} />
            <SummaryCard label="Lembur office" value={formatNumber(summary?.totalOvertimeOffice ?? 0)} />
            <SummaryCard label="Warning" value={summary?.warning ?? 0} />
            <SummaryCard label="SP1" value={summary?.sp1 ?? 0} />
            <SummaryCard label="Belum mapping" value={summary?.unmapped ?? 0} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Terlambat</p><p className="mt-2 text-3xl font-bold">{selfEmployee?.totalLate ?? 0} Kali</p></CardContent></Card>
            <Card className={personalStatusContent.className}><CardContent className="p-5"><p className="text-sm font-semibold">Status Absensi Saya</p><p className="mt-2 text-2xl font-black">{personalStatusContent.icon} {personalStatusContent.label}</p><p className="mt-2 text-sm">{personalStatusContent.message}</p></CardContent></Card>
          </div>
        )}

        {showUnmapped && canViewAll && (mappingsQuery.data?.pendingNames.length ?? 0) > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader><CardTitle className="text-base text-amber-900">Nama Belum Mapping</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {mappingsQuery.data?.pendingNames.map((name) => <Badge key={name} variant="outline" className="bg-white">{name}</Badge>)}
              {canManageAttendance && <Button size="sm" variant="outline" onClick={() => setMappingOpen(true)}>Mapping sekarang</Button>}
            </CardContent>
          </Card>
        )}

        {canViewAll ? <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader><CardTitle className="text-base">Rekap Absensi {start && end ? `(${formatDate(start)} – ${formatDate(end)})` : ""}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {summaryQuery.isLoading ? <Loading /> : summaryQuery.error ? <ErrorState text="Gagal memuat rekap absensi." /> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-xs">
                      <thead><tr className="border-y bg-slate-100">
                        <th className="px-4 py-3 text-left">Nama</th><th className="px-4 py-3 text-center">Sakit</th><th className="px-4 py-3 text-center">Izin</th><th className="px-4 py-3 text-center">Tukar Hari</th><th className="px-4 py-3 text-center">Cuti</th><th className="px-4 py-3 text-center">Tanpa Keterangan</th><th className="px-4 py-3 text-center">Dirumahkan</th><th className="px-4 py-3 text-center">Dinas Luar / Nginep</th><th className="px-4 py-3 text-center">Total Telat</th><th className="px-4 py-3 text-center">Lembur Produksi</th><th className="px-4 py-3 text-center">Lembur Office</th><th className="px-4 py-3 text-center">Status</th>
                      </tr></thead>
                      <tbody>{visibleEmployees.length === 0 ? <tr><td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">Belum ada rekap pada periode ini.</td></tr> : visibleEmployees.map((item) => (
                        <tr key={item.mappingId} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-3"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.department || "Tanpa departemen"}</p><Button size="sm" variant="ghost" className="mt-1 h-7 px-0 text-xs" onClick={() => setDetailId(item.mappingId)}><Eye className="mr-1 h-3.5 w-3.5" /> Detail</Button></td>
                          <td className="px-4 py-3 text-center">{item.sick}</td>
                          <td className="px-4 py-3 text-center">{item.permission}</td>
                          <td className="px-4 py-3 text-center">{item.daySwap}</td>
                          <td className="px-4 py-3 text-center">{item.leave}</td>
                          <td className="px-4 py-3 text-center">{item.withoutExplanation}</td>
                          <td className="px-4 py-3 text-center">{item.laidOff}</td>
                          <td className="px-4 py-3 text-center">{item.externalDuty}</td>
                          <td className="px-4 py-3 text-center">{item.totalLate}</td>
                          <td className="px-4 py-3 text-center">{formatNumber(item.overtimeProduction)}</td>
                          <td className="px-4 py-3 text-center">{formatNumber(item.overtimeOffice)}</td>
                          <td className="px-4 py-3 text-center"><Badge className={statusClass(item.status)}>{item.status.toUpperCase()}</Badge></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {totalPages > 1 && <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span>Halaman {page} dari {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tanggal Libur</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead><tr className="border-y bg-slate-100"><th className="px-3 py-3 text-left">Tanggal</th><th className="px-3 py-3 text-left">Keterangan</th></tr></thead>
                  <tbody>{(holidaysQuery.data ?? []).length === 0 ? <tr><td colSpan={2} className="px-3 py-10 text-center text-muted-foreground">Tidak ada tanggal libur.</td></tr> : holidaysQuery.data?.map((item) => <tr key={item.id} className="border-b"><td className="px-3 py-3 whitespace-nowrap">{formatShortDate(item.date)}</td><td className="px-3 py-3">{item.name}</td></tr>)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div> : (
          <Card>
            <CardHeader><CardTitle className="text-base">Riwayat Absensi Saya ({formatDate(start)} – {formatDate(end)})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {summaryQuery.isLoading || detailQuery.isLoading ? <Loading /> : summaryQuery.error ? <ErrorState text="Gagal memuat riwayat absensi." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead><tr className="border-y bg-slate-100"><th className="px-4 py-3 text-left">Tanggal</th><th className="px-4 py-3 text-left">Jam Masuk</th><th className="px-4 py-3 text-left">Jam Keluar</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Keterangan</th></tr></thead>
                    <tbody>{(detailQuery.data?.daily ?? []).length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Belum ada data absensi untuk akun ini pada periode tersebut.</td></tr> : detailQuery.data?.daily.map((item) => <tr key={item.id} className="border-b"><td className="px-4 py-3">{formatDate(item.workDate)}</td><td className="px-4 py-3">{item.clockIn ?? "-"}</td><td className="px-4 py-3">{item.clockOut ?? "-"}</td><td className="px-4 py-3"><Badge variant="outline" className={item.isLate ? "border-amber-300 bg-amber-50 text-amber-900" : ""}>{item.isLate ? "Terlambat" : item.dailyStatus}</Badge></td><td className="px-4 py-3">{item.notes ?? "-"}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open && preview) void cancelPreview();
        }}
        preview={preview}
        uploading={uploading}
        processing={processing}
        onFile={handleFile}
        onProcess={processImport}
        onMapping={() => { setMappingOpen(true); }}
        pendingBatch={pendingBatch}
        onResume={resumePreview}
      />
      <MappingDialog open={mappingOpen} onOpenChange={setMappingOpen} data={mappingsQuery.data} settings={settingsQuery.data} onSaved={refreshAfterMapping} />
      <HolidayDialog open={holidayOpen} onOpenChange={setHolidayOpen} holidays={holidaysQuery.data ?? []} settings={settingsQuery.data} onSaved={refreshAttendance} />
      {canViewAll && <DetailDialog open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }} data={detailQuery.data} loading={detailQuery.isLoading} canEdit={canManageAttendance} onSaved={refreshAttendance} />}
    </Layout>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>;
}

function Loading() {
  return <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
}

function ErrorState({ text }: { text: string }) {
  return <div className="px-4 py-12 text-center text-sm text-red-600">{text}</div>;
}

function UploadDialog({ open, onOpenChange, preview, uploading, processing, onFile, onProcess, onMapping, pendingBatch, onResume }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ImportPreview | null;
  uploading: boolean;
  processing: boolean;
  onFile: (file: File) => void;
  onProcess: () => void;
  onMapping: () => void;
  pendingBatch: ImportBatch | null;
  onResume: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Upload Data Absensi dari Mesin</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center hover:bg-slate-50">
        {uploading ? <Loader2 className="mb-2 h-8 w-8 animate-spin" /> : <FileSpreadsheet className="mb-2 h-8 w-8 text-primary" />}
        <span className="font-semibold">Pilih file Excel atau CSV</span><span className="text-xs text-muted-foreground">Format .xls, .xlsx, atau .csv; maksimal 20 MB</span>
        <input type="file" className="hidden" accept=".xls,.xlsx,.csv" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) onFile(file); }} />
      </label>
      {!preview && pendingBatch && (
        <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-950">Preview sebelumnya belum diproses</p>
            <p className="text-xs text-blue-700">{pendingBatch.fileName}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onResume}>Lanjutkan preview</Button>
        </div>
      )}
      {preview && <>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Jumlah baris" value={preview.totalRows} /><SummaryCard label="Baris valid" value={preview.validRows} /><SummaryCard label="Baris invalid" value={preview.invalidRows} /><SummaryCard label="Sudah mapping" value={preview.mappedNames.length} /><SummaryCard label="Belum mapping" value={preview.unmappedNames.length} /><SummaryCard label="Sheet" value={preview.sheetName} />
        </div>
        <p className="text-sm"><span className="font-semibold">File:</span> {preview.fileName} · <span className="font-semibold">Periode:</span> {preview.periodStart ?? "-"} sampai {preview.periodEnd ?? "-"}</p>
        {preview.unmappedNames.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Nama belum mapping</p><div className="mt-2 flex flex-wrap gap-2">{preview.unmappedNames.map((name) => <Badge key={name} variant="outline" className="bg-white">{name}</Badge>)}</div><Button className="mt-3" size="sm" variant="outline" onClick={onMapping}>Mapping sekarang</Button></div>}
        {preview.invalidDetails.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-sm font-semibold text-red-900">Baris invalid disimpan sebagai audit dan tidak diproses</p><div className="mt-2 max-h-32 overflow-y-auto text-xs text-red-800">{preview.invalidDetails.map((item) => <p key={item.rowNumber}>Baris {item.rowNumber}: {item.errors.join(", ")}</p>)}</div></div>}
        <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-xs"><thead><tr className="bg-slate-100"><th className="p-2 text-left">Baris</th><th className="p-2 text-left">Nama</th><th className="p-2 text-left">Tanggal</th><th className="p-2 text-left">Jam</th><th className="p-2 text-left">Departemen</th><th className="p-2 text-left">Validasi</th></tr></thead><tbody>{preview.preview.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.machineName || "-"}</td><td className="p-2">{row.scanDate || "-"}</td><td className="p-2">{row.scanTime || "-"}</td><td className="p-2">{row.department || "-"}</td><td className="p-2">{row.isValid ? "Valid" : "Invalid"}</td></tr>)}</tbody></table></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button><Button disabled={processing || preview.validRows === 0} onClick={onProcess}>{processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Proses Import</Button></div>
      </>}
    </div>
  </DialogContent></Dialog>;
}

function MappingDialog({ open, onOpenChange, data, settings, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: MappingResponse;
  settings?: SettingsData;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const usersQuery = useQuery({ queryKey: ["attendance-users"], queryFn: () => apiRequest<WebsiteUser[]>("/api/attendance/users"), enabled: open });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, { displayName: string; userId: string; employeeType: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [safeMax, setSafeMax] = useState<number | null>(null);
  const [warningMax, setWarningMax] = useState<number | null>(null);
  const defaultOfficeNames = new Set(["rais", "hafidz diinul", "alya", "ita", "ines", "dikri"]);
  type MappingRow = Omit<Mapping, "id"> & { id: number | null; pending: boolean };
  const rowsByName = new Map<string, MappingRow>((data?.mappings ?? []).map((item) => [
    item.machineName.trim().toLowerCase(),
    { ...item, pending: !item.isActive },
  ]));
  for (const machineName of data?.pendingNames ?? []) {
    const key = machineName.trim().toLowerCase();
    if (!rowsByName.has(key)) {
      rowsByName.set(key, {
        id: null,
        machineName,
        displayName: machineName,
        userId: null,
        userName: null,
        employeeType: defaultOfficeNames.has(key) ? "Office" : "Produksi",
        isActive: false,
        pending: true,
      });
    }
  }
  const rows = [...rowsByName.values()].filter((item) => {
    if (search && !item.machineName.toLowerCase().includes(search.toLowerCase()) && !item.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "mapped" && item.pending) return false;
    if (filter === "unmapped" && !item.pending) return false;
    return true;
  });
  const draftFor = (row: typeof rows[number]) => drafts[row.machineName] ?? { displayName: row.displayName, userId: row.userId ? String(row.userId) : "none", employeeType: row.employeeType };
  const save = async (row: typeof rows[number]) => {
    const draft = draftFor(row);
    setSaving(row.machineName);
    try {
      await apiRequest(row.id ? `/api/attendance/mappings/${row.id}` : "/api/attendance/mappings", {
        method: row.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineName: row.machineName, displayName: draft.displayName, userId: draft.userId === "none" ? null : Number(draft.userId), employeeType: draft.employeeType, isActive: true }),
      });
      await onSaved();
      toast({ title: "Mapping disimpan" });
    } catch (error) {
      toast({ title: "Mapping gagal disimpan", description: error instanceof Error ? error.message : "Periksa user yang dipilih", variant: "destructive" });
    } finally { setSaving(null); }
  };
  const saveSettings = async () => {
    try {
      await apiRequest("/api/attendance/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safeMax: safeMax ?? settings?.safeMax ?? 2, warningMax: warningMax ?? settings?.warningMax ?? 4, autoIndonesiaHoliday: settings?.autoIndonesiaHoliday ?? false }),
      });
      await onSaved();
      toast({ title: "Threshold absensi diperbarui" });
    } catch (error) {
      toast({ title: "Threshold gagal disimpan", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Pengaturan Mapping Absensi</DialogTitle></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama..." /><Select value={filter} onValueChange={setFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua mapping</SelectItem><SelectItem value="mapped">Sudah mapping</SelectItem><SelectItem value="unmapped">Belum mapping</SelectItem></SelectContent></Select></div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-100"><th className="p-3 text-left">Nama di mesin</th><th className="p-3 text-left">Nama tampilan</th><th className="p-3 text-left">User website (opsional)</th><th className="p-3 text-left">Tipe</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Aksi</th></tr></thead><tbody>{rows.map((row) => { const draft = draftFor(row); return <tr key={row.machineName.trim().toLowerCase()} className="border-t"><td className="p-3 font-semibold">{row.machineName}</td><td className="p-3"><Input value={draft.displayName} onChange={(event) => setDrafts((current) => ({ ...current, [row.machineName]: { ...draft, displayName: event.target.value } }))} /></td><td className="p-3"><Select value={draft.userId} onValueChange={(value) => setDrafts((current) => ({ ...current, [row.machineName]: { ...draft, userId: value } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Tanpa akun website</SelectItem>{usersQuery.data?.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Select value={draft.employeeType} onValueChange={(value) => setDrafts((current) => ({ ...current, [row.machineName]: { ...draft, employeeType: value } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Office">Office</SelectItem><SelectItem value="Produksi">Produksi</SelectItem></SelectContent></Select></td><td className="p-3"><Badge variant="outline" className={row.pending ? "border-amber-300 bg-amber-50" : row.isActive ? "border-green-300 bg-green-50" : "bg-slate-100"}>{row.pending ? "Belum mapping" : row.isActive ? "Aktif" : "Nonaktif"}</Badge></td><td className="p-3"><div className="flex gap-2"><Button size="sm" onClick={() => save(row)} disabled={saving !== null}>{saving === row.machineName && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Simpan</Button>{row.id && <Button size="sm" variant="outline" onClick={async () => { try { await apiRequest(`/api/attendance/mappings/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !row.isActive }) }); await onSaved(); } catch (error) { toast({ title: "Status mapping gagal diubah", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" }); } }}>{row.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>}</div></td></tr>; })}</tbody></table></div>
    <Card><CardHeader><CardTitle className="text-base">Threshold Status Global</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end"><FilterField label="Safe maksimal telat"><Input type="number" min={0} value={safeMax ?? settings?.safeMax ?? 2} onChange={(event) => setSafeMax(Number(event.target.value))} /></FilterField><FilterField label="Warning maksimal telat"><Input type="number" min={1} value={warningMax ?? settings?.warningMax ?? 4} onChange={(event) => setWarningMax(Number(event.target.value))} /></FilterField><Button onClick={saveSettings}>Simpan Threshold</Button></CardContent></Card>
  </DialogContent></Dialog>;
}

function HolidayDialog({ open, onOpenChange, holidays, settings, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holidays: Holiday[];
  settings?: SettingsData;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("Libur Nasional");
  const [source, setSource] = useState("Manual");
  const [syncing, setSyncing] = useState(false);
  const reset = () => { setEditingId(null); setDate(""); setName(""); setType("Libur Nasional"); setSource("Manual"); };
  const save = async () => {
    try {
      await apiRequest(editingId ? `/api/attendance/holidays/${editingId}` : "/api/attendance/holidays", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, name, holidayType: type, source }),
      });
      reset(); await onSaved(); toast({ title: "Tanggal libur disimpan" });
    } catch (error) {
      toast({ title: "Tanggal libur gagal disimpan", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const updateAuto = async (checked: boolean) => {
    try {
      await apiRequest("/api/attendance/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, autoIndonesiaHoliday: checked }) });
      await onSaved();
      if (checked) await sync();
    } catch (error) {
      toast({ title: "Pengaturan libur otomatis gagal diubah", description: error instanceof Error ? error.message : "Data manual tetap dapat digunakan.", variant: "destructive" });
      await onSaved();
    }
  };
  const sync = async () => {
    setSyncing(true);
    try {
      const year = new Date().getFullYear();
      const result = await apiRequest<{ message: string }>("/api/attendance/holidays/sync-indonesia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ years: [year - 1, year, year + 1] }) });
      await onSaved(); toast({ title: "Sinkronisasi libur", description: result.message });
    } catch (error) {
      toast({ title: "Sinkronisasi libur tidak tersedia", description: error instanceof Error ? `${error.message}. Data manual tetap digunakan.` : "Data manual tetap digunakan.", variant: "destructive" });
    } finally { setSyncing(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Kelola Tanggal Libur</DialogTitle></DialogHeader>
    <div className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">Gunakan tanggal merah Indonesia otomatis</p><p className="text-xs text-muted-foreground">Jika layanan gagal, data manual tetap digunakan dan aplikasi tidak error.</p></div><div className="flex items-center gap-2"><Switch checked={settings?.autoIndonesiaHoliday ?? false} onCheckedChange={updateAuto} /><Button size="sm" variant="outline" disabled={syncing} onClick={sync}>{syncing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Sinkronkan</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><FilterField label="Tanggal"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></FilterField><FilterField label="Keterangan"><Input value={name} onChange={(event) => setName(event.target.value)} /></FilterField><FilterField label="Jenis"><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Libur Nasional", "Cuti Bersama", "Libur Perusahaan", "Tanggal Merah", "Lainnya"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></FilterField><FilterField label="Sumber"><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Manual">Manual</SelectItem><SelectItem value="Auto Indonesia Holiday">Auto Indonesia Holiday</SelectItem></SelectContent></Select></FilterField></div>
    <div className="flex gap-2"><Button disabled={!date || !name} onClick={save}>{editingId ? "Simpan Perubahan" : "Tambah Libur"}</Button>{editingId && <Button variant="outline" onClick={reset}>Batal edit</Button>}</div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[650px] text-sm"><thead><tr className="bg-slate-100"><th className="p-3 text-left">Tanggal</th><th className="p-3 text-left">Keterangan</th><th className="p-3 text-left">Jenis</th><th className="p-3 text-left">Sumber</th><th className="p-3 text-left">Aksi</th></tr></thead><tbody>{holidays.map((item) => <tr key={`${item.source}-${item.id}-${item.date}`} className="border-t"><td className="p-3">{formatDate(item.date)}</td><td className="p-3">{item.name}</td><td className="p-3">{item.holidayType}</td><td className="p-3">{item.source}</td><td className="p-3">{item.editable === false ? <span className="text-xs text-muted-foreground">Dikelola fitur existing</span> : <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingId(item.id); setDate(item.date); setName(item.name); setType(item.holidayType); setSource(item.source); }}>Edit</Button><Button size="sm" variant="destructive" onClick={async () => { if (!window.confirm(`Hapus libur ${item.name}?`)) return; try { await apiRequest(`/api/attendance/holidays/${item.id}`, { method: "DELETE" }); await onSaved(); toast({ title: "Tanggal libur dihapus" }); } catch (error) { toast({ title: "Tanggal libur gagal dihapus", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" }); } }}>Hapus</Button></div>}</td></tr>)}</tbody></table></div>
  </DialogContent></Dialog>;
}

function DetailDialog({ open, onOpenChange, data, loading, canEdit, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; data?: DetailResponse; loading: boolean; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const saveCorrection = async (workDate: string, dailyStatus: string) => {
    if (!data) return;
    try {
      await apiRequest("/api/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId: data.employee.mappingId, workDate, dailyStatus }),
      });
      await onSaved();
      toast({ title: "Koreksi absensi disimpan" });
    } catch (error) {
      toast({ title: "Koreksi gagal disimpan", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const resetCorrection = async (workDate: string) => {
    if (!data) return;
    try {
      await apiRequest(`/api/attendance/corrections?mappingId=${data.employee.mappingId}&workDate=${workDate}`, { method: "DELETE" });
      await onSaved();
      toast({ title: "Koreksi absensi dihapus" });
    } catch (error) {
      toast({ title: "Koreksi gagal dihapus", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Detail Absensi Karyawan</DialogTitle></DialogHeader>
    {loading ? <Loading /> : data ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><SummaryCard label="Nama" value={data.employee.name} /><SummaryCard label="Tipe" value={data.employee.employeeType} /><SummaryCard label="Total telat" value={data.employee.totalLate} /><SummaryCard label="Lembur produksi" value={formatNumber(data.employee.overtimeProduction)} /><SummaryCard label="Lembur office" value={formatNumber(data.employee.overtimeOffice)} /><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Status periode</p><Badge className={cn("mt-2", statusClass(data.employee.status))}>{data.employee.status}</Badge></CardContent></Card></div>
      <div className="grid gap-3 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Daftar tanggal telat</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data.daily.filter((item) => item.isLate).length ? data.daily.filter((item) => item.isLate).map((item) => <Badge key={item.id} variant="outline">{formatDate(item.workDate)}</Badge>) : <span className="text-sm text-muted-foreground">Tidak ada.</span>}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Daftar tanggal lembur</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data.daily.filter((item) => Number(item.overtimeProduction) > 0 || Number(item.overtimeOffice) > 0).length ? data.daily.filter((item) => Number(item.overtimeProduction) > 0 || Number(item.overtimeOffice) > 0).map((item) => <Badge key={item.id} variant="outline">{formatDate(item.workDate)}</Badge>) : <span className="text-sm text-muted-foreground">Tidak ada.</span>}</CardContent></Card></div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="bg-slate-100"><th className="p-3 text-left">Tanggal</th><th className="p-3 text-left">Jam Masuk</th><th className="p-3 text-left">Jam Pulang</th><th className="p-3 text-center">Total Scan</th><th className="p-3 text-left">Scan Mentah</th><th className="p-3 text-left">Status Masuk</th><th className="p-3 text-left">Status Pulang</th><th className="p-3 text-left">Status Harian</th>{canEdit && <th className="p-3 text-left">Koreksi Manual</th>}<th className="p-3 text-left">Keterangan</th></tr></thead><tbody>{data.daily.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{formatDate(item.workDate)}</td><td className="p-3">{item.clockIn ?? "-"}</td><td className="p-3">{item.clockOut ?? "-"}</td><td className="p-3 text-center">{item.totalScans}</td><td className="p-3">{data.rawScans.filter((scan) => scan.workDate === item.workDate).map((scan) => `${scan.scanTime}${scan.ioType ? ` (${scan.ioType === "1" ? "Masuk" : scan.ioType === "2" ? "Pulang" : scan.ioType})` : ""}`).join(", ") || "-"}</td><td className="p-3">{item.entryStatus}</td><td className="p-3">{item.exitStatus}</td><td className="p-3">{item.dailyStatus}</td>{canEdit && <td className="p-3"><div className="flex min-w-44 gap-2"><Select value={MANUAL_STATUS_OPTIONS.includes(item.dailyStatus) ? item.dailyStatus : "Hadir"} onValueChange={(value) => saveCorrection(item.workDate, value)}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{MANUAL_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" onClick={() => resetCorrection(item.workDate)}>Reset</Button></div></td>}<td className="p-3">{item.notes ?? "-"}</td></tr>)}</tbody></table></div>
    </div> : <ErrorState text="Detail tidak ditemukan." />}
  </DialogContent></Dialog>;
}
