import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ClipboardList,
  Loader2,
  MessageSquare,
  Search,
} from "lucide-react";
import Layout from "@/components/Layout";
import { apiRequest } from "@/lib/apiRequest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type PoActivity = {
  id: number;
  poId: number | null;
  noPo: string;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  changedByName?: string | null;
  createdAt: string;
  namaProject?: string | null;
  customer?: string | null;
  departmentName?: string | null;
};

type PoComment = {
  id: number;
  poId: number;
  noPo?: string | null;
  namaProject?: string | null;
  customer?: string | null;
  departmentName?: string | null;
  customerName?: string | null;
  userName?: string | null;
  userDepartment?: string | null;
  comment: string;
  createdAt: string;
};

type TaskHistory = {
  id: number;
  assignedByName: string;
  assignedByDepartment?: string | null;
  assignedToName?: string | null;
  assignedToDepartment?: string | null;
  title: string;
  project?: string | null;
  notes?: string | null;
  status: string;
  responseNote?: string | null;
  assignedAt: string;
  respondedAt?: string | null;
};

type OverallMonitoringResponse = {
  poActivities: PoActivity[];
  customerNotes: PoComment[];
  internalComments: PoComment[];
  taskHistories: TaskHistory[];
};

const ACTIVITY_TYPE_OPTIONS = [
  { value: "all", label: "Semua Aktivitas" },
  { value: "po", label: "Perubahan PO" },
  { value: "customer", label: "Customer Notes" },
  { value: "internal", label: "Internal Comments" },
  { value: "task", label: "Riwayat Tugas" },
];

const PO_FIELD_LABELS: Record<string, string> = {
  noPo: "No PO",
  namaProject: "Nama Project",
  customer: "Customer",
  qty: "Qty",
  poAmount: "Nominal PO",
  tanggalPoMasuk: "Tanggal PO Masuk",
  targetPenyelesaian: "Target Pengiriman",
  deadline: "Tanggal Delivery",
  picUserId: "PIC",
  picProject: "PIC Project",
  departmentId: "PIC Departemen",
  status: "Project Progress",
  progress: "Progress",
  hasPainting: "Painting",
  trackingStages: "Project Progress",
  trackingTimeline: "Timeline Customer",
  catatan: "Catatan",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "menunggu",
    accepted: "diterima",
    rejected: "ditolak",
    selesai: "selesai",
  };
  return labels[status] ?? status;
}

function statusBadgeClass(status: string) {
  if (status === "accepted" || status === "selesai") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function includesText(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search);
}

export default function MonitoringKeseluruhan() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [searchText, setSearchText] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring-overall"],
    queryFn: () =>
      apiRequest<OverallMonitoringResponse>("/api/monitoring-overall"),
    refetchInterval: 15000,
  });

  const normalizedFilters = {
    department: departmentFilter.trim().toLowerCase(),
    user: userFilter.trim().toLowerCase(),
    project: projectFilter.trim().toLowerCase(),
    search: searchText.trim().toLowerCase(),
  };

  const isInDateRange = (value: string) => {
    const date = value.slice(0, 10);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  };

  const filtered = useMemo(() => {
    const source = data ?? {
      poActivities: [],
      customerNotes: [],
      internalComments: [],
      taskHistories: [],
    };

    const poActivities = source.poActivities.filter((item) => {
      if (!isInDateRange(item.createdAt)) return false;
      if (normalizedFilters.department && !includesText(item.departmentName, normalizedFilters.department)) return false;
      if (normalizedFilters.user && !includesText(item.changedByName, normalizedFilters.user)) return false;
      if (
        normalizedFilters.project &&
        ![item.noPo, item.namaProject].some((value) => includesText(value, normalizedFilters.project))
      ) return false;
      if (
        normalizedFilters.search &&
        ![
          item.noPo,
          item.namaProject,
          item.customer,
          item.changedByName,
          item.action,
          item.departmentName,
          JSON.stringify(item.changes ?? {}),
        ].some((value) => includesText(value, normalizedFilters.search))
      ) return false;
      return true;
    });

    const filterComment = (item: PoComment) => {
      if (!isInDateRange(item.createdAt)) return false;
      if (normalizedFilters.department && ![item.departmentName, item.userDepartment].some((value) => includesText(value, normalizedFilters.department))) return false;
      if (normalizedFilters.user && ![item.userName, item.customerName].some((value) => includesText(value, normalizedFilters.user))) return false;
      if (
        normalizedFilters.project &&
        ![item.noPo, item.namaProject].some((value) => includesText(value, normalizedFilters.project))
      ) return false;
      if (
        normalizedFilters.search &&
        ![
          item.noPo,
          item.namaProject,
          item.customer,
          item.departmentName,
          item.userDepartment,
          item.userName,
          item.customerName,
          item.comment,
        ].some((value) => includesText(value, normalizedFilters.search))
      ) return false;
      return true;
    };

    const taskHistories = source.taskHistories.filter((item) => {
      if (!isInDateRange(item.assignedAt)) return false;
      if (
        normalizedFilters.department &&
        ![item.assignedByDepartment, item.assignedToDepartment].some((value) =>
          includesText(value, normalizedFilters.department),
        )
      ) return false;
      if (
        normalizedFilters.user &&
        ![item.assignedByName, item.assignedToName].some((value) =>
          includesText(value, normalizedFilters.user),
        )
      ) return false;
      if (normalizedFilters.project && !includesText(item.project, normalizedFilters.project)) return false;
      if (
        normalizedFilters.search &&
        ![
          item.assignedByName,
          item.assignedToName,
          item.assignedByDepartment,
          item.assignedToDepartment,
          item.title,
          item.project,
          item.notes,
          item.responseNote,
          item.status,
        ].some((value) => includesText(value, normalizedFilters.search))
      ) return false;
      return true;
    });

    return {
      poActivities,
      customerNotes: source.customerNotes.filter(filterComment),
      internalComments: source.internalComments.filter(filterComment),
      taskHistories,
    };
  }, [data, startDate, endDate, departmentFilter, userFilter, projectFilter, searchText]);

  const showPo = activityType === "all" || activityType === "po";
  const showCustomer = activityType === "all" || activityType === "customer";
  const showInternal = activityType === "all" || activityType === "internal";
  const showTask = activityType === "all" || activityType === "task";

  return (
    <Layout>
      <div className="page-shell max-w-7xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-950">
            Monitoring Keseluruhan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Riwayat aktivitas PO, komunikasi, dan alur tugas seluruh departemen.
          </p>
        </div>

        <Card className="border border-border">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Mulai</Label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Akhir</Label>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Input value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} placeholder="Engineering" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User / PIC</Label>
              <Input value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="Nama user" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project / PO</Label>
              <Input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Nama project / PO" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jenis Aktivitas</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative md:col-span-2 xl:col-span-6">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Cari aktivitas, komentar, nama user, department, project, PO..."
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border border-border p-8 text-center text-sm text-muted-foreground">
            Gagal memuat Monitoring Keseluruhan
          </Card>
        ) : (
          <>
            {showPo && (
              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4" />
                    Riwayat Aktivitas Perubahan Data PO
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filtered.poActivities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Tidak ada data.</p>
                  ) : (
                    filtered.poActivities.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border bg-white p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {item.changedByName ?? "User"} - {item.action} - {item.noPo}
                          </p>
                          <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[item.namaProject, item.departmentName].filter(Boolean).join(" - ") || "-"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(item.changes ?? {}).map(([field, change]) => (
                            <span key={field} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {PO_FIELD_LABELS[field] ?? field}: {formatValue(change.before)} {"->"} {formatValue(change.after)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {showCustomer && (
              <CommentSection
                title="Riwayat Customer Notes"
                icon={MessageSquare}
                items={filtered.customerNotes}
                nameKey="customerName"
              />
            )}

            {showInternal && (
              <CommentSection
                title="Riwayat Internal Comments"
                icon={MessageSquare}
                items={filtered.internalComments}
                nameKey="userName"
              />
            )}

            {showTask && (
              <Card className="border border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="h-4 w-4" />
                    Riwayat Pemberian dan Penerimaan Tugas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filtered.taskHistories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Tidak ada data.</p>
                  ) : (
                    filtered.taskHistories.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Diberikan oleh {item.assignedByName} ({item.assignedByDepartment ?? "-"}) ke {item.assignedToName ?? "-"} ({item.assignedToDepartment ?? "-"})
                            </p>
                          </div>
                          <Badge className={statusBadgeClass(item.status)}>
                            {statusLabel(item.status)}
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                          <p><span className="font-semibold text-foreground">Project/PO:</span> {item.project ?? "-"}</p>
                          <p><span className="font-semibold text-foreground">Waktu diberikan:</span> {formatDateTime(item.assignedAt)}</p>
                          <p><span className="font-semibold text-foreground">Waktu penerimaan:</span> {formatDateTime(item.respondedAt)}</p>
                          <p><span className="font-semibold text-foreground">Catatan:</span> {item.notes ?? "-"}</p>
                        </div>
                        {item.status === "rejected" && item.responseNote && (
                          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                            Alasan penolakan: {item.responseNote}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function CommentSection({
  title,
  icon: Icon,
  items,
  nameKey,
}: {
  title: string;
  icon: typeof MessageSquare;
  items: PoComment[];
  nameKey: "customerName" | "userName";
}) {
  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada data.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-white p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-sm font-semibold">
                  {item[nameKey] ?? "-"} - {item.noPo ?? "-"}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[item.namaProject, item.departmentName ?? item.userDepartment].filter(Boolean).join(" - ") || "-"}
              </p>
              <p className="mt-2 text-sm text-foreground">{item.comment}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
