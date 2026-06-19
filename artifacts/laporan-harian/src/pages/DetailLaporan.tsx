import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport, useCreateComment,
  getGetReportQueryKey, getListReportsQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, MessageSquare, Loader2,
  User, Building2, Calendar, ClipboardList, FileText, Pencil, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { apiRequest } from "@/lib/apiRequest";
import { getRoleDisplayName } from "@/lib/roleDisplay";

const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  belum_mulai: { label: "Belum Mulai", color: "bg-gray-100 text-gray-700 border-gray-200" },
  menerima_permintaan: { label: "Menerima Permintaan (Inquiry)", color: "bg-blue-100 text-blue-700 border-blue-200" },
  inquiry: { label: "Menerima Permintaan (Inquiry)", color: "bg-blue-100 text-blue-700 border-blue-200" },
  input_data_proses: { label: "Input Data/Proses", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  proses: { label: "Input Data/Proses", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  review_approval: { label: "Review/Approval", color: "bg-violet-100 text-violet-700 border-violet-200" },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700 border-green-200" },
  selesai: { label: "Delivered", color: "bg-green-100 text-green-700 border-green-200" },
};

const REPORT_STATUSES: Record<string, { label: string; color: string }> = {
  draf: { label: "Draf", color: "bg-gray-100 text-gray-700 border-gray-200" },
  dikirim: { label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  direview: { label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  perlu_revisi: { label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
};

interface Task {
  id: number;
  title: string;
  project: string | null;
  progress: number;
  status: string;
  notes: string | null;
  reviewStatus?: string | null;
  reviewComment?: string | null;
  reviewedByName?: string | null;
  revisionWorkTaskId?: number | null;
}

interface Comment {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  comment: string;
  createdAt: string;
}

export default function DetailLaporan() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [taskReviewDrafts, setTaskReviewDrafts] = useState<Record<number, string>>({});
  const [reviewingTaskId, setReviewingTaskId] = useState<number | null>(null);

  const reportId = parseInt(id ?? "0");
  const { data: report, isLoading } = useGetReport(
    reportId,
    { query: { enabled: !!reportId, queryKey: getGetReportQueryKey(reportId) } }
  );

  const createComment = useCreateComment();

  const canReview = ["admin", "direktur", "director", "dir"].includes(user?.role ?? "");
  const r = report as (typeof report & {
    tasks?: Task[];
    comments?: Comment[];
    obstacles?: string | null;
    additionalNotes?: string | null;
    tomorrowPlan?: string | null;
    status?: string;
    userName?: string;
    departmentName?: string | null;
    date?: string;
    dayName?: string;
    avgProgress?: number;
    taskCount?: number;
  }) | null;

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await createComment.mutateAsync({ id: reportId, data: { comment: commentText } });
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
      toast({ title: "Komentar Ditambahkan" });
    } catch {
      toast({ title: "Gagal", description: "Gagal menambahkan komentar", variant: "destructive" });
    }
  };

  const handleTaskReview = async (taskId: number, action: "review" | "revision") => {
    setReviewingTaskId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: taskReviewDrafts[taskId] || undefined }),
      });
      setTaskReviewDrafts((current) => ({ ...current, [taskId]: "" }));
      queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
      toast({ title: action === "revision" ? "Revisi tugas dikirim" : "Tugas direview" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Gagal memproses tugas", variant: "destructive" });
    } finally {
      setReviewingTaskId(null);
    }
  };

  const handleTaskCorrection = async (task: Task) => {
    if (!window.confirm("Anda hanya dapat melakukan revisi 1 kali. Lanjutkan dan salin tugas ini ke laporan hari ini?")) return;
    setReviewingTaskId(task.id);
    try {
      await apiRequest(`/api/tasks/${task.id}/start-correction`, {
        method: "POST",
      });
      queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
      toast({ title: "Tugas disalin", description: "Perbaiki tugas pada Laporan Harian hari ini, lalu submit laporan." });
      navigate("/laporan-saya");
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Gagal menyimpan perbaikan", variant: "destructive" });
    } finally {
      setReviewingTaskId(null);
    }
  };

  const handleEditComment = async (comment: Comment) => {
    const nextComment = window.prompt("Edit komentar", comment.comment)?.trim();
    if (!nextComment || nextComment === comment.comment) return;
    await apiRequest(`/api/reports/${reportId}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: nextComment }),
    });
    queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!window.confirm("Hapus komentar ini?")) return;
    await apiRequest(`/api/reports/${reportId}/comments/${comment.id}`, {
      method: "DELETE",
    });
    queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!r) {
    return (
      <Layout>
        <div className="page-shell text-center text-muted-foreground">
          <p>Laporan tidak ditemukan</p>
          <Button variant="ghost" onClick={() => navigate("/monitoring")} className="mt-4">
            Kembali ke Monitoring
          </Button>
        </div>
      </Layout>
    );
  }

  const statusInfo =
    /^\d+\s+Revisi$/i.test(r.status ?? "")
      ? { label: r.status ?? "Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" }
      : r.status === "Selesai"
        ? { label: "Selesai", color: "bg-green-100 text-green-700 border-green-200" }
        : r.status === "Direview"
          ? { label: "Direview", color: "bg-blue-100 text-blue-700 border-blue-200" }
          : REPORT_STATUSES[r.status ?? "draf"] ?? REPORT_STATUSES.draf;
  const tasks: Task[] = r.tasks ?? [];
  const comments: Comment[] = r.comments ?? [];

  return (
    <Layout>
      <div className="page-shell space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/monitoring")} className="mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-foreground">Detail Laporan Harian</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{r.dayName}, {r.date && new Date(r.date + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        {/* Employee Info */}
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {r.userName?.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Nama</p>
                    <p className="text-sm font-medium text-foreground">{r.userName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Departemen</p>
                    <p className="text-sm font-medium text-foreground">{r.departmentName ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Progress Rata-rata</p>
                    <p className="text-sm font-semibold text-primary">{r.avgProgress}%</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Daftar Tugas
              <span className="text-sm font-normal text-muted-foreground">{tasks.length} tugas</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">Tidak ada tugas</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nama Tugas</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Project</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Progress</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Catatan</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Review / Revisi</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const ts = TASK_STATUSES[task.status] ?? TASK_STATUSES.belum_mulai;
                    return (
                      <tr key={task.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{task.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{task.project ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ts.color}`}>
                            {ts.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                              <div className="bg-primary h-1.5 rounded-full" style={{ width: `${task.progress}%` }} />
                            </div>
                            <span className="text-xs font-medium w-8">{task.progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{task.notes ?? "—"}</td>
                        <td className="px-4 py-3">
                          {task.reviewStatus && task.reviewStatus !== "komentar" && (
                            <div className="mb-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                task.reviewStatus === "revisi"
                                  ? "border-orange-200 bg-orange-50 text-orange-700"
                                  : ["sudah_diperbaiki", "selesai"].includes(task.reviewStatus)
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-green-200 bg-green-50 text-green-700"
                              }`}>
                                {task.reviewStatus === "revisi"
                                  ? "Revisi"
                                  : task.reviewStatus === "sudah_diperbaiki"
                                    ? "Sudah Diperbaiki"
                                    : task.reviewStatus === "selesai"
                                      ? "Selesai"
                                      : "Direview"}
                              </span>
                              {task.reviewComment && (
                                <div className="mt-1">
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    Komentar
                                  </span>
                                  <p className="mt-1 max-w-xs text-xs text-slate-600">{task.reviewComment}</p>
                                </div>
                              )}
                              {task.reviewedByName && <p className="mt-0.5 text-[11px] text-slate-400">oleh {task.reviewedByName}</p>}
                            </div>
                          )}
                          {canReview && (
                            <div className="min-w-[270px] space-y-2">
                              <Textarea
                                value={taskReviewDrafts[task.id] ?? ""}
                                onChange={(event) => setTaskReviewDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                placeholder="Catatan khusus tugas ini"
                                rows={2}
                              />
                              <div className="flex flex-wrap gap-1.5">
                                <Button size="sm" onClick={() => handleTaskReview(task.id, "review")} disabled={reviewingTaskId === task.id}>Review</Button>
                                <Button size="sm" variant="outline" className="border-orange-300 text-orange-700" onClick={() => handleTaskReview(task.id, "revision")} disabled={reviewingTaskId === task.id}>Revisi</Button>
                              </div>
                            </div>
                          )}
                          {user?.id === r.userId && task.reviewStatus === "revisi" && (
                            <div className="mt-2 min-w-[270px] space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-2">
                              <p className="text-xs text-orange-800">
                                {task.reviewComment || "Tugas ini perlu diperbaiki sesuai arahan reviewer."}
                              </p>
                              <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => handleTaskCorrection(task)} disabled={reviewingTaskId === task.id}>
                                Perbaiki
                              </Button>
                            </div>
                          )}
                          {user?.id === r.userId && task.reviewStatus === "sedang_diperbaiki" && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              Sedang Diperbaiki
                            </span>
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

        {/* Report Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Persoalan yang Dihadapi", value: r.obstacles },
            { title: "Catatan Tambahan", value: r.additionalNotes },
            { title: "Rencana Besok & Target", value: r.tomorrowPlan },
          ].map((field) => (
            <Card key={field.title} className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">{field.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">{field.value || <span className="text-muted-foreground italic">Tidak diisi</span>}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comments */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Komentar ({comments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada komentar</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {c.userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{c.userName}</span>
                      <span className="text-xs text-muted-foreground">{getRoleDisplayName(c.userRole)}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(c.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.comment}</p>
                    {user?.role === "admin" && (
                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditComment(c)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteComment(c)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Hapus
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="pt-2 border-t border-border">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Tambahkan komentar..."
                  rows={2}
                  className="resize-none"
                />
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || createComment.isPending}
                >
                  Kirim Komentar
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
