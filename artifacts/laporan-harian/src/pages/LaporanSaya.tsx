import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTodayReport, useCreateReport, useUpdateReport, useSubmitReport,
  useCreateTask, useUpdateTask, useDeleteTask, useGetYesterdayTasks,
  getGetTodayReportQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Trash2, Copy, Send, Save, Loader2, FileText,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { formatJakartaDateLong, getJakartaDateString } from "@/lib/date";

const TASK_STATUSES = [
  { value: "belum_mulai", label: "Belum Mulai", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "proses", label: "Proses", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "selesai", label: "Selesai", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "pending", label: "Pending", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

const REPORT_STATUSES = [
  { value: "draf", label: "Draf", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "dikirim", label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "direview", label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "perlu_revisi", label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function getStatusInfo(status: string) {
  return TASK_STATUSES.find(s => s.value === status) ?? TASK_STATUSES[0];
}

function getReportStatusInfo(status: string) {
  return REPORT_STATUSES.find(s => s.value === status) ?? REPORT_STATUSES[0];
}

type DeliveryInputMode = "date" | "text";

function isDateOnly(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDeliveryValue(value: string | null | undefined) {
  if (!value) return "";
  if (!isDateOnly(value)) return value;

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function TaskDeliveryInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [mode, setMode] = useState<DeliveryInputMode>(isDateOnly(value) || !value ? "date" : "text");
  const [draft, setDraft] = useState(value);

  const handleModeChange = (nextMode: DeliveryInputMode) => {
    setMode(nextMode);

    if (nextMode === "date" && !isDateOnly(draft)) {
      setDraft("");
    }
  };

  const commit = () => {
    onCommit(draft.trim());
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={mode}
        disabled={disabled}
        onValueChange={(nextMode) => handleModeChange(nextMode as DeliveryInputMode)}
      >
        <SelectTrigger className="h-8 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Pilih Tanggal</SelectItem>
          <SelectItem value="text">Isi Teks Manual</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type={mode === "date" ? "date" : "text"}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={mode === "date" ? undefined : "Urgent / Menunggu konfirmasi"}
        className="h-8 min-w-40 flex-1 text-sm"
      />
    </div>
  );
}

interface TaskForm {
  title: string;
  project: string;
  deadline: string;
  progress: number;
  status: string;
  notes: string;
}

interface NewTask extends TaskForm {
  id: string;
}

interface ExistingTask {
  id: number;
  reportId: number;
  title: string;
  project: string | null;
  deadline: string | null;
  progress: number;
  status: string;
  notes: string | null;
  editCount: number;
  remainingActions: number;
  isLocked: boolean;
  isDelay: boolean;
  createdAt: string;
}

interface ReportData {
  id: number;
  date: string;
  status: string;
  tasks?: ExistingTask[];
  obstacles?: string | null;
  additionalNotes?: string | null;
  tomorrowPlan?: string | null;
}

export default function LaporanSaya() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = getJakartaDateString();
  const todayFormatted = formatJakartaDateLong();

  const { data: todayReport, isLoading, isError } = useGetTodayReport({
    query: { queryKey: getGetTodayReportQueryKey(), retry: false }
  });

  const { data: yesterdayTasks } = useGetYesterdayTasks();
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();
  const submitReport = useSubmitReport();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [newTasks, setNewTasks] = useState<NewTask[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string | number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingSubmitted, setIsEditingSubmitted] = useState(false);
  const [editableTasks, setEditableTasks] = useState<ExistingTask[]>([]);
  const [deletedTaskIds, setDeletedTaskIds] = useState<number[]>([]);
  const hasAutoCopiedYesterdayTasks = useRef(false);

  const report = (isError ? null : todayReport) as ReportData | null;
  const existingTasks: ExistingTask[] = report?.tasks ?? [];
const isSubmitted = report?.status === "dikirim";
const isReviewed = report?.status === "direview";
const isPastReport = !!report?.date && report.date !== today;

const isLocked = isReviewed || isPastReport;
const showSubmittedReadOnly = isSubmitted && !isEditingSubmitted;
const displayedExistingTasks = isEditingSubmitted ? editableTasks : existingTasks;

const canEditReportFields =
  !report || report.status === "draf" || report.status === "perlu_revisi" || isEditingSubmitted;

const canModifyExistingTasks =
  !!report && !isReviewed && !isPastReport;

const canAddNewTasks = canEditReportFields;
const showSubmitActions = canEditReportFields && !isLocked && !isEditingSubmitted;
   const { register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: {
      obstacles: "",
      additionalNotes: "",
      tomorrowPlan: "",
    }
  });

  const watchedTomorrowPlan = watch("tomorrowPlan") ?? "";

  const hasRequiredTask =
    displayedExistingTasks.some((task) => task.title.trim().length > 0) ||
    newTasks.some((task) => task.title.trim().length > 0);

  const hasRequiredTomorrowPlan = watchedTomorrowPlan.trim().length > 0;

  const isReportIncomplete = !hasRequiredTask || !hasRequiredTomorrowPlan;

  const refreshDashboardAndMonitoring = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary", today] });
    queryClient.invalidateQueries({ queryKey: ["dept-productivity", today] });
    queryClient.invalidateQueries({ queryKey: ["missing-daily-reports", today] });
    queryClient.invalidateQueries();
  };

  useEffect(() => {
    if (report) {
      setValue("obstacles", report.obstacles ?? "");
      setValue("additionalNotes", report.additionalNotes ?? "");
      setValue("tomorrowPlan", report.tomorrowPlan ?? "");
    }
  }, [report, setValue]);

  const addNewTask = () => {
  const id = Date.now().toString();

  setNewTasks(prev => [
  ...prev,
  {
    id,
    title: "",
    project: "",
    deadline: "",
    progress: 0,
    status: "belum_mulai",
    notes: "",
  },
]);

  setExpandedTasks(prev => new Set([...prev, id]));
};

  const removeNewTask = (id: string) => setNewTasks(prev => prev.filter(t => t.id !== id));

  const updateNewTask = (id: string, field: keyof TaskForm, value: string | number) =>
    setNewTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  const copyYesterdayTasksToToday = (showToast = true) => {
  if (!yesterdayTasks || !Array.isArray(yesterdayTasks)) return;

  const copies = (yesterdayTasks as ExistingTask[])
    .filter((task) => task.status !== "selesai" && task.title.trim().length > 0)
    .map((t) => ({
      id: Date.now().toString() + Math.random(),
      title: t.title,
      project: t.project ?? "",
      deadline: t.deadline ?? "",
      progress: t.progress,
      status: t.status,
      notes: t.notes ?? "",
    }));

  if (copies.length === 0) {
    if (showToast) {
      toast({
        title: "Tidak ada tugas yang perlu dipindahkan",
        description: "Semua tugas kemarin sudah selesai atau kosong.",
      });
    }
    return;
  }

  setNewTasks((prev) => [...prev, ...copies]);
  setExpandedTasks((prev) => new Set([...prev, ...copies.map((t) => t.id)]));

  if (showToast) {
    toast({
      title: "Tugas kemarin ditambahkan",
      description: `${copies.length} tugas yang belum selesai otomatis masuk ke laporan hari ini.`,
    });
  }
};

const handleCopyYesterday = () => {
  copyYesterdayTasksToToday(true);
};

useEffect(() => {
  if (hasAutoCopiedYesterdayTasks.current) return;
  if (report) return;
  if (!yesterdayTasks || !Array.isArray(yesterdayTasks) || yesterdayTasks.length === 0) return;

  hasAutoCopiedYesterdayTasks.current = true;
  copyYesterdayTasksToToday(true);
}, [yesterdayTasks, report]);

    const validateRequiredReportFields = (data: {
    obstacles: string;
    additionalNotes: string;
    tomorrowPlan: string;
  }) => {
    const hasExistingTask = displayedExistingTasks.some((task) => task.title.trim().length > 0);
    const hasNewTask = newTasks.some((task) => task.title.trim().length > 0);
    const hasTask = hasExistingTask || hasNewTask;

    if (!hasTask) {
      toast({
        title: "Laporan belum lengkap",
        description: "Daftar Tugas Hari Ini wajib diisi minimal 1 tugas.",
        variant: "destructive",
      });
      return false;
    }

    if (!data.tomorrowPlan.trim()) {
      toast({
        title: "Laporan belum lengkap",
        description: "Rencana Besok & Target wajib diisi.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const startEditSubmittedReport = () => {
    if (!report) return;

    setEditableTasks(existingTasks.map((task) => ({ ...task })));
    setDeletedTaskIds([]);
    setNewTasks([]);
    setExpandedTasks(new Set(existingTasks.map((task) => task.id)));
    setValue("obstacles", report.obstacles ?? "");
    setValue("additionalNotes", report.additionalNotes ?? "");
    setValue("tomorrowPlan", report.tomorrowPlan ?? "");
    setIsEditingSubmitted(true);
  };

  const cancelEditSubmittedReport = () => {
    setIsEditingSubmitted(false);
    setEditableTasks([]);
    setDeletedTaskIds([]);
    setNewTasks([]);
    setExpandedTasks(new Set());
    if (report) {
      setValue("obstacles", report.obstacles ?? "");
      setValue("additionalNotes", report.additionalNotes ?? "");
      setValue("tomorrowPlan", report.tomorrowPlan ?? "");
    }
  };

  const updateEditableTask = (taskId: number, field: keyof TaskForm, value: string | number) => {
    setEditableTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, [field]: value } : task)),
    );
  };

  const deleteEditableTask = (taskId: number) => {
    const task = editableTasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!window.confirm(`Hapus tugas "${task.title}"?`)) return;

    setEditableTasks((prev) => prev.filter((item) => item.id !== taskId));
    setDeletedTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
  };

  // Core save: returns the reportId after saving report + all pending new tasks
  const saveAll = async (data: { obstacles: string; additionalNotes: string; tomorrowPlan: string }): Promise<number> => {
    let reportId: number;
    if (!report) {
      const created = await createReport.mutateAsync({
        data: { date: today, ...data, status: "draf" }
      }) as { id: number };
      reportId = created.id;
    } else {
      await updateReport.mutateAsync({ id: report.id, data });
      reportId = report.id;
    }
    for (const task of newTasks) {
      if (!task.title.trim()) continue;
      await createTask.mutateAsync({
        id: reportId,
      data: {
        title: task.title,
        project: task.project,
        deadline: task.deadline || undefined,
        progress: task.progress,
        status: task.status,
        notes: task.notes,
      }
      });
    }
    setNewTasks([]);
    return reportId;
  };

  const handleSaveSubmittedChanges = async (data: { obstacles: string; additionalNotes: string; tomorrowPlan: string }) => {
    if (!report || !validateRequiredReportFields(data)) return;

    setIsSaving(true);
    try {
      await updateReport.mutateAsync({ id: report.id, data });

      for (const taskId of deletedTaskIds) {
        await deleteTask.mutateAsync({ taskId });
      }

      const originalTasks = new Map(existingTasks.map((task) => [task.id, task]));
      for (const task of editableTasks) {
        if (!task.title.trim()) continue;

        const original = originalTasks.get(task.id);
        const dataToSave = {
          title: task.title,
          project: task.project ?? "",
          deadline: task.deadline || undefined,
          progress: task.progress,
          status: task.status,
          notes: task.notes ?? "",
        };

        if (
          !original ||
          original.title !== task.title ||
          (original.project ?? "") !== (task.project ?? "") ||
          (original.deadline ?? "") !== (task.deadline ?? "") ||
          original.progress !== task.progress ||
          original.status !== task.status ||
          (original.notes ?? "") !== (task.notes ?? "")
        ) {
          await updateTask.mutateAsync({ taskId: task.id, data: dataToSave });
        }
      }

      for (const task of newTasks) {
        if (!task.title.trim()) continue;
        await createTask.mutateAsync({
          id: report.id,
          data: {
            title: task.title,
            project: task.project,
            deadline: task.deadline || undefined,
            progress: task.progress,
            status: task.status,
            notes: task.notes,
          },
        });
      }

      setIsEditingSubmitted(false);
      setEditableTasks([]);
      setDeletedTaskIds([]);
      setNewTasks([]);
      setExpandedTasks(new Set());
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      refreshDashboardAndMonitoring();
      toast({ title: "Perubahan tersimpan", description: "Laporan terkirim berhasil diperbarui" });
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Gagal menyimpan perubahan",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

   const handleSaveReport = async (data: { obstacles: string; additionalNotes: string; tomorrowPlan: string }) => {
    if (!validateRequiredReportFields(data)) return;

    setIsSaving(true);
    try {
      await saveAll(data);
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      refreshDashboardAndMonitoring();
      toast({ title: "Tersimpan", description: "Laporan berhasil disimpan sebagai draf" });
    } catch {
      toast({ title: "Gagal", description: "Gagal menyimpan laporan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Submit = auto-save then submit in one click
    const handleSubmitReport = async () => {
    const formData = getValues();

    if (!validateRequiredReportFields(formData)) return;

    setIsSubmitting(true);
    try {

      const reportId = await saveAll(formData);
      await submitReport.mutateAsync({ id: reportId });
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      refreshDashboardAndMonitoring();
      toast({ title: "Laporan Terkirim!", description: "Laporan harian Anda berhasil dikirim untuk review" });
    } catch {
      toast({ title: "Gagal", description: "Gagal mengirim laporan", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExistingTask = async (taskId: number, field: string, value: string | number) => {
  const task = existingTasks.find(t => t.id === taskId);

  if (!task || !canModifyExistingTasks || task.isLocked || task.remainingActions <= 0) {
    toast({
      title: "Tugas terkunci",
      description: "Tugas ini sudah tidak bisa diedit. Batas edit/hapus 2x sudah habis atau tanggal laporan sudah berganti.",
      variant: "destructive",
    });
    return;
  }

  try {
    await updateTask.mutateAsync({ taskId, data: { [field]: value } });
    queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
    toast({
      title: "Tugas diperbarui",
      description: `Sisa kesempatan edit/hapus: ${Math.max(0, task.remainingActions - 1)}x.`,
    });
  } catch (error) {
    toast({
      title: "Gagal",
      description: error instanceof Error ? error.message : "Gagal memperbarui tugas",
      variant: "destructive",
    });
  }
};

  const handleDeleteExistingTask = async (taskId: number) => {
  const task = existingTasks.find(t => t.id === taskId);

  if (!task || !canModifyExistingTasks || task.isLocked || task.remainingActions <= 0) {
    toast({
      title: "Tugas terkunci",
      description: "Tugas ini sudah tidak bisa dihapus. Batas edit/hapus 2x sudah habis atau tanggal laporan sudah berganti.",
      variant: "destructive",
    });
    return;
  }

  if (!window.confirm(`Hapus tugas "${task.title}"?`)) return;

  try {
    await deleteTask.mutateAsync({ taskId });
    queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
    toast({ title: "Berhasil", description: "Tugas berhasil dihapus" });
  } catch (error) {
    toast({
      title: "Gagal",
      description: error instanceof Error ? error.message : "Gagal menghapus tugas",
      variant: "destructive",
    });
  }
};

  const toggleExpand = (id: string | number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const reportStatus = getReportStatusInfo(report?.status ?? "draf");

  return (
    <Layout>
      <div className="page-shell space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-foreground">Laporan Harian Saya</h1>
              {report && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${reportStatus.color}`}>
                  {reportStatus.label}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{todayFormatted}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.name} &bull; {user?.departmentName ?? "—"}</p>
          </div>
              {showSubmitActions && (
          <div className="flex flex-wrap gap-2">
              <Button
            variant="outline"
            onClick={handleSubmit(handleSaveReport)}
            disabled={isSaving || isSubmitting || isReportIncomplete}
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Draf
          </Button>
          <Button
            onClick={handleSubmitReport}
            disabled={isSubmitting || isSaving || isReportIncomplete}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Kirim Laporan
          </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : isLocked || showSubmittedReadOnly ? (
          /* Locked/submitted view */
          <div className="space-y-5">
            <Card className={`border ${report?.status === "direview" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                {report?.status === "direview"
                  ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  : <Clock className="w-5 h-5 text-blue-600 shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold ${report?.status === "direview" ? "text-green-800" : "text-blue-800"}`}>
                    {report?.status === "direview"
                      ? "Laporan sudah direview"
                      : "Laporan sudah dikirim — menunggu review"}
                  </p>
                  <p className={`text-xs mt-0.5 ${report?.status === "direview" ? "text-green-600" : "text-blue-600"}`}>
                    {showSubmittedReadOnly
                      ? "Klik Edit untuk mengubah tugas dan detail laporan hari ini"
                      : "Laporan tidak dapat diubah setelah direview atau tanggal laporan sudah berganti"}
                  </p>
                </div>
                </div>
              </CardContent>
            </Card>

            {/* Read-only task list */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Daftar Tugas Hari Ini</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-muted-foreground">{existingTasks.length} tugas</span>
                    {showSubmittedReadOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={startEditSubmittedReport}>
                        Edit
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {existingTasks.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">Tidak ada tugas</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tugas</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Project</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingTasks.map(task => {
                        const ts = getStatusInfo(task.status);
                        return (
                          <tr key={task.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium text-foreground">{task.title}</td>
                            <td className="px-4 py-3 text-muted-foreground">{task.project ?? "—"}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ts.color}`}>{ts.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${task.progress}%` }} />
                                </div>
                                <span className="text-xs font-medium w-8">{task.progress}%</span>
                              </div>
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
        ) : (
          /* Editable form */
          <form onSubmit={handleSubmit(isEditingSubmitted ? handleSaveSubmittedChanges : handleSaveReport)}>
            <div className="space-y-5">
              {isSubmitted && (
                <Card className="border border-blue-200 bg-blue-50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Laporan sudah dikirim</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Anda bisa menambah, mengedit, menghapus tugas, dan memperbarui detail laporan hari ini.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* Perlu Revisi banner */}
              {report?.status === "perlu_revisi" && (
                <Card className="border border-orange-200 bg-orange-50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800">Laporan perlu direvisi</p>
                      <p className="text-xs text-orange-600 mt-0.5">Revisi diminta. Silakan perbarui dan kirim kembali.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tasks Section */}
                <Card className="border border-border bg-white">
                  <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">
                      Daftar Tugas Hari Ini <span className="text-destructive">*</span>
                    </CardTitle>                    <div className="flex flex-wrap gap-2">
                      {yesterdayTasks && Array.isArray(yesterdayTasks) && yesterdayTasks.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={handleCopyYesterday}>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Ambil Tugas Kemarin
                        </Button>
                      )}
                      {canAddNewTasks && (
                        <Button type="button" variant="outline" size="sm" onClick={addNewTask}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Tambah Tugas
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {displayedExistingTasks.length === 0 && newTasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Belum ada tugas. Klik "Tambah Tugas" untuk mulai.</p>
                    </div>
                  )}

                  {/* Existing Tasks */}
                  {displayedExistingTasks.map(task => {
                    const statusInfo = getStatusInfo(task.status);
                    const isExpanded = expandedTasks.has(task.id);
                    const taskLocked = !canModifyExistingTasks || task.isLocked || task.remainingActions <= 0;
                    return (
                          <div key={task.id} className="border border-border rounded-lg overflow-hidden bg-white">                        
                          <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(task.id)}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>

                            {task.isDelay && (
                              <span className="text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 bg-red-100 text-red-700 border-red-200">
                                Delay
                              </span>
                            )}

                            {task.remainingActions <= 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 bg-slate-100 text-slate-700 border-slate-200">
                                Terkunci
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-foreground flex-1 truncate">{task.title}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              {task.project && (
                                <span className="text-xs text-muted-foreground">
                                  Project: {task.project}
                                </span>
                              )}

                              {task.deadline && (
                                <span className={`text-xs ${task.isDelay ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                  Tanggal Delivery: {formatDeliveryValue(task.deadline)}
                                </span>
                              )}

                              <span className="text-xs text-muted-foreground">
                                Sisa edit/hapus: {task.remainingActions}x
                              </span>
                            </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold text-primary">{task.progress}%</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-4 bg-muted/20 border-t border-border space-y-3">
                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Nama Tugas</Label>
                                  <Input
                                    defaultValue={task.title}
                                    disabled={taskLocked}
                                    onBlur={e => isEditingSubmitted ? updateEditableTask(task.id, "title", e.target.value) : handleUpdateExistingTask(task.id, "title", e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Project</Label>
                                  <Input
                                    defaultValue={task.project ?? ""}
                                    disabled={taskLocked}
                                    onBlur={e => isEditingSubmitted ? updateEditableTask(task.id, "project", e.target.value) : handleUpdateExistingTask(task.id, "project", e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Tanggal Delivery</Label>
                                  <TaskDeliveryInput
                                    value={task.deadline ?? ""}
                                    disabled={taskLocked}
                                    onCommit={(value) =>
                                      isEditingSubmitted
                                        ? updateEditableTask(task.id, "deadline", value)
                                        : handleUpdateExistingTask(task.id, "deadline", value)
                                    }
                                  />
                                </div>
                              </div>

                              <div className={`rounded-md border p-2 text-xs ${taskLocked ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                                {taskLocked
                                  ? "Tugas terkunci. Batas edit/hapus sudah habis atau tanggal laporan sudah berganti."
                                  : `Sisa kesempatan edit/hapus tugas ini: ${task.remainingActions}x.`}
                              </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                  <Select disabled={taskLocked} defaultValue={task.status} onValueChange={v => isEditingSubmitted ? updateEditableTask(task.id, "status", v) : handleUpdateExistingTask(task.id, "status", v)}>
                                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Progress ({task.progress}%)</Label>
                                <div className="pt-2">
                                  <Slider
                                    disabled={taskLocked}
                                    defaultValue={[task.progress]}
                                    min={0}
                                    max={100}
                                    step={5}
                                    onValueChange={v => isEditingSubmitted && updateEditableTask(task.id, "progress", v[0])}
                                    onValueCommit={v => !isEditingSubmitted && handleUpdateExistingTask(task.id, "progress", v[0])}
                                  /> 
                                 </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Catatan Tugas</Label>
                                <Input
                                  defaultValue={task.notes ?? ""}
                                  disabled={taskLocked}
                                  onBlur={e => isEditingSubmitted ? updateEditableTask(task.id, "notes", e.target.value) : handleUpdateExistingTask(task.id, "notes", e.target.value)}
                                  className="h-8 text-sm"
                                  placeholder="Catatan opsional..."
                                /> 
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={taskLocked}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                onClick={() => isEditingSubmitted ? deleteEditableTask(task.id) : handleDeleteExistingTask(task.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                Hapus Tugas
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* New Tasks */}
                  {newTasks.map(task => (
                        <div key={task.id} className="border border-border rounded-lg bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-primary">Tugas Baru</span>
                        <Button type="button" variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeNewTask(task.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nama Tugas *</Label>
                        <Input
                          value={task.title}
                          onChange={e => updateNewTask(task.id, "title", e.target.value)}
                          placeholder="Nama tugas..."
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Project</Label>
                        <Input
                          value={task.project}
                          onChange={e => updateNewTask(task.id, "project", e.target.value)}
                          placeholder="Nama project..."
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Tanggal Delivery</Label>
                        <TaskDeliveryInput
                          value={task.deadline}
                          onCommit={(value) => updateNewTask(task.id, "deadline", value)}
                        />
                      </div>
                    </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <Select value={task.status} onValueChange={v => updateNewTask(task.id, "status", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Progress ({task.progress}%)</Label>
                          <div className="pt-2">
                            <Slider value={[task.progress]} min={0} max={100} step={5} onValueChange={v => updateNewTask(task.id, "progress", v[0])} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Catatan Tugas</Label>
                        <Input value={task.notes} onChange={e => updateNewTask(task.id, "notes", e.target.value)} placeholder="Catatan opsional..." className="h-8 text-sm" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Report Fields */}
              <div className="grid grid-cols-1 gap-5">
                <Card className="border border-border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Persoalan yang Dihadapi</CardTitle></CardHeader>
                  <CardContent>
                    <Textarea {...register("obstacles")} placeholder="Tuliskan kendala atau persoalan yang dihadapi hari ini..." rows={3} className="resize-none" />
                  </CardContent>
                </Card>
                <Card className="border border-border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Catatan Tambahan</CardTitle></CardHeader>
                  <CardContent>
                    <Textarea {...register("additionalNotes")} placeholder="Catatan tambahan lainnya..." rows={3} className="resize-none" />
                  </CardContent>
                </Card>
                <Card className="border border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Rencana Besok & Target <span className="text-destructive">*</span>
                    </CardTitle>
                  </CardHeader>                  <CardContent>
                    <Textarea {...register("tomorrowPlan")} placeholder="Tuliskan rencana dan target untuk hari besok..." rows={3} className="resize-none" />
                  </CardContent>
                </Card>
              </div>
              
              {isReportIncomplete && (
                <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Lengkapi minimal 1 tugas hari ini dan isi Rencana Besok & Target sebelum menyimpan laporan.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                {isEditingSubmitted && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={cancelEditSubmittedReport}
                  >
                    Batal
                  </Button>
                )}
                <Button
                type="submit"
                variant="outline"
                disabled={isSaving || isSubmitting || isReportIncomplete}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {isEditingSubmitted ? "Simpan Perubahan" : "Simpan Draf"}
              </Button>
              {!isEditingSubmitted && (
                <Button
                  type="button"
                  onClick={handleSubmitReport}
                  disabled={isSubmitting || isSaving || isReportIncomplete}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Kirim Laporan
                </Button>
              )}
              </div>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
