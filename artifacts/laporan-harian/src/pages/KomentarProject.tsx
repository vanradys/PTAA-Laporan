import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, MessageSquare, Plus, Search, Send, UserRound } from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureVisibility } from "@/hooks/use-feature-visibility";
import { useEditPermissions } from "@/hooks/use-edit-permissions";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PoItem = {
  id: number;
  noPo: string;
  namaProject: string;
  customer?: string | null;
};
type ProjectComment = {
  id: number;
  poId: number;
  noPo?: string | null;
  namaProject?: string | null;
  customer?: string | null;
  customerName?: string | null;
  userName?: string | null;
  userDepartment?: string | null;
  departmentName?: string | null;
  comment: string;
  createdAt: string;
};
type ReportComment = {
  id: number;
  reportId: number;
  reportOwnerUserId: number;
  reportDate: string;
  reportUserName: string | null;
  departmentName: string | null;
  commenterUserId: number;
  commenterName: string;
  commenterRole: string;
  comment: string;
  createdAt: string;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function KomentarProject() {
  const { user } = useAuth();
  const { canViewFeature } = useFeatureVisibility();
  const { canEdit } = useEditPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [poId, setPoId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [internalComment, setInternalComment] = useState("");
  const [filterNoPo, setFilterNoPo] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [search, setSearch] = useState("");

  const canAccessProjectComments = (() => {
    const role = String(user?.role ?? "").toLowerCase();
    const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
    const departmentName = String(user?.departmentName ?? "").toLowerCase();
    return (
      (role === "admin" ||
        role === "direktur" ||
        role === "director" ||
        role === "dir" ||
        role === "monitoring_dummy" ||
        departmentCode === "ENG" ||
        departmentName.includes("engineering")) &&
      canViewFeature("project_comments", true)
    );
  })();
  const canViewCustomerNotes =
    canAccessProjectComments && canViewFeature("customer_notes", true);
  const canAddProjectComments = canAccessProjectComments && canEdit("project_comment_add", true);

  const { data: poData } = useQuery({
    queryKey: ["project-comments-po", "active"],
    queryFn: () => apiRequest<PoItem[]>("/api/po?openOnly=true"),
    enabled: canAccessProjectComments,
  });
  const pos = (Array.isArray(poData) ? poData : []) as PoItem[];
  const poById = new Map(pos.map((item) => [item.id, item]));
  const selectedPo = poId ? poById.get(Number(poId)) : null;

  const customerCommentsQuery = useQuery({
    queryKey: ["project-comments", "customer"],
    queryFn: () => apiRequest<ProjectComment[]>("/api/customer-tracking/internal/comments"),
    enabled: canViewCustomerNotes,
    refetchInterval: 15000,
  });
  const internalCommentsQuery = useQuery({
    queryKey: ["project-comments", "internal"],
    queryFn: () => apiRequest<ProjectComment[]>("/api/po/internal-comments"),
    enabled: canAccessProjectComments,
    refetchInterval: 15000,
  });
  const reportCommentsQuery = useQuery({
    queryKey: ["report-comments"],
    queryFn: () => apiRequest<ReportComment[]>("/api/report-comments"),
    refetchInterval: 15000,
  });

  const customers = [...new Set(pos.map((item) => item.customer).filter(Boolean))] as string[];
  const projects = [...new Set(pos.map((item) => item.namaProject).filter(Boolean))];
  const posByCustomer = customerName
    ? pos.filter((item) => item.customer === customerName)
    : pos;

  const enrich = (items: ProjectComment[]) => items.map((item) => {
    const po = poById.get(item.poId);
    return {
      ...item,
      noPo: item.noPo ?? po?.noPo ?? null,
      namaProject: item.namaProject ?? po?.namaProject ?? null,
      customer: item.customer ?? po?.customer ?? null,
    };
  });

  const filterComments = (items: ProjectComment[]) => {
    const term = search.trim().toLowerCase();
    return enrich(items).filter((item) => {
      if (filterNoPo !== "all" && item.noPo !== filterNoPo) return false;
      if (filterCustomer !== "all" && item.customer !== filterCustomer) return false;
      if (filterProject !== "all" && item.namaProject !== filterProject) return false;
      if (term && ![item.noPo, item.namaProject, item.customer, item.comment].some((value) => String(value ?? "").toLowerCase().includes(term))) return false;
      return true;
    });
  };

  const customerComments = useMemo(() => filterComments(customerCommentsQuery.data ?? []), [customerCommentsQuery.data, filterNoPo, filterCustomer, filterProject, search, pos]);
  const internalComments = useMemo(() => filterComments(internalCommentsQuery.data ?? []), [internalCommentsQuery.data, filterNoPo, filterCustomer, filterProject, search, pos]);
  const reportComments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (reportCommentsQuery.data ?? []).filter((item) => {
      if (!term) return true;
      return [
        item.reportUserName,
        item.departmentName,
        item.commenterName,
        item.comment,
        item.reportDate,
      ].some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [reportCommentsQuery.data, search]);

  const refresh = async () => {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-comments", "customer"] }),
        queryClient.invalidateQueries({ queryKey: ["project-comments", "internal"] }),
        queryClient.invalidateQueries({ queryKey: ["project-comments-po", "active"] }),
        queryClient.invalidateQueries({ queryKey: ["report-comments"] }),
    ]);
  };

  const sendCustomerComment = async () => {
    if (!selectedPo || !canViewCustomerNotes || !canAddProjectComments || !customerComment.trim()) return;
    try {
      await apiRequest(`/api/customer-tracking/${selectedPo.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: customerName.trim() || selectedPo.customer || "Customer", comment: customerComment }),
      });
      setCustomerComment("");
      await refresh();
      toast({ title: "Customer note ditambahkan" });
    } catch (error) {
      toast({ title: "Gagal menambah customer note", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };

  const selectCustomer = (value: string) => {
    setCustomerName(value);
    if (selectedPo?.customer !== value) {
      setPoId("");
    }
  };

  const selectPo = (value: string) => {
    setPoId(value);
    const po = poById.get(Number(value));
    setCustomerName(po?.customer ?? "");
  };

  const sendInternalComment = async () => {
    if (!selectedPo || !canAddProjectComments || !internalComment.trim()) return;
    try {
      await apiRequest(`/api/po/${selectedPo.id}/internal-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: internalComment }),
      });
      setInternalComment("");
      await refresh();
      toast({ title: "Komentar internal ditambahkan" });
    } catch (error) {
      toast({ title: "Gagal menambah komentar internal", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };

  const renderComments = (items: ProjectComment[], nameKey: "customerName" | "userName") => (
    <div className="space-y-3">
      {items.length ? items.map((item) => (
        <div key={`${nameKey}-${item.id}`} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="text-sm font-bold">{item.noPo ?? "-"} - {item.namaProject ?? "-"}</p>
            <span className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{item.customer ?? "-"} / {item[nameKey] ?? "-"}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{item.comment}</p>
        </div>
      )) : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">Tidak ada komentar.</p>}
    </div>
  );

  return (
    <Layout>
      <div className="page-shell max-w-6xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-950">Komentar</h1>
          <p className="text-sm text-slate-500">Komentar project dan komentar laporan harian yang perlu ditindaklanjuti.</p>
        </div>

        <Tabs defaultValue="project" className="space-y-5">
          <TabsList>
            <TabsTrigger value="project">Komentar Project</TabsTrigger>
            <TabsTrigger value="daily">Komentar Laporan Harian</TabsTrigger>
          </TabsList>

          <TabsContent value="project" className="space-y-5">
            {!canAccessProjectComments ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-red-600">
                  Komentar Project hanya dapat diakses Admin, Direktur, Monitoring Laporan, dan Engineering.
                </CardContent>
              </Card>
            ) : (
              <>
        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-5">
            <div className="space-y-1"><Label>Filter No PO</Label><Select value={filterNoPo} onValueChange={setFilterNoPo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem>{pos.map((item) => <SelectItem key={item.id} value={item.noPo}>{item.noPo}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Filter Customer</Label><Select value={filterCustomer} onValueChange={setFilterCustomer}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem>{customers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Filter Project</Label><Select value={filterProject} onValueChange={setFilterProject}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua</SelectItem>{projects.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 md:col-span-2"><Label>Search</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="Cari PO, project, customer, komentar..." /></div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" />Tambah Komentar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Pilih PO</Label><Select value={poId} onValueChange={selectPo}><SelectTrigger><SelectValue placeholder="Pilih No PO" /></SelectTrigger><SelectContent>{posByCustomer.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.noPo} - {item.namaProject}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Customer</Label><Select value={customerName} onValueChange={selectCustomer}><SelectTrigger><SelectValue placeholder="Pilih customer aktif" /></SelectTrigger><SelectContent>{customers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <Tabs defaultValue="internal">
              <TabsList><TabsTrigger value="internal">Komentar Internal</TabsTrigger>{canViewCustomerNotes && <TabsTrigger value="customer">Customer Notes</TabsTrigger>}</TabsList>
              <TabsContent value="internal" className="space-y-2"><Textarea value={internalComment} onChange={(event) => setInternalComment(event.target.value)} rows={3} placeholder="Tulis komentar internal..." disabled={!canAddProjectComments} /><Button onClick={sendInternalComment} disabled={!selectedPo || !canAddProjectComments || !internalComment.trim()}><Send className="mr-2 h-4 w-4" />Kirim Komentar Internal</Button></TabsContent>
              {canViewCustomerNotes && <TabsContent value="customer" className="space-y-2"><Textarea value={customerComment} onChange={(event) => setCustomerComment(event.target.value)} rows={3} placeholder="Tulis customer notes..." disabled={!canAddProjectComments} /><Button onClick={sendCustomerComment} disabled={!selectedPo || !canAddProjectComments || !customerComment.trim()}><Send className="mr-2 h-4 w-4" />Kirim Customer Notes</Button></TabsContent>}
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Komentar Internal</CardTitle></CardHeader><CardContent>{renderComments(internalComments, "userName")}</CardContent></Card>
          {canViewCustomerNotes && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" />Customer Notes</CardTitle></CardHeader><CardContent>{renderComments(customerComments, "customerName")}</CardContent></Card>}
        </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-8"
                    placeholder="Cari karyawan, departemen, tanggal, atau komentar..."
                  />
                </div>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {reportCommentsQuery.isLoading ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">Memuat komentar laporan...</p>
              ) : reportComments.length ? reportComments.map((item) => (
                <Link
                  key={item.id}
                  href={`/laporan/${item.reportId}?commentId=${item.id}&returnTo=/komentar-project`}
                  className="block rounded-lg border bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                        <UserRound className="h-4 w-4 text-slate-500" />
                        {item.reportUserName ?? "User"} - {item.departmentName ?? "Tanpa Departemen"}
                      </p>
                      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Laporan {new Date(item.reportDate + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-500">Komentar dari {item.commenterName || "User"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.comment}</p>
                </Link>
              )) : (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">Tidak ada komentar laporan harian.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
