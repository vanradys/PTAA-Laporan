import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReport, useReviewReport, useCreateComment,
  getGetReportQueryKey, getListReportsQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, CheckCircle, AlertCircle, MessageSquare, Loader2,
  User, Building2, Calendar, ClipboardList, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";

const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  belum_mulai: { label: "Belum Mulai", color: "bg-gray-100 text-gray-700 border-gray-200" },
  proses: { label: "Proses", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  selesai: { label: "Selesai", color: "bg-green-100 text-green-700 border-green-200" },
  pending: { label: "Pending", color: "bg-orange-100 text-orange-700 border-orange-200" },
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

  const reportId = parseInt(id ?? "0");
  const { data: report, isLoading } = useGetReport(
    reportId,
    { query: { enabled: !!reportId, queryKey: getGetReportQueryKey(reportId) } }
  );

  const reviewReport = useReviewReport();
  const createComment = useCreateComment();

  const canReview = ["hr", "admin", "direktur"].includes(user?.role ?? "");
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

  const handleReview = async (action: "review" | "revision") => {
    try {
      await reviewReport.mutateAsync({
        id: reportId,
        data: { action, comment: commentText || undefined }
      });
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: getGetReportQueryKey(reportId) });
      queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() });
      toast({
        title: action === "review" ? "Laporan Direview" : "Revisi Diminta",
        description: action === "review" ? "Laporan berhasil ditandai direview" : "Permintaan revisi berhasil dikirim"
      });
    } catch {
      toast({ title: "Gagal", description: "Gagal memproses tindakan", variant: "destructive" });
    }
  };

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

  const roleLabel: Record<string, string> = {
    karyawan: "Karyawan", hr: "HR", admin: "Admin", direktur: "Direktur"
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
        <div className="p-6 text-center text-muted-foreground">
          <p>Laporan tidak ditemukan</p>
          <Button variant="ghost" onClick={() => navigate("/monitoring")} className="mt-4">
            Kembali ke Monitoring
          </Button>
        </div>
      </Layout>
    );
  }

  const statusInfo = REPORT_STATUSES[r.status ?? "draf"] ?? REPORT_STATUSES.draf;
  const tasks: Task[] = r.tasks ?? [];
  const comments: Comment[] = r.comments ?? [];

  return (
    <Layout>
      <div className="p-6 space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/monitoring")} className="mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
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
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {r.userName?.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid grid-cols-3 gap-4 flex-1">
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nama Tugas</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Project</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Progress</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Catatan</th>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

        {/* Review Actions (HR/Admin/Director only) */}
        {canReview && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-primary">Tindakan Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Tambahkan komentar atau catatan review... (opsional)"
                rows={3}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleReview("review")}
                  disabled={reviewReport.isPending}
                  className="flex-1"
                >
                  {reviewReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Tandai Direview
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleReview("revision")}
                  disabled={reviewReport.isPending}
                  className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Minta Revisi
                </Button>
                {commentText && (
                  <Button
                    variant="secondary"
                    onClick={handleAddComment}
                    disabled={createComment.isPending}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Komentar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

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
                      <span className="text-xs text-muted-foreground">{roleLabel[c.userRole] ?? c.userRole}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(c.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.comment}</p>
                  </div>
                </div>
              ))
            )}
            {!canReview && (
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
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
