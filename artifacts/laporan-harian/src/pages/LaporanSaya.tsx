import { useState, useEffect } from "react";
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

interface TaskForm {
  title: string;
  project: string;
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
  progress: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface ReportData {
  id: number;
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

  const today = new Date().toISOString().split("T")[0];
  const todayFormatted = new Date().toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

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

  const report = (isError ? null : todayReport) as ReportData | null;
  const existingTasks: ExistingTask[] = report?.tasks ?? [];
  const isLocked = report?.status === "dikirim" || report?.status === "direview";

  const { register, handleSubmit, setValue, getValues } = useForm({
    defaultValues: {
      obstacles: "",
      additionalNotes: "",
      tomorrowPlan: "",
    }
  });

  useEffect(() => {
    if (report) {
      setValue("obstacles", report.obstacles ?? "");
      setValue("additionalNotes", report.additionalNotes ?? "");
      setValue("tomorrowPlan", report.tomorrowPlan ?? "");
    }
  }, [report, setValue]);

  const addNewTask = () => {
    const id = Date.now().toString();
    setNewTasks(prev => [...prev, { id, title: "", project: "", progress: 0, status: "belum_mulai", notes: "" }]);
    setExpandedTasks(prev => new Set([...prev, id]));
  };

  const removeNewTask = (id: string) => setNewTasks(prev => prev.filter(t => t.id !== id));

  const updateNewTask = (id: string, field: keyof TaskForm, value: string | number) =>
    setNewTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  const handleCopyYesterday = () => {
    if (!yesterdayTasks || !Array.isArray(yesterdayTasks)) return;
    const copies = (yesterdayTasks as ExistingTask[]).map(t => ({
      id: Date.now().toString() + Math.random(),
      title: t.title,
      project: t.project ?? "",
      progress: t.progress,
      status: t.status === "selesai" ? "belum_mulai" : t.status,
      notes: t.notes ?? "",
    }));
    setNewTasks(prev => [...prev, ...copies]);
    toast({ title: "Berhasil", description: `${copies.length} tugas dari kemarin berhasil disalin` });
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
        data: { title: task.title, project: task.project, progress: task.progress, status: task.status, notes: task.notes }
      });
    }
    setNewTasks([]);
    return reportId;
  };

  const handleSaveReport = async (data: { obstacles: string; additionalNotes: string; tomorrowPlan: string }) => {
    setIsSaving(true);
    try {
      await saveAll(data);
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      toast({ title: "Tersimpan", description: "Laporan berhasil disimpan sebagai draf" });
    } catch {
      toast({ title: "Gagal", description: "Gagal menyimpan laporan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Submit = auto-save then submit in one click
  const handleSubmitReport = async () => {
    setIsSubmitting(true);
    try {
      const formData = getValues();
      const reportId = await saveAll(formData);
      await submitReport.mutateAsync({ id: reportId });
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      toast({ title: "Laporan Terkirim!", description: "Laporan harian Anda berhasil dikirim ke HR" });
    } catch {
      toast({ title: "Gagal", description: "Gagal mengirim laporan", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExistingTask = async (taskId: number, field: string, value: string | number) => {
    try {
      await updateTask.mutateAsync({ taskId, data: { [field]: value } });
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
    } catch {
      toast({ title: "Gagal", description: "Gagal memperbarui tugas", variant: "destructive" });
    }
  };

  const handleDeleteExistingTask = async (taskId: number) => {
    try {
      await deleteTask.mutateAsync({ taskId });
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      toast({ title: "Berhasil", description: "Tugas berhasil dihapus" });
    } catch {
      toast({ title: "Gagal", description: "Gagal menghapus tugas", variant: "destructive" });
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
      <div className="p-6 space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
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
          {!isLocked && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSubmit(handleSaveReport)} disabled={isSaving || isSubmitting}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Simpan Draf
              </Button>
              <Button onClick={handleSubmitReport} disabled={isSubmitting || isSaving}>
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
        ) : isLocked ? (
          /* Locked/submitted view */
          <div className="space-y-5">
            <Card className={`border ${report?.status === "direview" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
              <CardContent className="p-4 flex items-center gap-3">
                {report?.status === "direview"
                  ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  : <Clock className="w-5 h-5 text-blue-600 shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold ${report?.status === "direview" ? "text-green-800" : "text-blue-800"}`}>
                    {report?.status === "direview"
                      ? "Laporan sudah direview oleh HR"
                      : "Laporan sudah dikirim — menunggu review HR"}
                  </p>
                  <p className={`text-xs mt-0.5 ${report?.status === "direview" ? "text-green-600" : "text-blue-600"}`}>
                    Laporan tidak dapat diubah setelah dikirim
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Read-only task list */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  Daftar Tugas
                  <span className="text-sm font-normal text-muted-foreground">{existingTasks.length} tugas</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {existingTasks.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">Tidak ada tugas</p>
                ) : (
                  <table className="w-full text-sm">
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
                )}
              </CardContent>
            </Card>

            {/* Read-only notes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Persoalan yang Dihadapi", value: report?.obstacles },
                { title: "Catatan Tambahan", value: report?.additionalNotes },
                { title: "Rencana Besok & Target", value: report?.tomorrowPlan },
              ].map(f => (
                <Card key={f.title} className="border border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">{f.title}</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{f.value || <span className="italic text-muted-foreground">Tidak diisi</span>}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          /* Editable form */
          <form onSubmit={handleSubmit(handleSaveReport)}>
            <div className="space-y-5">
              {/* Perlu Revisi banner */}
              {report?.status === "perlu_revisi" && (
                <Card className="border border-orange-200 bg-orange-50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800">Laporan perlu direvisi</p>
                      <p className="text-xs text-orange-600 mt-0.5">HR meminta revisi. Silakan perbarui dan kirim kembali.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tasks Section */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Daftar Tugas Hari Ini</CardTitle>
                    <div className="flex gap-2">
                      {yesterdayTasks && Array.isArray(yesterdayTasks) && yesterdayTasks.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={handleCopyYesterday}>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Ambil Tugas Kemarin
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={addNewTask}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Tambah Tugas
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {existingTasks.length === 0 && newTasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Belum ada tugas. Klik "Tambah Tugas" untuk mulai.</p>
                    </div>
                  )}

                  {/* Existing Tasks */}
                  {existingTasks.map(task => {
                    const statusInfo = getStatusInfo(task.status);
                    const isExpanded = expandedTasks.has(task.id);
                    return (
                      <div key={task.id} className="border border-border rounded-lg overflow-hidden">
                        <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(task.id)}>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
                          <span className="text-sm font-medium text-foreground flex-1 truncate">{task.title}</span>
                          {task.project && <span className="text-xs text-muted-foreground hidden sm:block">{task.project}</span>}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold text-primary">{task.progress}%</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-4 bg-muted/20 border-t border-border space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Nama Tugas</Label>
                                <Input defaultValue={task.title} onBlur={e => handleUpdateExistingTask(task.id, "title", e.target.value)} className="h-8 text-sm" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Project</Label>
                                <Input defaultValue={task.project ?? ""} onBlur={e => handleUpdateExistingTask(task.id, "project", e.target.value)} className="h-8 text-sm" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                <Select defaultValue={task.status} onValueChange={v => handleUpdateExistingTask(task.id, "status", v)}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Progress ({task.progress}%)</Label>
                                <div className="pt-2">
                                  <Slider defaultValue={[task.progress]} min={0} max={100} step={5} onValueCommit={v => handleUpdateExistingTask(task.id, "progress", v[0])} />
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Catatan Tugas</Label>
                              <Input defaultValue={task.notes ?? ""} onBlur={e => handleUpdateExistingTask(task.id, "notes", e.target.value)} className="h-8 text-sm" placeholder="Catatan opsional..." />
                            </div>
                            <div className="flex justify-end">
                              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteExistingTask(task.id)}>
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Hapus Tugas
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* New Tasks */}
                  {newTasks.map(task => (
                    <div key={task.id} className="border border-primary/30 rounded-lg bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-primary">Tugas Baru</span>
                        <Button type="button" variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-destructive" onClick={() => removeNewTask(task.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nama Tugas *</Label>
                          <Input value={task.title} onChange={e => updateNewTask(task.id, "title", e.target.value)} placeholder="Nama tugas..." className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Project</Label>
                          <Input value={task.project} onChange={e => updateNewTask(task.id, "project", e.target.value)} placeholder="Nama project..." className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
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
                  <CardHeader className="pb-3"><CardTitle className="text-base">Rencana Besok & Target</CardTitle></CardHeader>
                  <CardContent>
                    <Textarea {...register("tomorrowPlan")} placeholder="Tuliskan rencana dan target untuk hari besok..." rows={3} className="resize-none" />
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="submit" variant="outline" disabled={isSaving || isSubmitting}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Simpan Draf
                </Button>
                <Button type="button" onClick={handleSubmitReport} disabled={isSubmitting || isSaving}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Kirim Laporan
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
