import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListPo,
  useListDepartments,
  useListEmployees,
  useCreatePo,
  useUpdatePo,
  useClosePo,
  useDeletePo,
  useGetPoSummary,
  useGetPoYearlyTrend,
  getListPoQueryKey,
  getGetPoSummaryQueryKey,
  getGetPoYearlyTrendQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus,
  Pencil,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Search,
  Filter,
  ChevronDown,
  Loader2,
  Package,
  Trash2,
  MessageSquare,
  Eye,
  Send,
} from "lucide-react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { apiRequest } from "@/lib/apiRequest";

const PO_STATUS_OPTS = [
  { value: "semua", label: "Semua Project Progress" },
  { value: "po_received", label: "PO Received" },
  { value: "engineering", label: "Engineering" },
  { value: "approval_drawing", label: "Approval Drawing" },
  { value: "material_order", label: "Material Order" },
  { value: "production", label: "Production" },
  { value: "quality_control", label: "Quality Control" },
  { value: "finishing_trial", label: "Finishing & Trial" },
  { value: "painting", label: "Painting" },
  { value: "delivery", label: "Delivery" },
  { value: "project_finished", label: "Project Finished" },
];

const CUSTOMER_TRACKING_STAGES = [
  { key: "po_received", label: "PO Received" },
  { key: "engineering", label: "Engineering" },
  { key: "approval_drawing", label: "Approval Drawing" },
  { key: "material_order", label: "Material Order" },
  { key: "production", label: "Production" },
  { key: "quality_control", label: "Quality Control" },
  { key: "finishing_trial", label: "Finishing & Trial" },
  { key: "painting", label: "Painting" },
  { key: "delivery", label: "Delivery" },
  { key: "project_finished", label: "Project Finished" },
] as const;

const PROJECT_PROGRESS_PERCENT: Record<string, number> = {
  po_received: 0,
  engineering: 20,
  approval_drawing: 20,
  material_order: 40,
  production: 60,
  quality_control: 60,
  finishing_trial: 80,
  painting: 80,
  delivery: 90,
  project_finished: 100,
};

interface StatusStyle {
  label: string;
  badge: string;
  dot: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  po_received: {
    label: "PO Received",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    dot: "bg-gray-400",
  },
  engineering: {
    label: "Engineering",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  approval_drawing: {
    label: "Approval Drawing",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  material_order: {
    label: "Material Order",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  production: {
    label: "Production",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  quality_control: {
    label: "Quality Control",
    badge: "bg-cyan-100 text-cyan-700 border-cyan-200",
    dot: "bg-cyan-500",
  },
  finishing_trial: {
    label: "Finishing & Trial",
    badge: "bg-teal-100 text-teal-700 border-teal-200",
    dot: "bg-teal-500",
  },
  painting: {
    label: "Painting",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
  },
  delivery: {
    label: "Delivery",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  project_finished: {
    label: "Project Finished",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  belum_mulai: {
    label: "PO Received",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    dot: "bg-gray-400",
  },
  selesai: {
    label: "Project Finished",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  close: {
    label: "Project Finished",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
};

function getDeadlineStyle(sisaHari: number | null, status: string) {
  if (sisaHari === null) return "text-muted-foreground";
  if (isFinishedPo(status)) {
    return sisaHari < 0 ? "text-green-600 font-semibold" : "text-green-600";
  }
  if (sisaHari < 0) return "text-red-600 font-semibold";
  if (sisaHari <= 7) return "text-orange-600 font-semibold";
  if (sisaHari <= 14) return "text-yellow-600";
  return "text-muted-foreground";
}

function formatDeadlineLabel(sisaHari: number | null, status: string): string {
  if (sisaHari === null) return "-";
  if (isFinishedPo(status)) return "Selesai";
  if (sisaHari < 0) return `${Math.abs(sisaHari)} hari lewat`;
  if (sisaHari === 0) return "Hari ini!";
  return `${sisaHari} hari lagi`;
}

function getDeliveryStatus(po: PoItem) {
  if (!po.targetPenyelesaian) {
    return {
      label: "Target Pengiriman Kosong",
      className: "border-gray-200 bg-gray-100 text-gray-700",
    };
  }

  if (
    isDateOnly(po.targetPenyelesaian) &&
    isDateOnly(po.deadline) &&
    po.deadline > po.targetPenyelesaian
  ) {
    const targetDate = new Date(`${po.targetPenyelesaian}T00:00:00.000Z`);
    const deliveryDate = new Date(`${po.deadline}T00:00:00.000Z`);
    const delayDays = Math.max(
      1,
      Math.round(
        (deliveryDate.getTime() - targetDate.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    return {
      label: `Delay ${delayDays} hari`,
      className: "border-red-200 bg-red-100 text-red-700",
    };
  }

  return {
    label: "On Time",
    className: "border-green-200 bg-green-100 text-green-700",
  };
}

interface PoItem {
  id: number;
  noPo: string;
  namaProject: string;
  customer?: string | null;
  qty?: string | null;
  poAmount?: number | null;
  tanggalPoMasuk: string;
  targetPenyelesaian?: string | null;
  deadline: string;
  sisaHari: number | null;
  picUserId?: number | null;
  picName?: string | null;
  picProject?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  status: string;
  statusLabel?: string;
  progress: number;
  hasPainting?: boolean;
  trackingStages?: string[];
  trackingTimeline?: TrackingTimelineItem[];
  catatan?: string | null;
  closedAt?: string | null;
  isEditLocked?: boolean;
  editLockNotice?: string | null;
}

interface PoFormState {
  noPo: string;
  namaProject: string;
  customer: string;
  qty: string;
  poAmount: string;
  tanggalPoMasuk: string;
  targetPenyelesaian: string;
  deadline: string;
  picUserId: string;
  picProject: string;
  departmentId: string;
  status: string;
  progress: string;
  hasPainting: boolean;
  trackingStages: string[];
  trackingTimeline: TrackingTimelineItem[];
  catatan: string;
}

interface TrackingTimelineItem {
  date: string;
  description: string;
}

type DeliveryInputMode = "date" | "text";

interface PoActivityLog {
  id: number;
  poId: number | null;
  noPo: string;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  changedByName?: string | null;
  createdAt: string;
}

interface CustomerTrackingComment {
  id: number;
  poId: number;
  customerName?: string;
  displayName?: string;
  comment: string;
  createdAt: string;
  isRead: boolean;
  source?: "customer" | "internal";
  noPo?: string | null;
  namaProject?: string | null;
}

interface PoInternalComment {
  id: number;
  poId: number;
  userId?: number | null;
  userName: string;
  userRole?: string | null;
  userDepartment?: string | null;
  comment: string;
  createdAt: string;
  noPo?: string | null;
  namaProject?: string | null;
}

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
  closedAt: "Tanggal Close",
  closedByUserId: "Ditutup Oleh",
};

const EMPTY_FORM: PoFormState = {
  noPo: "",
  namaProject: "",
  customer: "",
  qty: "",
  tanggalPoMasuk: "",
  targetPenyelesaian: "",
  poAmount: "",
  deadline: "",
  picUserId: "",
  picProject: "",
  departmentId: "",
  status: "po_received",
  progress: "0",
  hasPainting: false,
  trackingStages: [],
  trackingTimeline: [],
  catatan: "",
};
const NONE_VALUE = "none";
function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRupiahCompact(value: number) {
  if (value >= 1_000_000_000)
    return `${Number((value / 1_000_000_000).toFixed(1))}M`;
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}jt`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}rb`;
  return String(value);
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function formatActivityDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${getPart("weekday")}, ${getPart("day")} ${getPart("month")} ${getPart("year")}, ${getPart("hour")}:${getPart("minute")} WIB`;
}

function formatCommentDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${getPart("weekday")}, ${getPart("day")} ${getPart("month")} ${getPart("year")}, ${getPart("hour")}:${getPart("minute")} WIB`;
}

function formatActivityValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isoDateToDisplay(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return new Date(text).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  }
  return text;
}

function getActivityActionLabel(action: string) {
  if (action === "created") return "menambah PO";
  if (action === "updated") return "mengubah PO";
  if (action === "closed") return "menutup PO";
  if (action === "deleted") return "menghapus PO";
  return "mengubah PO";
}

const NOMINAL_AXIS_TICKS = [
  { value: 0, axis: 0 },
  { value: 200_000_000, axis: 1 },
  { value: 500_000_000, axis: 2 },
  { value: 2_000_000_000, axis: 3 },
  { value: 5_000_000_000, axis: 4 },
  { value: 10_000_000_000, axis: 5 },
] as const;

function getNominalAxisValue(value: number) {
  if (value <= 0) return 0;

  for (let i = 1; i < NOMINAL_AXIS_TICKS.length; i += 1) {
    const previous = NOMINAL_AXIS_TICKS[i - 1];
    const current = NOMINAL_AXIS_TICKS[i];

    if (value <= current.value) {
      const ratio =
        (value - previous.value) / (current.value - previous.value);
      return previous.axis + ratio * (current.axis - previous.axis);
    }
  }

  return NOMINAL_AXIS_TICKS[NOMINAL_AXIS_TICKS.length - 1].axis;
}

function formatNominalAxisLabel(value: number) {
  if (value === 1) return "200jt";
  if (value === 2) return "500jt";
  if (value === 3) return "2M";
  if (value === 4) return "5M";
  if (value === 5) return "10M";
  return "";
}

function isFinishedPo(status: string) {
  return status === "project_finished" || status === "selesai" || status === "close";
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));
}

function getStatusLabel(po: PoItem, fallback: string) {
  return po.statusLabel ?? fallback;
}

function getProgressPercent(status: string) {
  return PROJECT_PROGRESS_PERCENT[status] ?? 0;
}

function getProgressOptions(hasPainting: boolean) {
  return PO_STATUS_OPTS.filter(
    (item) =>
      item.value !== "semua" && (hasPainting || item.value !== "painting"),
  );
}

function getFinishedPoNotice(po: PoItem) {
  if (!po.isEditLocked) return null;

  return (
    po.editLockNotice ??
    "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya"
  );
}

const today = new Date();
function isoDateToDisplay(value: string) {
  if (!isDateOnly(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function JadwalProject() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const role = user?.role?.toLowerCase() ?? "";
  const email = user?.email?.toLowerCase() ?? "";
  const departmentName = user?.departmentName?.toLowerCase() ?? "";
  const departmentCode = user?.departmentCode?.toUpperCase() ?? "";
  const canManage =
    ["admin", "hr", "direktur", "director", "dir"].includes(role) ||
    ["AAF", "FIN", "MKT", "GA"].includes(departmentCode) ||
    departmentName.includes("finance") ||
    departmentName.includes("marketing") ||
    departmentName.includes("general affairs");
  const canEditPoData = canManage || role === "monitoring_dummy";
  const canUpdateProjectProgress =
    canEditPoData ||
    ["PUR", "ENG"].includes(departmentCode) ||
    departmentName.includes("purchasing") ||
    departmentName.includes("engineering");

  const localCanViewPoAmount =
    !["monitoring_dummy", "monitoring", "monitor"].includes(role) &&
    !email.includes("monitor") &&
    [
      "admin@adiyasa.com",
      "director@adiyasa.com",
      "marketing@adiyasa.com",
      "finance@adiyasa.com",
    ].includes(email) ||
    (!["monitoring_dummy", "monitoring", "monitor"].includes(role) &&
      !email.includes("monitor") &&
      ([
        "admin",
        "direktur",
        "director",
        "dir",
        "finance",
      ].includes(role) ||
        ["AAF", "FIN"].includes(departmentCode) ||
        departmentName.includes("finance")));

  const canViewPoActivity =
    ["admin", "direktur", "director", "dir", "monitoring_dummy"].includes(role) ||
    departmentCode === "GA" ||
    departmentName.includes("general affairs");
  const canViewPoDetail = Boolean(user);
  const canDeleteComments = ["admin", "direktur", "director", "dir"].includes(
    role,
  );

  const [filterMonth, setFilterMonth] = useState<string>(
    String(today.getMonth() + 1),
  );
  const [filterYear, setFilterYear] = useState<string>(
    String(today.getFullYear()),
  );
  const [filterStatus, setFilterStatus] = useState("semua");
  const [filterDept, setFilterDept] = useState("semua");
  const [searchText, setSearchText] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [viewingPo, setViewingPo] = useState<PoItem | null>(null);
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PoFormState>(EMPTY_FORM);
  const [deliveryInputMode, setDeliveryInputMode] = useState<DeliveryInputMode>("date");
  const [formLoading, setFormLoading] = useState(false);

  const poParams = {
    month: parseInt(filterMonth),
    year: parseInt(filterYear),
    ...(filterStatus !== "semua" ? { status: filterStatus } : {}),
    ...(filterDept !== "semua" ? { departmentId: parseInt(filterDept) } : {}),
    ...(searchText.trim() ? { search: searchText.trim() } : {}),
  };

  const { data: poList, isLoading: poLoading } = useListPo(poParams, {
    query: { queryKey: getListPoQueryKey(poParams) },
  });
  const { data: allPoList, isLoading: allPoLoading } = useListPo(undefined, {
    query: { queryKey: getListPoQueryKey() },
  });

  const { data: summary } = useGetPoSummary(
    { month: parseInt(filterMonth), year: parseInt(filterYear) },
    {
      query: {
        queryKey: getGetPoSummaryQueryKey({
          month: parseInt(filterMonth),
          year: parseInt(filterYear),
        }),
      },
    },
  );

  const { data: yearlyTrend } = useGetPoYearlyTrend(
    { year: parseInt(filterYear) },
    {
      query: {
        queryKey: getGetPoYearlyTrendQueryKey({ year: parseInt(filterYear) }),
      },
    },
  );

  const canViewPoAmount =
    !["monitoring_dummy", "monitoring", "monitor"].includes(role) &&
    !email.includes("monitor") &&
    (localCanViewPoAmount ||
      Boolean((summary as { canViewAmount?: boolean } | undefined)?.canViewAmount) ||
      Boolean((yearlyTrend as { canViewAmount?: boolean } | undefined)?.canViewAmount));

  const { data: poActivityLogs } = useQuery({
    queryKey: ["po-activity"],
    queryFn: () => apiRequest<PoActivityLog[]>("/api/po/activity"),
    enabled: canViewPoActivity,
    refetchInterval: 5000,
  });

  const { data: customerComments } = useQuery({
    queryKey: ["customer-tracking-comments"],
    queryFn: () =>
      apiRequest<CustomerTrackingComment[]>(
        "/api/customer-tracking/internal/comments",
      ),
    enabled: Boolean(user),
    refetchInterval: 15000,
  });

  const { data: dashboardInternalComments } = useQuery({
    queryKey: ["po-internal-comments"],
    queryFn: () => apiRequest<PoInternalComment[]>("/api/po/internal-comments"),
    enabled: Boolean(user),
    refetchInterval: 15000,
  });

  const { data: selectedCustomerComments } = useQuery({
    queryKey: ["customer-tracking-comments", viewingPo?.id],
    queryFn: () =>
      apiRequest<CustomerTrackingComment[]>(
        `/api/customer-tracking/${viewingPo?.id}/comments`,
      ),
    enabled: Boolean(viewingPo?.id),
  });

  const {
    data: internalPoComments,
    refetch: refetchInternalPoComments,
    isFetching: internalCommentsLoading,
  } = useQuery({
    queryKey: ["po-internal-comments", viewingPo?.id],
    queryFn: () =>
      apiRequest<PoInternalComment[]>(
        `/api/po/${viewingPo?.id}/internal-comments`,
      ),
    enabled: Boolean(viewingPo?.id),
  });

  const { data: departments } = useListDepartments();
  const { data: employees } = useListEmployees();
  const createPo = useCreatePo();
  const updatePo = useUpdatePo();
  const closePo = useClosePo();
  const deletePo = useDeletePo();

  const activityLogs = Array.isArray(poActivityLogs) ? poActivityLogs : [];
  const trackingComments = Array.isArray(customerComments)
    ? customerComments
    : [];
  const latestInternalComments = Array.isArray(dashboardInternalComments)
    ? dashboardInternalComments
    : [];
  const poCustomerComments = Array.isArray(selectedCustomerComments)
    ? selectedCustomerComments
    : [];
  const poInternalComments = Array.isArray(internalPoComments)
    ? internalPoComments
    : [];
  const pos = (Array.isArray(poList) ? poList : []) as PoItem[];
  const allPosRaw = (Array.isArray(allPoList) ? allPoList : []) as PoItem[];
  const allPos = allPosRaw.filter((po) => !isFinishedPo(po.status));
  const yearlyTrendItems = Array.isArray(
    (yearlyTrend as { items?: unknown[] } | undefined)?.items,
  )
    ? (
        yearlyTrend as {
          items: {
            month: string;
            totalPo: number;
            totalAmount?: number | null;
          }[];
        }
      ).items.map((item) => ({
        ...item,
        totalAmountRaw: Number(item.totalAmount ?? 0),
        totalAmountAxis: getNominalAxisValue(Number(item.totalAmount ?? 0)),
      }))
    : [];
  const poCountCeil = 35;
  const poCountTicks = [0, 7, 14, 21, 28, 35];
  const poCountReferenceValues = Array.from(
    new Set(
      yearlyTrendItems
        .map((item) => Number(item.totalPo))
        .filter((value) => value > 0 && !poCountTicks.includes(value)),
    ),
  );
  const depts = (Array.isArray(departments) ? departments : []) as {
    id: number;
    name: string;
    code?: string | null;
  }[];
  const picDepartments = depts.filter((department) => {
    const name = department.name.toLowerCase();
    const code = String(department.code ?? "").toUpperCase();
    return code === "MKT" || code === "ENG" || name.includes("marketing") || name.includes("engineering");
  });
  const emps = (Array.isArray(employees) ? employees : []) as {
    id: number;
    name: string;
    departmentId?: number | null;
  }[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPoQueryKey(poParams) });
    queryClient.invalidateQueries({ queryKey: getListPoQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetPoSummaryQueryKey({
        month: parseInt(filterMonth),
        year: parseInt(filterYear),
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetPoYearlyTrendQueryKey({ year: parseInt(filterYear) }),
    });
    queryClient.invalidateQueries({ queryKey: ["po-activity"] });
  };

  const openCreate = () => {
    setEditingId(null);
    setDeliveryInputMode("date");
    setForm({
      ...EMPTY_FORM,
      tanggalPoMasuk: today.toISOString().split("T")[0],
    });
    setShowForm(true);
  };

  const openEdit = (po: PoItem) => {
    setEditingId(po.id);
    setDeliveryInputMode(isDateOnly(po.deadline) ? "date" : "text");
    setForm({
      noPo: po.noPo,
      namaProject: po.namaProject,
      customer: po.customer ?? "",
      qty: po.qty ?? "",
      poAmount: po.poAmount ? String(po.poAmount) : "",
      tanggalPoMasuk: po.tanggalPoMasuk,
      targetPenyelesaian: po.targetPenyelesaian ?? "",
      deadline: po.deadline,
      picUserId: po.picUserId ? String(po.picUserId) : "",
      picProject: po.picProject ?? "",
      departmentId: po.departmentId ? String(po.departmentId) : "",
      status: po.status,
      progress: String(getProgressPercent(po.status)),
      hasPainting: Boolean(po.hasPainting),
      trackingStages: Array.isArray(po.trackingStages)
        ? po.trackingStages
        : [],
      trackingTimeline: Array.isArray(po.trackingTimeline)
        ? po.trackingTimeline
        : [],
      catatan: po.catatan ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDeliveryInputMode("date");
  };

  const toggleTrackingStage = (stageKey: string) => {
    setForm((current) => ({
      ...current,
      trackingStages: current.trackingStages.includes(stageKey)
        ? current.trackingStages.filter((item) => item !== stageKey)
        : [...current.trackingStages, stageKey],
    }));
  };

  const addTrackingTimelineItem = () => {
    setForm((current) => ({
      ...current,
      trackingTimeline: [
        ...current.trackingTimeline,
        { date: "", description: "" },
      ],
    }));
  };

  const updateTrackingTimelineItem = (
    index: number,
    field: keyof TrackingTimelineItem,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      trackingTimeline: current.trackingTimeline.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const removeTrackingTimelineItem = (index: number) => {
    setForm((current) => ({
      ...current,
      trackingTimeline: current.trackingTimeline.filter(
        (_item, itemIndex) => itemIndex !== index,
      ),
    }));
  };

  const closeDetail = () => {
    setViewingPo(null);
    setInternalCommentDraft("");
  };

  const handleSendInternalComment = async () => {
    if (!viewingPo || !internalCommentDraft.trim()) return;

    try {
      await apiRequest(`/api/po/${viewingPo.id}/internal-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: internalCommentDraft }),
      });
      setInternalCommentDraft("");
      await refetchInternalPoComments();
      queryClient.invalidateQueries({ queryKey: ["po-internal-comments"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Berhasil", description: "Komentar internal terkirim" });
    } catch (error) {
      toast({
        title: "Gagal",
        description:
          error instanceof Error ? error.message : "Gagal mengirim komentar",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCustomerComment = async (comment: CustomerTrackingComment) => {
    if (!comment.poId || !canDeleteComments) return;
    if (!confirm("Hapus komentar customer ini?")) return;

    await apiRequest(
      `/api/customer-tracking/${comment.poId}/comments/${comment.id}`,
      { method: "DELETE" },
    );
    queryClient.invalidateQueries({ queryKey: ["customer-tracking-comments"] });
    if (viewingPo?.id === comment.poId) {
      queryClient.invalidateQueries({
        queryKey: ["customer-tracking-comments", viewingPo.id],
      });
    }
    toast({ title: "Berhasil", description: "Komentar customer dihapus" });
  };

  const handleDeleteInternalComment = async (comment: PoInternalComment) => {
    if (!viewingPo || !canDeleteComments) return;
    if (!confirm("Hapus komentar internal ini?")) return;

    await apiRequest(
      `/api/po/${viewingPo.id}/internal-comments/${comment.id}`,
      { method: "DELETE" },
    );
    await refetchInternalPoComments();
    toast({ title: "Berhasil", description: "Komentar internal dihapus" });
  };

  const handleSave = async () => {
    if (canEditPoData && (
      !form.noPo.trim() ||
      !form.namaProject.trim() ||
      !form.customer.trim() ||
      !form.tanggalPoMasuk ||
      !form.deadline ||
      !form.departmentId
    )) {
      toast({
        title: "Validasi Gagal",
        description:
          "No PO, nama project, customer, tanggal masuk, PIC Departemen, dan Tanggal Delivery wajib diisi",
        variant: "destructive",
      });
      return;
    }

    const normalizedDeadline = form.deadline.trim();
    if (canEditPoData && !normalizedDeadline) {
      toast({
        title: "Validasi Gagal",
        description: "Tanggal Delivery wajib diisi",
        variant: "destructive",
      });
      return;
    }

    if (!form.hasPainting && form.status === "painting") {
      toast({
        title: "Validasi Gagal",
        description: "Painting hanya bisa dipilih jika checkbox Painting dicentang",
        variant: "destructive",
      });
      return;
    }

    if (
      canViewPoAmount &&
      form.poAmount.trim() &&
      Number(form.poAmount) > 10000000000
    ) {
      toast({
        title: "Validasi Gagal",
        description: "Nominal PO maksimal 10.000.000.000",
        variant: "destructive",
      });
      return;
    }
    setFormLoading(true);
    try {
      const currentEditingPo = editingId
        ? allPosRaw.find((po) => po.id === editingId)
        : null;
      const payload = canEditPoData ? {
        noPo: form.noPo,
        namaProject: form.namaProject,
        customer: form.customer || undefined,
        qty: form.qty || undefined,
        ...(canViewPoAmount
          ? { poAmount: form.poAmount ? Number(form.poAmount) : undefined }
          : {}),
        tanggalPoMasuk: form.tanggalPoMasuk,
        targetPenyelesaian: form.targetPenyelesaian || undefined,
        ...(!editingId || !currentEditingPo?.deadline
          ? { deadline: normalizedDeadline }
          : {}),
        picUserId: form.picUserId ? parseInt(form.picUserId) : undefined,
        picProject: form.picProject || undefined,
        departmentId: form.departmentId
          ? parseInt(form.departmentId)
          : undefined,
        status: form.status,
        hasPainting: form.hasPainting,
        trackingStages: form.trackingStages,
        trackingTimeline: form.trackingTimeline
          .map((item) => ({
            date: item.date.trim(),
            description: item.description.trim(),
          }))
          .filter((item) => item.date || item.description),
        catatan: form.catatan || undefined,
      } : {
        status: form.status,
      };
      if (editingId) {
        await updatePo.mutateAsync({ id: editingId, data: payload as any });
        toast({ title: "Berhasil", description: "PO berhasil diperbarui" });
      } else {
        await createPo.mutateAsync({
          data: { ...payload, deadline: normalizedDeadline } as any,
        });
        toast({ title: "Berhasil", description: "PO berhasil ditambahkan" });
      }
      closeForm();
      invalidate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menyimpan PO";

      toast({
        title: "Gagal",
        description: message.includes("30 hari")
          ? "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya"
          : message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleClose = async (po: PoItem) => {
    if (!confirm(`Tandai PO "${po.noPo} - ${po.namaProject}" sebagai Project Finished?`))
      return;
    try {
      await closePo.mutateAsync({ id: po.id });
      toast({ title: "Berhasil", description: "PO ditandai sebagai Project Finished" });
      invalidate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menutup PO";

      toast({
        title: "Gagal",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (po: PoItem) => {
    if (!confirm(`Hapus PO "${po.noPo} - ${po.namaProject}"?`)) return;
    try {
      await deletePo.mutateAsync({ id: po.id });
      toast({ title: "Berhasil", description: "PO berhasil dihapus" });
      invalidate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menghapus PO";

      toast({
        title: "Gagal",
        description: message,
        variant: "destructive",
      });
    }
  };

  const months = [
    { v: "1", l: "Januari" },
    { v: "2", l: "Februari" },
    { v: "3", l: "Maret" },
    { v: "4", l: "April" },
    { v: "5", l: "Mei" },
    { v: "6", l: "Juni" },
    { v: "7", l: "Juli" },
    { v: "8", l: "Agustus" },
    { v: "9", l: "September" },
    { v: "10", l: "Oktober" },
    { v: "11", l: "November" },
    { v: "12", l: "Desember" },
  ];
  const years = Array.from(
    { length: 5 },
    (_, i) => today.getFullYear() - 2 + i,
  );

  const summaryCards = summary
    ? (() => {
      const targetPercentage = Number(
        (summary as { persentasePencapaian?: number | string })
          .persentasePencapaian ?? 0,
      );

      return [
        {
          label: "Total PO",
          value: (summary as { totalPo: number }).totalPo,
          icon: Package,
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          label: "Selesai",
          value: (summary as { poSelesai: number }).poSelesai,
          icon: CheckCircle2,
          color: "text-green-600",
          bg: "bg-green-50",
        },
        {
          label: "Belum Selesai",
          value: (summary as { poBelumSelesai: number }).poBelumSelesai,
          icon: Clock,
          color: "text-gray-600",
          bg: "bg-gray-50",
        },
        {
          label: "Delay",
          value: (summary as { poDelay: number }).poDelay,
          icon: AlertTriangle,
          color: "text-red-600",
          bg: "bg-red-50",
        },
        {
          label: "Hampir Tanggal Delivery",
          value: (summary as { poHampirDeadline: number }).poHampirDeadline,
          icon: ChevronDown,
          color: "text-orange-600",
          bg: "bg-orange-50",
        },
        {
          label: "Pencapaian Target",
          value: `${Number.isFinite(targetPercentage) ? targetPercentage : 0}%`,
          ...(canViewPoAmount
            ? {
                description: `${formatRupiahCompact(Number((summary as { totalNominal?: number }).totalNominal ?? 0))} / ${formatRupiahCompact(Number((summary as { monthlyTarget?: number }).monthlyTarget ?? 0))}`,
              }
            : {}),
          targetLabel: `Target Bulan ${(summary as { targetMonthName?: string }).targetMonthName ?? months.find((item) => item.v === filterMonth)?.l ?? ""}`,
          icon: TrendingUp,
          color: "text-purple-600",
          bg: "bg-purple-50",
        },
      ];
    })()
    : [];

  const statusChartData = [
    ...PO_STATUS_OPTS.filter((item) => item.value !== "semua").map((item) => ({
      status: item.label,
      count: pos.filter((po) => po.status === item.value).length,
    })),
  ];

  const selectedPoActivity = viewingPo
    ? activityLogs.filter((log) => log.poId === viewingPo.id)
    : [];
  const selectedStatusStyle = viewingPo
    ? (STATUS_STYLES[viewingPo.status] ?? STATUS_STYLES.belum_mulai)
    : STATUS_STYLES.po_received;
  const selectedDeadlineStyle = viewingPo
    ? getDeadlineStyle(viewingPo.sisaHari, viewingPo.status)
    : "text-muted-foreground";
  const selectedDeadlineLabel = viewingPo
    ? formatDeadlineLabel(viewingPo.sisaHari, viewingPo.status)
    : "-";

  return (
    <Layout>
      <div className="page-shell space-y-5 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Jadwal Project & Monitoring PO
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pantau Tanggal Delivery dan status PO/Project secara real-time
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Tambah PO
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        {summaryCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="border border-border">
                  <CardContent className="p-4">
                    <div
                      className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}
                    >
                      <Icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                    <p className={`text-xl font-bold ${card.color}`}>
                      {card.value}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        {card.label}
                      </p>
                      {"targetLabel" in card && card.targetLabel && (
                        <span className="rounded-md border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">
                          {card.targetLabel}
                        </span>
                      )}
                    </div>
                    {"description" in card && card.description && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {card.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {canViewPoActivity && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Aktivitas Perubahan PO</span>
                <span className="text-xs font-normal text-muted-foreground">Live setiap 5 detik</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada perubahan PO yang tercatat.</p>
              ) : (
                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {activityLogs.slice(0, 8).map((log) => {
                    const entries = Object.entries(log.changes ?? {}).slice(0, 4);

                    return (
                      <div key={log.id} className="rounded-lg border border-border bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {log.changedByName ?? "User"} {getActivityActionLabel(log.action)} {log.noPo}
                          </p>
                          <span className="text-xs text-muted-foreground">{formatActivityDateTime(log.createdAt)}</span>
                        </div>
                        {entries.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entries.map(([field, change]) => (
                              <span key={field} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {PO_FIELD_LABELS[field] ?? field}: {formatActivityValue(change.before)} {"->"} {formatActivityValue(change.after)}
                              </span>
                            ))}
                            {Object.keys(log.changes ?? {}).length > entries.length && (
                              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                                +{Object.keys(log.changes ?? {}).length - entries.length} field lain
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Customer Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackingComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada komentar customer.
              </p>
            ) : (
              trackingComments.slice(0, 8).map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-border bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">
                            {comment.displayName ?? comment.customerName ?? "-"}
                          </span>{" "}
                          - {comment.comment}{" "}
                          <span className="text-xs text-muted-foreground">
                            {formatCommentDateTime(comment.createdAt)}
                          </span>
                        </p>
                      <p className="text-xs text-muted-foreground">
                        {comment.noPo ?? "-"} · {comment.namaProject ?? "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canDeleteComments && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDeleteCustomerComment(comment)}
                          title="Hapus komentar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Internal Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestInternalComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada komentar internal.
              </p>
            ) : (
              latestInternalComments.slice(0, 8).map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-border bg-white p-3"
                >
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{comment.userName}</span>{" "}
                    - {comment.comment}{" "}
                    <span className="text-xs text-muted-foreground">
                      {formatCommentDateTime(comment.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {comment.noPo ?? "-"} - {comment.namaProject ?? "-"}
                    {comment.userDepartment ? ` - ${comment.userDepartment}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {yearlyTrendItems.length > 0 && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Grafik Monitoring PO {filterYear}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {canViewPoAmount
                  ? "Bar menunjukkan jumlah PO per bulan, line menunjukkan total nominal PO."
                  : "Grafik menunjukkan jumlah PO per bulan."}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-4">
              <div className="h-80 min-w-[620px] sm:min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={yearlyTrendItems}
                    margin={{ top: 10, right: 24, left: 24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      domain={[0, poCountCeil]}
                      ticks={poCountTicks}
                      width={64}
                      label={{
                        value: "Jumlah PO",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <YAxis
                      yAxisId="leftMarkers"
                      orientation="left"
                      domain={[0, poCountCeil]}
                      ticks={poCountReferenceValues}
                      axisLine={false}
                      tick={false}
                      tickLine={{
                        stroke: "#2563eb",
                        strokeWidth: 2,
                      }}
                      width={0}
                    />
                    {canViewPoAmount && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 12 }}
                        width={84}
                        domain={[0, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        interval={0}
                        tickMargin={8}
                        tickFormatter={(value) =>
                          formatNominalAxisLabel(Number(value))
                        }
                        label={{
                          value: "Nominal PO",
                          angle: 90,
                          position: "insideRight",
                        }}
                      />
                    )}
                    <Tooltip
                      formatter={(value, name, item) => {
                        if (name === "Total Nominal") {
                          const payload = item.payload as {
                            totalAmountRaw?: number;
                          };
                          return [
                            formatRupiah(Number(payload.totalAmountRaw ?? 0)),
                            name,
                          ];
                        }

                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="totalPo"
                      name="Jumlah PO"
                      fill="#2563eb"
                      radius={[6, 6, 0, 0]}
                    />
                    {canViewPoAmount && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="totalAmountAxis"
                        name="Total Nominal"
                        stroke="#f97316"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.v} value={m.v}>
                          {m.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tahun</Label>
                  <Select value={filterYear} onValueChange={setFilterYear}>
                    <SelectTrigger className="h-8 w-24 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project Progress</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PO_STATUS_OPTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Departemen</Label>
                <Select value={filterDept} onValueChange={setFilterDept}>
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua">Semua Departemen</SelectItem>
                    {depts.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-48">
                <Label className="text-xs">Cari</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    placeholder="No PO, nama project, customer..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border border-border">
          <CardHeader className="pb-0 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                Daftar PO / Project
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {pos.length} PO
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-3">
            {poLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : pos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Tidak ada data PO untuk filter ini</p>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={openCreate}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Tambah PO Pertama
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        No PO
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Nama Project
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Customer
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Qty
                      </th>
                      {canViewPoAmount && (
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Nominal PO
                        </th>
                      )}
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        PIC
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Tanggal Masuk
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Tanggal Delivery
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Status
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Sisa Hari
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Project Progress
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Progress
                      </th>
                      {canViewPoDetail && (
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Aksi
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map((po) => {
                      const ss =
                        STATUS_STYLES[po.status] ?? STATUS_STYLES.belum_mulai;
                      const dlStyle = getDeadlineStyle(po.sisaHari, po.status);
                      const dlLabel = formatDeadlineLabel(
                        po.sisaHari,
                        po.status,
                      );
                      const deliveryStatus = getDeliveryStatus(po);
                      return (
                        <tr
                          key={po.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs font-medium text-foreground whitespace-nowrap">
                            {po.noPo}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">
                              {po.namaProject}
                            </p>
                            {po.departmentName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {po.departmentName}
                              </p>
                            )}
                            {po.isEditLocked && (
                              <p className="text-xs text-red-600 mt-1">
                                {getFinishedPoNotice(po)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.customer ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.qty ?? "-"}
                          </td>
                          {canViewPoAmount && (
                            <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                              {po.poAmount ? formatRupiah(po.poAmount) : "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.picProject ?? po.picName ?? "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-foreground">
                              {isoDateToDisplay(po.tanggalPoMasuk)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-foreground">
                              {isoDateToDisplay(po.deadline)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${deliveryStatus.className}`}>
                              {deliveryStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`text-xs font-medium ${dlStyle}`}>
                              {dlLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${ss.badge}`}
                            >
                              <span
                                className={`inline-block w-1.5 h-1.5 rounded-full ${ss.dot} mr-1.5`}
                              />
                              {getStatusLabel(po, ss.label)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-20">
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${isFinishedPo(po.status) ? "bg-green-500" : "bg-primary"}`}
                                  style={{ width: `${clampProgress(po.progress)}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">
                                {po.progress}%
                              </span>
                            </div>
                          </td>
                          {canViewPoDetail && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                  title="Lihat Detail"
                                  onClick={() => setViewingPo(po)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {canUpdateProjectProgress && (
                                  <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7"
                                  title={
                                    po.isEditLocked
                                      ? (getFinishedPoNotice(po) ??
                                        "PO terkunci")
                                      : "Edit"
                                  }
                                  disabled={Boolean(po.isEditLocked)}
                                  onClick={() => openEdit(po)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {canManage && !isFinishedPo(po.status) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      title="Progress Selesai"
                                      onClick={() => handleClose(po)}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-0 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                Keseluruhan PO / Project
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {allPos.length} PO
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-3">
            {allPoLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : allPos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Belum ada data PO / Project</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        No PO
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Nama Project
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Customer
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Qty
                      </th>
                      {canViewPoAmount && (
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          Nominal PO
                        </th>
                      )}
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Tanggal Masuk
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Tanggal Delivery
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Status
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Project Progress
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        Progress
                      </th>
                      {canViewPoDetail && (
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Aksi
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {allPos.map((po) => {
                      const ss =
                        STATUS_STYLES[po.status] ?? STATUS_STYLES.belum_mulai;
                      const deliveryStatus = getDeliveryStatus(po);
                      return (
                        <tr
                          key={po.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs font-medium text-foreground whitespace-nowrap">
                            {po.noPo}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">
                              {po.namaProject}
                            </p>
                            {po.departmentName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {po.departmentName}
                              </p>
                            )}
                          </td>
                          {po.isEditLocked && (
                            <p className="text-xs text-red-600 mt-1">
                              {getFinishedPoNotice(po)}
                            </p>
                          )}
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.customer ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.qty ?? "-"}
                          </td>
                          {canViewPoAmount && (
                            <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                              {po.poAmount ? formatRupiah(po.poAmount) : "-"}
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isoDateToDisplay(po.tanggalPoMasuk)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isoDateToDisplay(po.deadline)}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${deliveryStatus.className}`}>
                              {deliveryStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${ss.badge}`}
                            >
                              <span
                                className={`inline-block w-1.5 h-1.5 rounded-full ${ss.dot} mr-1.5`}
                              />
                              {getStatusLabel(po, ss.label)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-20">
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${isFinishedPo(po.status) ? "bg-green-500" : "bg-primary"}`}
                                  style={{ width: `${clampProgress(po.progress)}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">
                                {po.progress}%
                              </span>
                            </div>
                          </td>
                          {canViewPoDetail && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                  title="Lihat Detail"
                                  onClick={() => setViewingPo(po)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {canUpdateProjectProgress && (
                                  <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7"
                                  title={
                                    po.isEditLocked
                                      ? (getFinishedPoNotice(po) ??
                                        "PO terkunci")
                                      : "Edit"
                                  }
                                  disabled={Boolean(po.isEditLocked)}
                                  onClick={() => openEdit(po)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {canManage && !isFinishedPo(po.status) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      title="Progress Selesai"
                                      onClick={() => handleClose(po)}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="w-7 h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title={
                                    po.isEditLocked
                                      ? (getFinishedPoNotice(po) ??
                                        "PO terkunci")
                                      : "Hapus"
                                  }
                                  disabled={Boolean(po.isEditLocked)}
                                  onClick={() => handleDelete(po)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                                )}
                                  </>
                                )}
                              </div>
                            </td>
                          )}
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

      {/* Detail PO Modal */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDetail}
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={closeDetail}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-foreground">
                    Detail PO
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {viewingPo.noPo} · {viewingPo.namaProject}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
                <Card className="border border-border">
                  <CardContent className="p-5">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        PO: {viewingPo.noPo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getStatusLabel(viewingPo, selectedStatusStyle.label)}
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full ${
                            viewingPo.status === "delay"
                              ? "bg-red-500"
                              : isFinishedPo(viewingPo.status)
                                ? "bg-green-500"
                                : "bg-primary"
                          }`}
                          style={{
                            width: `${clampProgress(viewingPo.progress)}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm font-bold">
                        {viewingPo.progress}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      PO Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <DetailInfo label="Nomor PO" value={viewingPo.noPo} />
                    <DetailInfo
                      label="Nama Customer"
                      value={viewingPo.customer ?? "-"}
                    />
                    <DetailInfo
                      label="Nama Project"
                      value={viewingPo.namaProject}
                    />
                    <DetailInfo
                      label="Tanggal PO Masuk"
                      value={isoDateToDisplay(viewingPo.tanggalPoMasuk)}
                    />
                    <DetailInfo
                      label="Tanggal Delivery"
                      value={isoDateToDisplay(viewingPo.deadline)}
                    />
                    <DetailInfo
                      label="Target Pengiriman"
                      value={isoDateToDisplay(viewingPo.targetPenyelesaian || "-")}
                    />
                    <DetailInfo
                      label="PIC Departemen"
                      value={viewingPo.departmentName ?? "-"}
                    />
                    <DetailInfo
                      label="PIC Project"
                      value={viewingPo.picProject ?? viewingPo.picName ?? "-"}
                    />
                    <DetailInfo
                      label="Project Progress"
                      value={getStatusLabel(viewingPo, selectedStatusStyle.label)}
                    />
                  </CardContent>
                </Card>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Detail Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        viewingPo.status === "delay" ||
                        selectedDeadlineLabel.includes("lewat")
                          ? "border-red-200 bg-red-50 text-red-700"
                          : selectedDeadlineLabel.includes("hari lagi") &&
                              (viewingPo.sisaHari ?? 99) <= 7
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-green-200 bg-green-50 text-green-700"
                      }`}
                    >
                      <p className="font-semibold">
                        Status Ketepatan Waktu:{" "}
                        <span className={selectedDeadlineStyle}>
                          {viewingPo.status === "delay" ||
                          selectedDeadlineLabel.includes("lewat")
                            ? "Delay"
                            : selectedDeadlineLabel.includes("hari lagi") &&
                                (viewingPo.sisaHari ?? 99) <= 7
                              ? "At Risk"
                              : "On Time"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs">{selectedDeadlineLabel}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Project Issue & Action</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-700">
                      {viewingPo.catatan?.trim() ||
                        "Tidak ada kendala yang dilaporkan."}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Timeline Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedPoActivity.length > 0 ? (
                      selectedPoActivity.slice(0, 6).map((log) => (
                        <div
                          key={log.id}
                          className="border-l-2 border-blue-200 pl-3"
                        >
                          <p className="text-xs font-semibold text-slate-900">
                            {formatActivityDateTime(log.createdAt)}
                          </p>
                          <p className="text-sm text-slate-600">
                            {getActivityActionLabel(log.action)} {log.noPo}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="border-l-2 border-blue-200 pl-3">
                        <p className="text-xs font-semibold text-slate-900">
                          {isoDateToDisplay(viewingPo.tanggalPoMasuk)}
                        </p>
                        <p className="text-sm text-slate-600">PO diterima</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>

              <Card className="border border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4" />
                    Customer Notes ({poCustomerComments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {poCustomerComments.length === 0 ? (
                    <p className="py-5 text-center text-sm text-muted-foreground">
                      Belum ada komentar customer
                    </p>
                  ) : (
                    poCustomerComments.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span>
                            <span className="font-semibold">
                              {item.displayName ?? item.customerName ?? "-"}
                            </span>{" "}
                            - {item.comment}{" "}
                            <span className="text-xs text-muted-foreground">
                              {formatCommentDateTime(item.createdAt)}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            {canDeleteComments && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => handleDeleteCustomerComment(item)}
                                title="Hapus komentar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4" />
                    Komentar Internal PTAA ({poInternalComments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {internalCommentsLoading ? (
                    <div className="flex justify-center py-5">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : poInternalComments.length === 0 ? (
                    <p className="py-5 text-center text-sm text-muted-foreground">
                      Belum ada komentar internal
                    </p>
                  ) : (
                    poInternalComments.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border bg-slate-50 p-3"
                      >
                        <div className="flex flex-wrap justify-between gap-2 text-sm">
                          <span>
                            <span className="font-semibold">
                              {item.userName}
                            </span>{" "}
                            - {item.comment}{" "}
                            <span className="text-xs text-muted-foreground">
                              {formatCommentDateTime(item.createdAt)}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            {canDeleteComments && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => handleDeleteInternalComment(item)}
                                title="Hapus komentar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={internalCommentDraft}
                      onChange={(event) =>
                        setInternalCommentDraft(event.target.value)
                      }
                      placeholder="Tambahkan komentar internal..."
                      rows={2}
                      className="min-h-16 resize-none text-sm"
                    />
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={!internalCommentDraft.trim()}
                      onClick={handleSendInternalComment}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Kirim Komentar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Komentar internal ini hanya untuk pengguna PTAA dan tidak
                    muncul di Customer Tracking Portal.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeForm}
          />
          <div className="relative z-10 bg-background rounded-xl shadow-2xl border border-border w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-base font-bold">
                {editingId ? "Edit PO" : "Tambah PO Baru"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8"
                onClick={closeForm}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    No PO <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.noPo}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, noPo: e.target.value }))
                    }
                    placeholder="PO/2024/001"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Nama Project <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.namaProject}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, namaProject: e.target.value }))
                    }
                    placeholder="Nama project..."
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div
                className={`grid grid-cols-1 gap-4 ${canViewPoAmount ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}
              >
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Customer <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.customer}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, customer: e.target.value }))
                    }
                    placeholder="Nama customer..."
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Qty</Label>
                  <Input
                    value={form.qty}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, qty: e.target.value }))
                    }
                    placeholder="Contoh: 1 Unit / 1 Set / 1 Lot"
                    className="h-9 text-sm"
                  />
                </div>
                {canViewPoAmount && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Nominal PO</Label>
                    <Input
                      type="number"
                      min="0"
                      max="10000000000"
                      value={form.poAmount}
                      disabled={!canEditPoData}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, poAmount: e.target.value }))
                      }
                      placeholder="Contoh: 15000000"
                      className="h-9 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maksimal 10.000.000.000
                    </p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    PIC Departemen <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.departmentId || NONE_VALUE}
                    disabled={!canEditPoData}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        departmentId: v === NONE_VALUE ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pilih departemen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Pilih Departemen</SelectItem>
                      {picDepartments.map((department) => (
                        <SelectItem key={department.id} value={String(department.id)}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">PIC Project</Label>
                  <Input
                    value={form.picProject}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, picProject: e.target.value }))
                    }
                    placeholder="Contoh: Budi / Ibu Yessi"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Tanggal PO Masuk <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.tanggalPoMasuk}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tanggalPoMasuk: e.target.value }))
                    }
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Target Pengiriman
                  </Label>
                  <Input
                    type="date"
                    value={form.targetPenyelesaian}
                    disabled={!canEditPoData}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        targetPenyelesaian: e.target.value,
                      }))
                    }
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Tanggal Delivery <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
                    <Select
                      value={deliveryInputMode}
                      disabled={!canEditPoData || Boolean(editingId && form.deadline)}
                      onValueChange={(value) => {
                        const mode = value as DeliveryInputMode;
                        setDeliveryInputMode(mode);
                        setForm((f) => ({
                          ...f,
                          deadline: mode === "date" && !isDateOnly(f.deadline) ? "" : f.deadline,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Pilih Tanggal</SelectItem>
                        <SelectItem value="text">Isi Teks Manual</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type={deliveryInputMode === "date" ? "date" : "text"}
                      value={form.deadline}
                      readOnly={Boolean(editingId && form.deadline)}
                      disabled={!canEditPoData}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, deadline: e.target.value }))
                      }
                      placeholder={
                        deliveryInputMode === "date"
                          ? undefined
                          : "Minggu ke-2 Juni / Urgent / Estimasi akhir bulan"
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Project Progress</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        status: v,
                        progress: String(getProgressPercent(v)),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getProgressOptions(form.hasPainting).map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Progress Otomatis</Label>
                  <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm font-semibold">
                    {form.progress}%
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.hasPainting}
                  disabled={!canEditPoData}
                  onChange={(event) =>
                    setForm((f) => ({
                      ...f,
                      hasPainting: event.target.checked,
                      status:
                        !event.target.checked && f.status === "painting"
                          ? "finishing_trial"
                          : f.status,
                      progress: String(
                        getProgressPercent(
                          !event.target.checked && f.status === "painting"
                            ? "finishing_trial"
                            : f.status,
                        ),
                      ),
                    }))
                  }
                  className="h-4 w-4"
                />
                <span className="font-medium">Painting / Pengecatan</span>
              </label>
              <div className="space-y-3 rounded-lg border border-border bg-slate-50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="text-xs font-semibold">
                      Timeline Progress Customer
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Isi manual update yang boleh dilihat customer.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTrackingTimelineItem}
                    disabled={!canEditPoData}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Tambah Timeline
                  </Button>
                </div>
                {form.trackingTimeline.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-white px-3 py-4 text-center text-xs text-muted-foreground">
                    Belum ada timeline customer.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.trackingTimeline.map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-2 rounded-md border border-border bg-white p-2 sm:grid-cols-[150px_1fr_auto]"
                      >
                        <Input
                          type="date"
                          value={item.date}
                          onChange={(event) =>
                            updateTrackingTimelineItem(
                              index,
                              "date",
                              event.target.value,
                            )
                          }
                          className="h-8 text-sm"
                          disabled={!canEditPoData}
                        />
                        <Input
                          value={item.description}
                          onChange={(event) =>
                            updateTrackingTimelineItem(
                              index,
                              "description",
                              event.target.value,
                            )
                          }
                          placeholder="Contoh: Engineering 1 - Proses instalasi"
                          className="h-8 text-sm"
                          disabled={!canEditPoData}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => removeTrackingTimelineItem(index)}
                          disabled={!canEditPoData}
                          title="Hapus timeline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan</Label>
                <Textarea
                  value={form.catatan}
                  disabled={!canEditPoData}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, catatan: e.target.value }))
                  }
                  placeholder="Catatan tambahan..."
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 rounded-b-xl border-t border-border bg-background px-4 py-4 sm:px-6">
              <Button
                variant="outline"
                onClick={closeForm}
                disabled={formLoading}
              >
                Batal
              </Button>
              <Button onClick={handleSave} disabled={formLoading}>
                {formLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {editingId ? "Simpan Perubahan" : "Tambah PO"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function DetailInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
