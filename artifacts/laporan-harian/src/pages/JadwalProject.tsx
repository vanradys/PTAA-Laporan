import { useState, type ReactNode } from "react";
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
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureVisibility } from "@/hooks/use-feature-visibility";
import { useEditPermissions } from "@/hooks/use-edit-permissions";
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
  Download,
  Printer,
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
  ReferenceLine,
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
import { getJakartaDateString } from "@/lib/date";

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
  { value: "delivered", label: "Delivered" },
  { value: "project_invoiced", label: "Project Invoiced (PIC Finance)" },
  { value: "closed", label: "Project Sudah Dibayar (Closed)" },
];
const OVERALL_PO_STATUS_OPTS = PO_STATUS_OPTS.filter(
  (status) => status.value !== "closed",
);

const CUSTOMER_TRACKING_STAGES = [
  { key: "po_received", label: "PO Received" },
  { key: "engineering", label: "Engineering" },
  { key: "approval_drawing", label: "Approval Drawing" },
  { key: "material_order", label: "Material Order" },
  { key: "production", label: "Production" },
  { key: "quality_control", label: "Quality Control" },
  { key: "finishing_trial", label: "Finishing & Trial" },
  { key: "painting", label: "Painting" },
  { key: "delivered", label: "Delivered" },
  { key: "project_invoiced", label: "Project Invoiced (PIC Finance)" },
  { key: "closed", label: "Project Sudah Dibayar (Closed)" },
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
  delivered: 90,
  project_invoiced: 100,
  closed: 100,
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
  delivered: {
    label: "Delivered",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  project_invoiced: {
    label: "Project Invoiced (PIC Finance)",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  closed: {
    label: "Project Sudah Dibayar (Closed)",
    badge: "bg-slate-900 text-white border-slate-900",
    dot: "bg-white",
  },
  belum_mulai: {
    label: "PO Received",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    dot: "bg-gray-400",
  },
  selesai: {
    label: "Project Invoiced (PIC Finance)",
    badge: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  close: {
    label: "Project Sudah Dibayar (Closed)",
    badge: "bg-slate-900 text-white border-slate-900",
    dot: "bg-white",
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

function formatDeadlineLabel(sisaHari: number | null, _status: string): string {
  if (sisaHari === null) return "-";
  if (sisaHari < 0) return "-";
  if (sisaHari === 0) return "Hari ini!";
  return `${sisaHari} hari lagi`;
}

function getDeliveryStatus(po: PoItem) {
  if (po.deliveryStatus) {
    return {
      label: po.deliveryStatus,
      className: po.deliveryStatus.startsWith("Delay")
        ? "border-red-200 bg-red-100 text-red-700"
        : po.deliveryStatus === "On Time"
          ? "border-green-200 bg-green-100 text-green-700"
          : "border-gray-200 bg-gray-100 text-gray-700",
    };
  }
  const targetPengiriman = po.targetPengiriman ?? po.deadline;
  const aktualPengiriman = po.aktualPengiriman;
  if (!isDateOnly(targetPengiriman)) {
    return {
      label: "Tanggal Belum Valid",
      className: "border-gray-200 bg-gray-100 text-gray-700",
    };
  }

  if (aktualPengiriman && !isDateOnly(aktualPengiriman)) {
    return {
      label: "Tanggal Belum Valid",
      className: "border-gray-200 bg-gray-100 text-gray-700",
    };
  }

  const comparisonDate = aktualPengiriman ?? getJakartaDateString();
  if (comparisonDate > targetPengiriman) {
    const targetDate = new Date(`${targetPengiriman}T00:00:00.000Z`);
    const deliveryDate = new Date(`${comparisonDate}T00:00:00.000Z`);
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
  targetPengiriman?: string | null;
  aktualPengiriman?: string | null;
  deliveryStatus?: string;
  aktualPengirimanBelumDiisi?: boolean;
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
  projectIssueAction?: string | null;
  closedAt?: string | null;
  isEditLocked?: boolean;
  editLockNotice?: string | null;
  createdByUserId?: number | null;
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
  projectIssueAction: string;
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
  targetPenyelesaian: "Aktual Pengiriman",
  deadline: "Target Pengiriman",
  targetPengiriman: "Target Pengiriman",
  aktualPengiriman: "Aktual Pengiriman",
  picUserId: "PIC",
  picProject: "PIC Project",
  departmentId: "PIC Departemen",
  status: "Project Progress",
  progress: "Progress",
  hasPainting: "Painting",
  trackingStages: "Project Progress",
  trackingTimeline: "Timeline Customer",
  catatan: "Catatan",
  projectIssueAction: "Project Issue & Action",
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
  projectIssueAction: "",
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
  if (action === "note_created") return "menambah catatan PO";
  if (action === "note_updated") return "mengubah catatan PO";
  if (action === "note_deleted") return "menghapus catatan PO";
  return "mengubah PO";
}

const YEARLY_TREND_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const MONTHLY_PO_TARGET = 3_000_000_000;

function getNumberFromRecord(
  item: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const value = item[key];
    if (value !== null && value !== undefined && value !== "") {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) return numberValue;
    }
  }
  return fallback;
}

function getNominalAxisValue(value: number) {
  return Math.max(0, value) / 1_000_000_000;
}

function formatNominalAxisLabel(value: number) {
  return value > 0 ? `${value}M` : "";
}

function isFinishedPo(status: string) {
  return ["project_invoiced", "closed", "project_finished", "selesai", "close"].includes(status);
}

function isClosedPo(status: string) {
  return ["closed", "close"].includes(status);
}

function isClosedPoItem(po: Pick<PoItem, "status" | "closedAt">) {
  return isClosedPo(po.status) || Boolean(po.closedAt);
}

function isOpenPoItem(po: Pick<PoItem, "status" | "closedAt">) {
  return !isFinishedPo(po.status) && !po.closedAt;
}

function isDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeFlexibleSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

interface PoNote {
  id: number;
  poId: number;
  userId?: number | null;
  userName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
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
  const { canViewFeature } = useFeatureVisibility();
  const { canEdit } = useEditPermissions();

  const role = user?.role?.toLowerCase() ?? "";
  const email = user?.email?.toLowerCase() ?? "";
  const departmentName = user?.departmentName?.toLowerCase() ?? "";
  const departmentCode = user?.departmentCode?.toUpperCase() ?? "";
  const canViewProjectSchedule = canViewFeature("project_schedule", true);
  const baseCanManage =
    ["admin", "hr", "direktur", "director", "dir"].includes(role) ||
    ["AAF", "FIN", "MKT", "GA"].includes(departmentCode) ||
    departmentName.includes("finance") ||
    departmentName.includes("marketing") ||
    departmentName.includes("general affairs");
  const baseCanEditPoData = baseCanManage || role === "monitoring_dummy";
  const canCreatePo =
    baseCanManage && canViewProjectSchedule && canEdit("po_create", true);
  const canEditPoData =
    baseCanEditPoData && canViewProjectSchedule && canEdit("po_edit_data", true);
  const canDeletePo =
    baseCanManage && canViewProjectSchedule && canEdit("po_delete", true);
  const canClosePo =
    baseCanEditPoData && canViewProjectSchedule && canEdit("po_mark_complete", true);
  const canExportPo =
    canViewProjectSchedule &&
    canEdit("po_export", true) &&
    (["admin", "direktur", "director", "dir", "monitoring_dummy"].includes(role) ||
      email === "marketing@adiyasa.com" ||
      email === "finance@adiyasa.com" ||
      ["AAF", "FIN"].includes(departmentCode) ||
      departmentName.includes("finance"));
  const baseCanUpdateProjectProgress =
    baseCanEditPoData ||
    ["PUR", "ENG"].includes(departmentCode) ||
    departmentName.includes("purchasing") ||
    departmentName.includes("engineering");
  const canUpdateProjectProgress =
    baseCanUpdateProjectProgress &&
    canViewProjectSchedule &&
    canEdit("po_update_progress", true);
  const canManageCustomerTimeline =
    baseCanUpdateProjectProgress &&
    canViewProjectSchedule &&
    canEdit("po_edit_customer_timeline", true);
  const canAddPoNotes =
    Boolean(user) &&
    canViewProjectSchedule &&
    canEdit("po_add_notes", true);
  const canManagePoNotes =
    canViewProjectSchedule && canEdit("po_manage_notes", false);
  const canDeleteAnyPoNote =
    canViewProjectSchedule &&
    (canManagePoNotes ||
      ["admin", "direktur", "director", "dir", "monitoring_dummy", "monitoring", "monitor"].includes(role));
  const canSavePoChanges = canEditPoData || canUpdateProjectProgress || canManageCustomerTimeline;
  const canOpenPoEdit = canSavePoChanges || canAddPoNotes;
  const canViewPoNotes = Boolean(user) && canViewProjectSchedule;
  const hasFullPoAccess = ["admin", "direktur", "director", "dir"].includes(
    role,
  );

  const localCanViewPoAmount =
    hasFullPoAccess ||
    (!["monitoring_dummy", "monitoring", "monitor"].includes(role) &&
      !email.includes("monitor") &&
      ([
        "admin@adiyasa.com",
        "director@adiyasa.com",
        "marketing@adiyasa.com",
        "finance@adiyasa.com",
      ].includes(email) ||
        role === "finance" ||
        ["AAF", "FIN"].includes(departmentCode) ||
        departmentName.includes("finance")));

  const canViewPoActivity =
    canViewProjectSchedule &&
    (["admin", "direktur", "director", "dir", "monitoring_dummy"].includes(role) ||
      departmentCode === "GA" ||
      departmentName.includes("general affairs"));
  const canViewPoDetail = Boolean(user) && canViewProjectSchedule;
  const canDeleteComments =
    canViewProjectSchedule &&
    canEdit("project_comment_delete", ["admin", "direktur", "director", "dir"].includes(role));
  const canEditComments =
    canViewProjectSchedule && canEdit("project_comment_edit", role === "admin");

  const [filterMonth, setFilterMonth] = useState<string>(
    String(today.getMonth() + 1),
  );
  const [filterYear, setFilterYear] = useState<string>(
    String(today.getFullYear()),
  );
  const [filterStatus, setFilterStatus] = useState("semua");
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState("semua");
  const [filterDept, setFilterDept] = useState("semua");
  const [nominalSort, setNominalSort] = useState("semua");
  const [searchText, setSearchText] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [overallMonth, setOverallMonth] = useState("semua");
  const [overallYear, setOverallYear] = useState("semua");
  const [overallProgress, setOverallProgress] = useState("semua");
  const [overallDeliveryStatus, setOverallDeliveryStatus] = useState("semua");
  const [exportStartMonth, setExportStartMonth] = useState(
    String(today.getMonth() + 1),
  );
  const [exportEndMonth, setExportEndMonth] = useState(
    String(today.getMonth() + 1),
  );
  const [exportCustomer, setExportCustomer] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [viewingPo, setViewingPo] = useState<PoItem | null>(null);
  const [internalCommentDraft, setInternalCommentDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PoFormState>(EMPTY_FORM);
  const [deliveryInputMode, setDeliveryInputMode] = useState<DeliveryInputMode>("date");
  const [actualDeliveryInputMode, setActualDeliveryInputMode] =
    useState<DeliveryInputMode>("date");
  const [formLoading, setFormLoading] = useState(false);

  const poParams = {
    ...(!filterDateFrom && !filterDateTo
      ? { month: parseInt(filterMonth), year: parseInt(filterYear) }
      : {}),
    ...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
    ...(filterDateTo ? { dateTo: filterDateTo } : {}),
    ...(filterStatus !== "semua" ? { status: filterStatus } : {}),
    ...(filterDept !== "semua" ? { departmentId: parseInt(filterDept) } : {}),
    ...(nominalSort !== "semua" ? { nominalSort } : {}),
    ...(searchText.trim() ? { search: searchText.trim() } : {}),
  } as any;

  const { data: poList, isLoading: poLoading } = useListPo(poParams, {
    query: { queryKey: getListPoQueryKey(poParams) },
  });
  const allPoParams = { openOnly: "true" } as any;
  const { data: allPoList, isLoading: allPoLoading } = useListPo(allPoParams, {
    query: { queryKey: getListPoQueryKey(allPoParams) },
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
    hasFullPoAccess ||
    (!["monitoring_dummy", "monitoring", "monitor"].includes(role) &&
      !email.includes("monitor") &&
      (localCanViewPoAmount ||
        Boolean(
          (summary as { canViewPoListAmount?: boolean } | undefined)
            ?.canViewPoListAmount,
        ) ||
        Boolean(
          (yearlyTrend as { canViewPoListAmount?: boolean } | undefined)
            ?.canViewPoListAmount,
        )));
  const canViewPoTrendAmount = true;

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
  const { data: formPoNotes, refetch: refetchFormPoNotes } = useQuery({
    queryKey: ["po-notes", editingId],
    queryFn: () => apiRequest<PoNote[]>(`/api/po/${editingId}/notes`),
    enabled: Boolean(editingId && showForm && canViewPoNotes),
  });
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
  const posRaw = (Array.isArray(poList) ? poList : []) as PoItem[];
  const allPosRaw = (Array.isArray(allPoList) ? allPoList : []) as PoItem[];
  const editingPo = editingId
    ? [...posRaw, ...allPosRaw].find((po) => po.id === editingId)
    : undefined;
  const canEditPoNote = (note: PoNote) =>
    canManagePoNotes ||
    note.userId === user?.id ||
    editingPo?.createdByUserId === user?.id;
  const canDeletePoNote = (note: PoNote) =>
    canDeleteAnyPoNote ||
    note.userId === user?.id ||
    editingPo?.createdByUserId === user?.id;
  const matchesDeliveryFilter = (po: PoItem) => {
    if (filterDeliveryStatus === "semua") return true;
    if (filterDeliveryStatus === "delay")
      return String(po.deliveryStatus ?? "").startsWith("Delay");
    if (filterDeliveryStatus === "on_time")
      return po.deliveryStatus === "On Time";
    if (filterDeliveryStatus === "belum_diisi")
      return Boolean(po.aktualPengirimanBelumDiisi);
    return po.deliveryStatus === "Tanggal Belum Valid";
  };
  const matchesOverallFilters = (po: PoItem) => {
    const query = normalizeFlexibleSearch(searchText);
    if (
      query &&
      ![po.noPo, po.namaProject, po.customer]
        .map(normalizeFlexibleSearch)
        .some((value) => value.includes(query))
    )
      return false;
    if (overallYear !== "semua") {
      if (
        overallMonth !== "semua" &&
        !po.tanggalPoMasuk.startsWith(
          `${overallYear}-${overallMonth.padStart(2, "0")}`,
        )
      )
        return false;
      if (
        overallMonth === "semua" &&
        !po.tanggalPoMasuk.startsWith(`${overallYear}-`)
      )
        return false;
    } else if (overallMonth !== "semua") {
      const month = po.tanggalPoMasuk.slice(5, 7);
      if (month !== overallMonth.padStart(2, "0")) return false;
    }
    if (overallProgress !== "semua" && po.status !== overallProgress)
      return false;
    if (overallDeliveryStatus === "delay")
      return String(po.deliveryStatus ?? "").startsWith("Delay");
    if (overallDeliveryStatus === "on_time")
      return po.deliveryStatus === "On Time";
    if (overallDeliveryStatus === "belum_diisi")
      return Boolean(po.aktualPengirimanBelumDiisi);
    if (overallDeliveryStatus === "tanggal_tidak_valid")
      return po.deliveryStatus === "Tanggal Belum Valid";
    return true;
  };
  const sortByNominal = (items: PoItem[]) => {
    if (nominalSort !== "asc" && nominalSort !== "desc") return items;
    return [...items].sort((left, right) => {
      const difference = Number(left.poAmount ?? 0) - Number(right.poAmount ?? 0);
      return nominalSort === "asc" ? difference : -difference;
    });
  };
  const pos = sortByNominal(posRaw.filter(matchesDeliveryFilter));
  const allPos = sortByNominal(allPosRaw.filter(
    (po) =>
      !isClosedPo(po.status) &&
      matchesOverallFilters(po),
  ));
  const rawYearlyTrendItems = Array.isArray(
    (yearlyTrend as { items?: unknown[] } | undefined)?.items,
  )
    ? ((yearlyTrend as { items: unknown[] }).items as Record<string, unknown>[])
    : [];
  const yearlyTrendItems = (
    rawYearlyTrendItems.length > 0
      ? rawYearlyTrendItems
      : YEARLY_TREND_MONTHS.map((month, index) => ({
          month,
          monthNumber: index + 1,
          totalPo: 0,
          totalAmount: 0,
          targetAmount: MONTHLY_PO_TARGET,
        }))
  ).map((item, index) => {
    const totalAmountRaw = getNumberFromRecord(
      item,
      ["totalAmount", "total_amount", "totalNominal", "total_nominal", "nominal"],
      0,
    );
    const targetAmountRaw = getNumberFromRecord(
      item,
      ["targetAmount", "target_amount", "monthlyTarget", "monthly_target"],
      MONTHLY_PO_TARGET,
    );

    return {
      ...item,
      month: String(item.month ?? YEARLY_TREND_MONTHS[index] ?? index + 1),
      totalPo: getNumberFromRecord(item, ["totalPo", "total_po", "count"], 0),
      totalAmountRaw,
      totalAmountAxis: getNominalAxisValue(totalAmountRaw),
      targetAmountRaw,
      targetAmountAxis: getNominalAxisValue(targetAmountRaw),
    };
  });
  const poCountCeil = 35;
  const poCountTicks = [0, 7, 14, 21, 28, 35];
  const nominalAxisCeil = Math.max(
    5,
    Math.ceil(
      Math.max(
        ...yearlyTrendItems.map((item) => item.totalAmountAxis),
        getNominalAxisValue(MONTHLY_PO_TARGET),
      ),
    ),
  );
  const nominalAxisTicks = Array.from(
    { length: nominalAxisCeil },
    (_, index) => index + 1,
  );
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
  const emps = (Array.isArray(employees) ? employees : []) as {
    id: number;
    name: string;
    email?: string;
    departmentId?: number | null;
  }[];
  const picEmployees = emps.filter((employee) =>
    ["marketing@adiyasa.com", "engineering1@adiyasa.com", "engineering2@adiyasa.com"]
      .includes(String(employee.email ?? "").toLowerCase()),
  );
  const getPicEmployeeLabel = (employee: typeof picEmployees[number]) => {
    const employeeEmail = String(employee.email ?? "").toLowerCase();
    if (employeeEmail === "marketing@adiyasa.com") return "Admin Marketing 1";
    if (employeeEmail === "engineering1@adiyasa.com") return "Engineering 1";
    if (employeeEmail === "engineering2@adiyasa.com") return "Engineering 2";
    return employee.name;
  };
  const normalizeCustomerName = (value: string) =>
    value.trim().replace(/^PT\s*\.\s*/i, "PT ");

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
    setActualDeliveryInputMode("date");
    setForm({
      ...EMPTY_FORM,
      tanggalPoMasuk: getJakartaDateString(),
    });
    setShowForm(true);
  };

  const openEdit = (po: PoItem) => {
    setEditingId(po.id);
    const targetValue = po.targetPengiriman ?? po.deadline;
    setDeliveryInputMode(isDateOnly(targetValue) ? "date" : "text");
    setActualDeliveryInputMode(
      !po.aktualPengiriman || isDateOnly(po.aktualPengiriman) ? "date" : "text",
    );
    setForm({
      noPo: po.noPo,
      namaProject: po.namaProject,
      customer: po.customer ?? "",
      qty: po.qty ?? "",
      poAmount: po.poAmount ? String(po.poAmount) : "",
      tanggalPoMasuk: po.tanggalPoMasuk,
      targetPenyelesaian: po.aktualPengiriman ?? "",
      deadline: targetValue,
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
      catatan: "",
      projectIssueAction: po.projectIssueAction ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDeliveryInputMode("date");
    setActualDeliveryInputMode("date");
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
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
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

  const handleEditCustomerComment = async (comment: CustomerTrackingComment) => {
    if (!comment.poId || !canEditComments) return;
    const nextComment = window.prompt("Edit customer note", comment.comment)?.trim();
    if (!nextComment || nextComment === comment.comment) return;

    await apiRequest(
      `/api/customer-tracking/${comment.poId}/comments/${comment.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: nextComment }),
      },
    );
    queryClient.invalidateQueries({ queryKey: ["customer-tracking-comments"] });
    queryClient.invalidateQueries({
      queryKey: ["customer-tracking-comments", comment.poId],
    });
    toast({ title: "Berhasil", description: "Customer note diperbarui" });
  };

  const handleEditInternalComment = async (comment: PoInternalComment) => {
    if (!comment.poId || !canEditComments) return;
    const nextComment = window.prompt("Edit komentar internal", comment.comment)?.trim();
    if (!nextComment || nextComment === comment.comment) return;

    await apiRequest(`/api/po/${comment.poId}/internal-comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: nextComment }),
    });
    queryClient.invalidateQueries({ queryKey: ["po-internal-comments"] });
    queryClient.invalidateQueries({
      queryKey: ["po-internal-comments", comment.poId],
    });
    toast({ title: "Berhasil", description: "Komentar internal diperbarui" });
  };

  const handleSave = async () => {
    if (editingId && !canSavePoChanges) return;

    if (canEditPoData && (
      !form.noPo.trim() ||
      !form.namaProject.trim() ||
      !form.customer.trim() ||
      !form.tanggalPoMasuk ||
      !form.deadline ||
      !form.picUserId
    )) {
      toast({
        title: "Validasi Gagal",
        description:
          "No PO, nama project, customer, Tanggal Masuk PO, PIC Departemen, dan Target Pengiriman wajib diisi",
        variant: "destructive",
      });
      return;
    }

    const normalizedDeadline = form.deadline.trim();
    if (canEditPoData && !normalizedDeadline) {
      toast({
        title: "Validasi Gagal",
        description: "Target Pengiriman wajib diisi",
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
      const shouldRefreshNotifications = !editingId && Boolean(form.catatan.trim());
      const timelinePayload = form.trackingTimeline
        .map((item) => ({
          date: item.date.trim(),
          description: item.description.trim(),
        }))
        .filter((item) => item.date || item.description);
      const payload: Record<string, unknown> = {};
      if (!editingId || canEditPoData) {
        Object.assign(payload, {
          noPo: form.noPo,
          namaProject: form.namaProject,
          customer: normalizeCustomerName(form.customer),
          qty: form.qty,
          ...(canViewPoAmount
            ? { poAmount: form.poAmount ? Number(form.poAmount) : null }
            : {}),
          tanggalPoMasuk: form.tanggalPoMasuk,
          targetPengiriman: normalizedDeadline,
          aktualPengiriman: form.targetPenyelesaian,
          deadline: normalizedDeadline,
          picUserId: form.picUserId ? parseInt(form.picUserId) : null,
          picProject: form.picProject,
        });
      }
      if (!editingId || canUpdateProjectProgress) {
        Object.assign(payload, {
          status: form.status,
          hasPainting: form.hasPainting,
          trackingStages: form.trackingStages,
        });
      }
      if (!editingId || canManageCustomerTimeline) {
        payload.trackingTimeline = timelinePayload;
      }
      if (!editingId || canEditPoData || canUpdateProjectProgress) {
        payload.projectIssueAction = form.projectIssueAction.trim() || null;
      }
      if (!editingId && form.catatan.trim()) {
        payload.catatan = form.catatan.trim();
      }
      if (editingId) {
        await updatePo.mutateAsync({ id: editingId, data: payload as any });
        toast({ title: "Berhasil", description: "PO berhasil diperbarui" });
      } else {
        await createPo.mutateAsync({
          data: { ...payload, targetPengiriman: normalizedDeadline, deadline: normalizedDeadline } as any,
        });
        toast({ title: "Berhasil", description: "PO berhasil ditambahkan" });
      }
      closeForm();
      invalidate();
      if (shouldRefreshNotifications) {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
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
    if (!confirm(`Tandai PO "${po.noPo} - ${po.namaProject}" sebagai Project Sudah Dibayar (Closed)?`))
      return;
    try {
      await closePo.mutateAsync({ id: po.id });
      toast({ title: "Berhasil", description: "PO ditandai sebagai Project Sudah Dibayar (Closed)" });
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

  const exportRows = (items: PoItem[]) =>
    items.map((po) => ({
      "No PO": po.noPo,
      Customer: po.customer ?? "",
      "Nama Project": po.namaProject,
      PIC: po.picProject ?? po.picName ?? "",
      "Tanggal Masuk PO": po.tanggalPoMasuk,
      "Target Pengiriman": po.targetPengiriman ?? po.deadline,
      "Aktual Pengiriman": po.aktualPengiriman ?? "",
      Status: po.deliveryStatus ?? "",
      "Project Progress": po.statusLabel ?? po.status,
      Progress: `${po.progress}%`,
      ...(canViewPoAmount ? { "Nominal PO": po.poAmount ?? 0 } : {}),
    }));

  const loadExportRows = async () => {
    const params = new URLSearchParams();
    if (filterDateFrom || filterDateTo) {
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
    } else {
      const startMonth = Math.min(
        Number(exportStartMonth),
        Number(exportEndMonth),
      );
      const endMonth = Math.max(
        Number(exportStartMonth),
        Number(exportEndMonth),
      );
      params.set(
        "dateFrom",
        `${filterYear}-${String(startMonth).padStart(2, "0")}-01`,
      );
      params.set(
        "dateTo",
        `${filterYear}-${String(endMonth).padStart(2, "0")}-${String(
          new Date(Date.UTC(Number(filterYear), endMonth, 0)).getUTCDate(),
        ).padStart(2, "0")}`,
      );
    }
    if (exportCustomer.trim()) params.set("customer", exportCustomer.trim());
    if (filterStatus !== "semua") params.set("status", filterStatus);
    if (filterDept !== "semua") params.set("departmentId", filterDept);

    const items = await apiRequest<PoItem[]>(`/api/po?${params.toString()}`);
    return exportRows(Array.isArray(items) ? items : []);
  };

  const handleSendPoNote = async () => {
    if (!editingId || !canAddPoNotes || !form.catatan.trim()) return;
    try {
      await apiRequest(`/api/po/${editingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: form.catatan.trim() }),
      });
      setForm((current) => ({ ...current, catatan: "" }));
      await refetchFormPoNotes();
      invalidate();
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      toast({ title: "Berhasil", description: "Catatan PO ditambahkan" });
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Catatan gagal dikirim",
        variant: "destructive",
      });
    }
  };

  const handleEditPoNote = async (note: PoNote) => {
    if (!canEditPoNote(note)) return;
    const nextNote = window.prompt("Edit catatan PO", note.note)?.trim();
    if (!editingId || !nextNote || nextNote === note.note) return;
    await apiRequest(`/api/po/${editingId}/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: nextNote }),
    });
    await refetchFormPoNotes();
    invalidate();
  };

  const handleDeletePoNote = async (note: PoNote) => {
    if (!canDeletePoNote(note)) return;
    if (!editingId || !window.confirm("Hapus catatan PO ini?")) return;
    await apiRequest(`/api/po/${editingId}/notes/${note.id}`, { method: "DELETE" });
    await refetchFormPoNotes();
    invalidate();
  };

  const handleExportExcel = async () => {
    setExportLoading(true);
    const rows = await loadExportRows().catch((error) => {
      toast({
        title: "Export gagal",
        description: error instanceof Error ? error.message : "Data PO gagal dimuat",
        variant: "destructive",
      });
      return [];
    });
    setExportLoading(false);
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar PO");
    XLSX.writeFile(workbook, `export-po-${filterYear}.xlsx`);
  };

  const handleExportPdf = async () => {
    setExportLoading(true);
    const rows = await loadExportRows().catch((error) => {
      toast({
        title: "Export gagal",
        description: error instanceof Error ? error.message : "Data PO gagal dimuat",
        variant: "destructive",
      });
      return [];
    });
    setExportLoading(false);
    if (rows.length === 0) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const headers = Object.keys(rows[0]);
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    document.setFontSize(14);
    document.text("Daftar PO / Project", 14, 14);
    autoTable(document, {
      startY: 19,
      head: [headers],
      body: rows.map((row) =>
        headers.map((header) =>
          String((row as Record<string, unknown>)[header] ?? ""),
        ),
      ),
      styles: { fontSize: 6, cellPadding: 1.5 },
      headStyles: { fillColor: [6, 37, 141] },
    });
    document.save(`export-po-${filterYear}.pdf`);
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
          label: "Hampir Target Pengiriman",
          value: (summary as { poHampirDeadline: number }).poHampirDeadline,
          icon: ChevronDown,
          color: "text-orange-600",
          bg: "bg-orange-50",
        },
        {
          label: "Pencapaian Target",
          value: `${Number.isFinite(targetPercentage) ? targetPercentage : 0}%`,
          description: `${formatRupiahCompact(Number((summary as { totalNominal?: number }).totalNominal ?? 0))} / ${formatRupiahCompact(Number((summary as { monthlyTarget?: number }).monthlyTarget ?? MONTHLY_PO_TARGET))}`,
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

  const renderPoSlider = (
    items: PoItem[],
    options: {
      emptyText: string;
      showCreateButton?: boolean;
      allowDelete?: boolean;
    },
  ) => (
    <>
      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{options.emptyText}</p>
          {options.showCreateButton && canCreatePo && (
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
        <div className="overflow-x-auto px-5 pb-5">
          <div className="flex snap-x snap-mandatory gap-4">
            {items.map((po) => {
              const ss = STATUS_STYLES[po.status] ?? STATUS_STYLES.belum_mulai;
              const deliveryStatus = getDeliveryStatus(po);
              const deadlineStyle = getDeadlineStyle(po.sisaHari, po.status);
              const deadlineLabel = formatDeadlineLabel(po.sisaHari, po.status);

              return (
                <article
                  key={po.id}
                  className="flex w-[min(88vw,360px)] shrink-0 snap-start flex-col rounded-lg border border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-primary">
                        {po.noPo}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                        {po.namaProject}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {po.customer ?? "-"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${deliveryStatus.className}`}
                    >
                      {deliveryStatus.label}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <DetailInfo label="Qty" value={po.qty ?? "-"} />
                    <DetailInfo
                      label="PIC"
                      value={po.picProject ?? po.picName ?? "-"}
                    />
                    <DetailInfo
                      label="Tanggal PO"
                      value={isoDateToDisplay(po.tanggalPoMasuk)}
                    />
                    <DetailInfo
                      label="Target"
                      value={isoDateToDisplay(po.targetPengiriman ?? po.deadline)}
                    />
                    <DetailInfo
                      label="Aktual"
                      value={
                        po.aktualPengiriman
                          ? isoDateToDisplay(po.aktualPengiriman)
                          : "Belum Diisi"
                      }
                    />
                    <DetailInfo
                      label="Sisa Hari"
                      value={<span className={deadlineStyle}>{deadlineLabel}</span>}
                    />
                    {canViewPoAmount && (
                      <div className="col-span-2">
                        <DetailInfo
                          label="Nominal PO"
                          value={po.poAmount ? formatRupiah(po.poAmount) : "-"}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <span
                      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ss.badge}`}
                    >
                      <span
                        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${ss.dot}`}
                      />
                      <span className="truncate">{getStatusLabel(po, ss.label)}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            isFinishedPo(po.status) ? "bg-green-500" : "bg-primary"
                          }`}
                          style={{ width: `${clampProgress(po.progress)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs font-semibold">
                        {po.progress}%
                      </span>
                    </div>
                    {po.departmentName && (
                      <p className="text-xs text-muted-foreground">
                        {po.departmentName}
                      </p>
                    )}
                    {po.isEditLocked && role !== "admin" && (
                      <p className="text-xs text-red-600">
                        {getFinishedPoNotice(po)}
                      </p>
                    )}
                  </div>

                  {canViewPoDetail && (
                    <div className="mt-auto flex items-center justify-end gap-1 pt-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        title="Lihat Detail"
                        onClick={() => setViewingPo(po)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canOpenPoEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={
                              po.isEditLocked
                                ? (getFinishedPoNotice(po) ?? "PO terkunci")
                                : "Edit"
                            }
                            disabled={Boolean(po.isEditLocked && role !== "admin")}
                            onClick={() => openEdit(po)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canClosePo && po.status === "project_invoiced" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                              title="Progress Selesai"
                              type="button"
                              disabled={closePo.isPending}
                              onClick={() => handleClose(po)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {options.allowDelete && canDeletePo && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title={
                                po.isEditLocked
                                  ? (getFinishedPoNotice(po) ?? "PO terkunci")
                                  : "Hapus"
                              }
                              disabled={Boolean(po.isEditLocked && role !== "admin")}
                              onClick={() => handleDelete(po)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

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
              Pantau target dan aktual pengiriman PO/Project secara real-time
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreatePo && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Tambah PO
              </Button>
            )}
          </div>
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


        {yearlyTrendItems.length > 0 && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Grafik Monitoring PO {filterYear}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {canViewPoTrendAmount
                  ? "Bar menunjukkan jumlah PO per bulan, line menunjukkan total nominal PO dan target tetap 3M."
                  : "Bar menunjukkan jumlah PO per bulan, garis merah menunjukkan target tetap 3M."}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-4">
              <div className="h-80 min-w-[620px] sm:min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={yearlyTrendItems}
                    margin={{ top: 10, right: 64, left: 24, bottom: 0 }}
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
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12 }}
                      width={84}
                      domain={[0, nominalAxisCeil]}
                      ticks={nominalAxisTicks}
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
                    <Tooltip
                      formatter={(value, name, item) => {
                        if (name === "Total Nominal PO" || name === "Target 3M") {
                          const payload = item.payload as {
                            totalAmountRaw?: number;
                            targetAmountRaw?: number;
                          };
                          return [
                            formatRupiah(Number(name === "Target 3M" ? payload.targetAmountRaw ?? 0 : payload.totalAmountRaw ?? 0)),
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
                    <ReferenceLine
                      yAxisId="right"
                      y={getNominalAxisValue(MONTHLY_PO_TARGET)}
                      stroke="#ef4444"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                      label={{
                        value: "Target 3M",
                        position: "right",
                        fill: "#ef4444",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                    {canViewPoTrendAmount && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="totalAmountAxis"
                        name="Total Nominal PO"
                        stroke="#f97316"
                        strokeWidth={2}
                        connectNulls
                        dot={{ r: 3, fill: "#ffffff", stroke: "#f97316", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
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
                <Label className="text-xs">Dari Tanggal</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={filterDateFrom} onChange={(event) => setFilterDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sampai Tanggal</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={filterDateTo} onChange={(event) => setFilterDateTo(event.target.value)} />
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
                <Label className="text-xs">Status Pengiriman</Label>
                <Select
                  value={filterDeliveryStatus}
                  onValueChange={setFilterDeliveryStatus}
                >
                  <SelectTrigger className="h-8 w-44 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua">Semua Status</SelectItem>
                    <SelectItem value="on_time">On Time</SelectItem>
                    <SelectItem value="delay">Delay</SelectItem>
                    <SelectItem value="belum_diisi">
                      Aktual Belum Diisi
                    </SelectItem>
                    <SelectItem value="tanggal_tidak_valid">
                      Tanggal Belum Valid
                    </SelectItem>
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
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Filter Export
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Custom tanggal di atas diprioritaskan jika diisi.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dari Bulan</Label>
                <Select
                  value={exportStartMonth}
                  onValueChange={setExportStartMonth}
                >
                  <SelectTrigger className="h-8 w-32 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.v} value={month.v}>
                        {month.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canViewPoAmount && (
                <div className="space-y-1">
                  <Label className="text-xs">Urutkan Nominal</Label>
                  <Select value={nominalSort} onValueChange={setNominalSort}>
                    <SelectTrigger className="h-8 w-44 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semua">Tanpa Urutan</SelectItem>
                      <SelectItem value="desc">Nominal Terbesar</SelectItem>
                      <SelectItem value="asc">Nominal Terkecil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Sampai Bulan</Label>
                <Select
                  value={exportEndMonth}
                  onValueChange={setExportEndMonth}
                >
                  <SelectTrigger className="h-8 w-32 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.v} value={month.v}>
                        {month.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full min-w-48 space-y-1 sm:w-64">
                <Label className="text-xs">Nama Customer untuk Export</Label>
                <Input
                  value={exportCustomer}
                  onChange={(event) => setExportCustomer(event.target.value)}
                  placeholder="Semua customer"
                  className="h-8 text-sm"
                />
              </div>
              {canExportPo && (
                <div className="flex items-end gap-2">
                  <Button variant="outline" onClick={handleExportExcel} disabled={exportLoading}>
                    <Download className="mr-2 h-4 w-4" />
                    Excel
                  </Button>
                  <Button variant="outline" onClick={handleExportPdf} disabled={exportLoading}>
                    <Printer className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                </div>
              )}
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
            <p className="mt-1 text-xs text-muted-foreground">
              Menampilkan PO/Project sesuai filter periode aktif.
            </p>
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
                {canCreatePo && (
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
              <>
                {renderPoSlider(pos, {
                  emptyText: "Tidak ada data PO untuk filter ini",
                  showCreateButton: true,
                })}
                <div className="hidden">
                <table className="po-fit-table w-full text-xs">
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
                        Tanggal Masuk PO
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Target Pengiriman
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Aktual Pengiriman
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
                            {po.isEditLocked && role !== "admin" && (
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
                              {isoDateToDisplay(po.targetPengiriman ?? po.deadline)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-foreground">
                              {po.aktualPengiriman ? isoDateToDisplay(po.aktualPengiriman) : "Belum Diisi"}
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
                                {canOpenPoEdit && (
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
                                  disabled={Boolean(po.isEditLocked && role !== "admin")}
                                  onClick={() => openEdit(po)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {canClosePo && po.status === "project_invoiced" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      title="Progress Selesai"
                                      type="button"
                                      disabled={closePo.isPending}
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
              </>
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
            <p className="mt-1 text-xs text-muted-foreground">
              Menampilkan seluruh PO/Project yang belum berstatus Project Sudah Dibayar (Closed).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Bulan</Label>
                <Select value={overallMonth} onValueChange={setOverallMonth}>
                  <SelectTrigger className="h-8 w-32 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua">Semua Bulan</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month.v} value={month.v}>
                        {month.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tahun</Label>
                <Select value={overallYear} onValueChange={setOverallYear}>
                  <SelectTrigger className="h-8 w-24 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua">Semua Tahun</SelectItem>
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project Progress</Label>
                <Select
                  value={overallProgress}
                  onValueChange={setOverallProgress}
                >
                  <SelectTrigger className="h-8 w-48 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERALL_PO_STATUS_OPTS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={overallDeliveryStatus}
                  onValueChange={setOverallDeliveryStatus}
                >
                  <SelectTrigger className="h-8 w-44 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua">Semua Status</SelectItem>
                    <SelectItem value="on_time">On Time</SelectItem>
                    <SelectItem value="delay">Delay</SelectItem>
                    <SelectItem value="belum_diisi">
                      Aktual Belum Diisi
                    </SelectItem>
                    <SelectItem value="tanggal_tidak_valid">
                      Tanggal Belum Valid
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <>
                {renderPoSlider(allPos, {
                  emptyText: "Belum ada data PO / Project",
                  allowDelete: true,
                })}
                <div className="hidden">
                <table className="po-fit-table w-full text-xs">
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
                        Tanggal Masuk PO
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Target Pengiriman
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Aktual Pengiriman
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
                            {po.isEditLocked && role !== "admin" && (
                              <p className="text-xs text-red-600 mt-1">
                                {getFinishedPoNotice(po)}
                              </p>
                            )}
                          </td>
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
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {po.picProject ?? po.picName ?? "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isoDateToDisplay(po.tanggalPoMasuk)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isoDateToDisplay(po.targetPengiriman ?? po.deadline)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {po.aktualPengiriman ? isoDateToDisplay(po.aktualPengiriman) : "Belum Diisi"}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${deliveryStatus.className}`}>
                              {deliveryStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {formatDeadlineLabel(po.sisaHari, po.status)}
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
                                {canOpenPoEdit && (
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
                                  disabled={Boolean(po.isEditLocked && role !== "admin")}
                                  onClick={() => openEdit(po)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {canClosePo && po.status === "project_invoiced" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      title="Progress Selesai"
                                      type="button"
                                      disabled={closePo.isPending}
                                      onClick={() => handleClose(po)}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                {canDeletePo && (
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
                                  disabled={Boolean(po.isEditLocked && role !== "admin")}
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
              </>
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
                      label="Target Pengiriman"
                      value={isoDateToDisplay(viewingPo.targetPengiriman ?? viewingPo.deadline)}
                    />
                    <DetailInfo
                      label="Aktual Pengiriman"
                      value={viewingPo.aktualPengiriman ? isoDateToDisplay(viewingPo.aktualPengiriman) : "Belum Diisi"}
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
                      {viewingPo.projectIssueAction?.trim() ||
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
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Komentar Internal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      value={internalCommentDraft}
                      onChange={(event) =>
                        setInternalCommentDraft(event.target.value)
                      }
                      placeholder="Tulis komentar internal..."
                      className="min-h-20 resize-none text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSendInternalComment}
                        disabled={!internalCommentDraft.trim()}
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Kirim Komentar
                      </Button>
                    </div>
                  </div>

                  {internalCommentsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : poInternalComments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
                      Belum ada komentar internal.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                      {poInternalComments.map((comment) => (
                        <div
                          key={comment.id}
                          className="rounded-lg border border-border bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {comment.userName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCommentDateTime(comment.createdAt)}
                                {comment.userDepartment
                                  ? ` · ${comment.userDepartment}`
                                  : ""}
                              </p>
                            </div>
                            {(canEditComments || canDeleteComments) && (
                              <div className="flex shrink-0 items-center gap-1">
                                {canEditComments && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Edit komentar"
                                    onClick={() =>
                                      handleEditInternalComment(comment)
                                    }
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canDeleteComments && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    title="Hapus komentar"
                                    onClick={() =>
                                      handleDeleteInternalComment(comment)
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                            {comment.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
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
                    onBlur={() =>
                      setForm((current) => ({
                        ...current,
                        customer: normalizeCustomerName(current.customer),
                      }))
                    }
                    placeholder="Nama customer..."
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    Gunakan format PT tanpa titik. Contoh: PT Sandmaster Asia
                  </p>
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
                    value={form.picUserId || NONE_VALUE}
                    disabled={!canEditPoData}
                    onValueChange={(v) =>
                      setForm((f) => {
                        const picUserId = v === NONE_VALUE ? "" : v;
                        const selected = picEmployees.find((employee) => String(employee.id) === picUserId);
                        return {
                          ...f,
                          picUserId,
                          departmentId: selected?.departmentId ? String(selected.departmentId) : "",
                        };
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pilih departemen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Pilih PIC Departemen</SelectItem>
                      {picEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {getPicEmployeeLabel(employee)}
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
                    Target Pengiriman <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
                    <Select
                      value={deliveryInputMode}
                      disabled={!canEditPoData}
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
                      disabled={!canEditPoData}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, deadline: e.target.value }))
                      }
                      placeholder={
                        deliveryInputMode === "date"
                          ? undefined
                          : "30D After DP / Menunggu konfirmasi customer"
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Data dari tanggal yang ada di PO / permintaan customer.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Aktual Pengiriman</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
                    <Select
                      value={actualDeliveryInputMode}
                      disabled={!canEditPoData}
                      onValueChange={(value) => {
                        const mode = value as DeliveryInputMode;
                        setActualDeliveryInputMode(mode);
                        setForm((current) => ({
                          ...current,
                          targetPenyelesaian:
                            mode === "date" &&
                            !isDateOnly(current.targetPenyelesaian)
                              ? ""
                              : current.targetPenyelesaian,
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
                      type={actualDeliveryInputMode === "date" ? "date" : "text"}
                      value={form.targetPenyelesaian}
                      disabled={!canEditPoData}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          targetPenyelesaian: e.target.value,
                        }))
                      }
                      placeholder={
                        actualDeliveryInputMode === "date"
                          ? undefined
                          : "Menunggu konfirmasi customer"
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Data dari tanggal aktual barang telah dikirim ke customer.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Project Progress</Label>
                  <Select
                    value={form.status}
                    disabled={!canUpdateProjectProgress}
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
                  disabled={!canUpdateProjectProgress}
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
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Project Issue &amp; Action
                </Label>
                <Textarea
                  value={form.projectIssueAction}
                  disabled={
                    Boolean(editingId) &&
                    !canEditPoData &&
                    !canUpdateProjectProgress
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      projectIssueAction: event.target.value,
                    }))
                  }
                  placeholder="Tulis kendala project dan tindakan yang dilakukan..."
                  rows={3}
                  className="resize-none text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Informasi internal dan tidak ditampilkan kepada customer.
                </p>
              </div>
              {canManageCustomerTimeline && (
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
                    disabled={!canManageCustomerTimeline}
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
                          disabled={!canManageCustomerTimeline}
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
                          disabled={!canManageCustomerTimeline}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => removeTrackingTimelineItem(index)}
                          disabled={!canManageCustomerTimeline}
                          title="Hapus timeline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
              {canViewPoNotes && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan</Label>
                {editingId && Array.isArray(formPoNotes) && formPoNotes.length > 0 && (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border bg-slate-50 p-2">
                    {formPoNotes.map((note) => (
                      <div key={note.id} className="rounded-md bg-white p-2 text-xs shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="whitespace-pre-wrap text-slate-700">{note.note}</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {note.userName} • {new Date(note.createdAt).toLocaleString("id-ID")}
                            </p>
                          </div>
                          {(canEditPoNote(note) || canDeletePoNote(note)) && (
                            <div className="flex">
                              {canEditPoNote(note) && (
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditPoNote(note)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              {canDeletePoNote(note) && (
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-600" onClick={() => handleDeletePoNote(note)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  value={form.catatan}
                  disabled={!canAddPoNotes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, catatan: e.target.value }))
                  }
                  placeholder="Tulis catatan internal baru..."
                  rows={2}
                  className="resize-none text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {editingId
                      ? "Catatan hanya dapat dilihat internal."
                      : "Catatan pertama akan dikirim saat PO dibuat."}
                  </p>
                  {editingId && (
                    <Button type="button" size="sm" variant="outline" onClick={handleSendPoNote} disabled={!canAddPoNotes || !form.catatan.trim()}>
                      Kirim Catatan
                    </Button>
                  )}
                </div>
              </div>
              )}
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 rounded-b-xl border-t border-border bg-background px-4 py-4 sm:px-6">
              <Button
                variant="outline"
                onClick={closeForm}
                disabled={formLoading}
              >
                Batal
              </Button>
              <Button onClick={handleSave} disabled={formLoading || (Boolean(editingId) && !canSavePoChanges)}>
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

function DetailInfo({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
