import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Search,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/apiRequest";

const logoSrc = new URL("../assets/adiyasa-logo.png", import.meta.url).href;

interface TrackingStage {
  key: string;
  label: string;
  state: "done" | "active" | "pending";
}

interface TrackingTimelineItem {
  id: number;
  title: string;
  changedByName?: string | null;
  createdAt: string;
}

interface TrackingHistoryItem {
  id: number;
  noPo: string;
  namaProject: string;
  tanggalPoMasuk: string;
  statusLabel: string;
}

interface TrackingDetail {
  id: number;
  noPo: string;
  namaProject: string;
  customer?: string | null;
  tanggalPoMasuk: string;
  deadline?: string | null;
  tanggalDelivery?: string | null;
  picName?: string | null;
  statusLabel: string;
  progress: number;
  catatan?: string | null;
  deadlineStatus: {
    value: "on_time" | "at_risk" | "delay";
    label: string;
    description: string;
  };
  stages: TrackingStage[];
  timeline: TrackingTimelineItem[];
  history: TrackingHistoryItem[];
}

interface TrackingComment {
  id: number;
  customerName: string;
  comment: string;
  createdAt: string;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;

  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function deadlineClass(value: TrackingDetail["deadlineStatus"]["value"]) {
  if (value === "delay") return "border-red-200 bg-red-50 text-red-700";
  if (value === "at_risk") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stageClass(state: TrackingStage["state"]) {
  if (state === "done") return "border-emerald-500 bg-emerald-500 text-white";
  if (state === "active") return "border-amber-400 bg-amber-100 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-400";
}

export default function CustomerTracking() {
  const [customerName, setCustomerName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [detail, setDetail] = useState<TrackingDetail | null>(null);
  const [comments, setComments] = useState<TrackingComment[]>([]);
  const [commentName, setCommentName] = useState("");
  const [comment, setComment] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const loadComments = async (poId: number) => {
    const data = await apiRequest<TrackingComment[]>(
      `/api/customer-tracking/${poId}/comments`,
    );
    setComments(data);
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSearching(true);

    try {
      const data = await apiRequest<TrackingDetail>(
        "/api/customer-tracking/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerName, poNumber }),
        },
      );
      setDetail(data);
      setCommentName(customerName);
      await loadComments(data.id);
    } catch (err) {
      setDetail(null);
      setComments([]);
      setError(
        err instanceof Error
          ? err.message
          : "Data PO tidak ditemukan. Pastikan Nomor PO sesuai.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendComment = async () => {
    if (!detail || !commentName.trim() || !comment.trim()) return;

    setIsSending(true);
    try {
      await apiRequest(`/api/customer-tracking/${detail.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: commentName,
          comment,
        }),
      });
      setComment("");
      await loadComments(detail.id);
    } finally {
      setIsSending(false);
    }
  };

  const resetSearch = () => {
    setDetail(null);
    setComments([]);
    setError("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Adiyasa logo" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-lg font-black tracking-[0.16em] text-[#06258d]">
                ADIYASA
              </p>
              <p className="text-xs font-bold text-red-600">Customer Tracking Portal</p>
            </div>
          </div>
          {detail && (
            <Button variant="outline" size="sm" onClick={resetSearch}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cari PO
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {!detail ? (
          <Card className="mx-auto max-w-xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Tracking PO Customer</CardTitle>
              <p className="text-sm text-slate-500">
                Masukkan nama customer/perusahaan dan nomor PO untuk melihat progress project.
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSearch}>
                <div className="space-y-2">
                  <Label>Nama Customer / Perusahaan</Label>
                  <Input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Contoh: PT Adiyasa Abadi"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nomor PO</Label>
                  <Input
                    value={poNumber}
                    onChange={(event) => setPoNumber(event.target.value)}
                    placeholder="Contoh: PO/12345"
                    required
                  />
                </div>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Cari PO
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Status PO: {detail.noPo}</CardTitle>
                  <p className="text-sm text-slate-500">{detail.namaProject}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                      <span>Progress Project</span>
                      <span>{detail.progress}%</span>
                    </div>
                    <Progress value={detail.progress} />
                    <p className="mt-2 text-sm text-slate-600">
                      {detail.statusLabel}
                    </p>
                  </div>
                  <div className={`rounded-lg border p-3 text-sm ${deadlineClass(detail.deadlineStatus.value)}`}>
                    <div className="flex items-center gap-2 font-bold">
                      {detail.deadlineStatus.value === "delay" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {detail.deadlineStatus.label}
                    </div>
                    <p className="mt-1">{detail.deadlineStatus.description}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Informasi Umum</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Info label="Nomor PO" value={detail.noPo} />
                  <Info label="Nama Customer" value={detail.customer ?? "-"} />
                  <Info label="Nama Project" value={detail.namaProject} />
                  <Info label="Tanggal PO Masuk" value={formatDate(detail.tanggalPoMasuk)} />
                  <Info label="Deadline" value={formatDate(detail.deadline)} />
                  <Info label="PIC Project" value={detail.picName ?? "-"} />
                  <Info label="Status Project" value={detail.statusLabel} />
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Status Tahapan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.stages.map((stage) => (
                    <div key={stage.key} className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${stageClass(stage.state)}`}
                      >
                        {stage.state === "done" ? "✓" : ""}
                      </span>
                      <span className="text-sm font-medium">{stage.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Kendala Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-700">
                    {detail.catatan?.trim() || "Tidak ada kendala yang dilaporkan."}
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Timeline Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.timeline.length === 0 ? (
                    <p className="text-sm text-slate-500">Belum ada histori update project.</p>
                  ) : (
                    detail.timeline.map((item) => (
                      <div key={item.id} className="border-l-2 border-blue-200 pl-3">
                        <p className="text-sm font-semibold">{formatTime(item.createdAt)}</p>
                        <p className="text-sm text-slate-600">{item.title}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Riwayat PO Customer</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Nomor PO</th>
                      <th className="px-4 py-3">Nama Project</th>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{item.noPo}</td>
                        <td className="px-4 py-3">{item.namaProject}</td>
                        <td className="px-4 py-3">{formatDate(item.tanggalPoMasuk)}</td>
                        <td className="px-4 py-3">{item.statusLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Komentar Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-sm text-slate-500">Belum ada komentar.</p>
                  ) : (
                    comments.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="font-semibold">{item.customerName}</span>
                          <span className="text-xs text-slate-500">{formatTime(item.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{item.comment}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                  <Input
                    value={commentName}
                    onChange={(event) => setCommentName(event.target.value)}
                    placeholder="Nama"
                  />
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Tambahkan komentar..."
                    rows={2}
                  />
                </div>
                <Button
                  type="button"
                  disabled={isSending || !commentName.trim() || !comment.trim()}
                  onClick={handleSendComment}
                >
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Kirim Komentar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
