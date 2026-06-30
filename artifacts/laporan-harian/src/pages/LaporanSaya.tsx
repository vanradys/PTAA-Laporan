import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetTodayReport, useCreateReport, useUpdateReport, useSubmitReport,
  useCreateTask, useUpdateTask, useDeleteTask, useGetYesterdayTasks,
  useListEmployees,
  getGetTodayReportQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Trash2, Copy, Send, Save, Loader2, FileText,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Clock, CalendarDays, UserPlus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useEditPermissions } from "@/hooks/use-edit-permissions";
import Layout from "@/components/Layout";
import { formatIndonesianDate, formatJakartaDateLong, getJakartaDateString, isWeekendDate } from "@/lib/date";
import { apiRequest } from "@/lib/apiRequest";

const TASK_STATUSES = [
  { value: "belum_mulai", label: "Belum Mulai", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "menerima_permintaan", label: "Menerima Permintaan (Inquiry)", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "input_data_proses", label: "Input Data/Proses", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "review_approval", label: "Review/Approval", color: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-700 border-green-200" },
];

const TASK_PROGRESS_BY_STATUS: Record<string, number> = {
  belum_mulai: 0,
  menerima_permintaan: 25,
  inquiry: 25,
  input_data_proses: 50,
  proses: 50,
  review_approval: 75,
  delivered: 100,
  selesai: 100,
};

function getTaskProgress(status: string) {
  return TASK_PROGRESS_BY_STATUS[status] ?? 0;
}

const REPORT_STATUSES = [
  { value: "draf", label: "Draf", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "dikirim", label: "Sudah Dikirim", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "direview", label: "Direview", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "perlu_revisi", label: "Perlu Revisi", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function normalizeCompletionInputType(value: unknown): "date" | "text" | "" {
  return value === "date" || value === "text" ? value : "";
}

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

function TaskCompletionInput({
  inputType,
  value,
  disabled,
  onCommit,
}: {
  inputType?: "date" | "text" | "" | null;
  value: string;
  disabled?: boolean;
  onCommit: (inputType: "date" | "text", value: string) => void;
}) {
  const [mode, setMode] = useState<"date" | "text">(inputType || "date");
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setMode(inputType || "date");
    setDraft(value);
  }, [inputType, value]);

  const changeMode = (nextMode: "date" | "text") => {
    const nextValue = nextMode === "date" && !isDateOnly(draft) ? "" : draft;
    setMode(nextMode);
    setDraft(nextValue);
    onCommit(nextMode, nextValue.trim());
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={mode}
        disabled={disabled}
        onValueChange={(nextMode) => changeMode(nextMode as "date" | "text")}
      >
        <SelectTrigger className="h-8 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Pilih Tanggal</SelectItem>
          <SelectItem value="text">Input Text Manual</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type={mode === "date" ? "date" : "text"}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(mode, draft.trim())}
        placeholder={mode === "date" ? undefined : "Menunggu customer / Tentative"}
        className="h-8 min-w-40 flex-1 text-sm"
      />
    </div>
  );
}

interface TaskForm {
  title: string;
  project: string;
  deadline: string;
  completionInputType: "date" | "text" | "";
  completionValue: string;
  progress: number;
  status: string;
  notes: string;
}

interface NewTask extends TaskForm {
  id: string;
  carryForwardSourceTaskId?: number | null;
}

interface ExistingTask {
  id: number;
  reportId: number;
  title: string;
  project: string | null;
  deadline: string | null;
  completionInputType?: "date" | "text" | null;
  completionValue?: string | null;
  progress: number;
  status: string;
  notes: string | null;
  editCount: number;
  remainingActions: number;
  isLocked: boolean;
  isDelay: boolean;
  carryForwardSourceTaskId?: number | null;
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

interface PreviousReportTasksData {
  tasks: ExistingTask[];
  sourceReportId: number | null;
  sourceReportDate: string | null;
  requestedYesterdayDate: string;
  missingYesterdayDate: string | null;
  yesterdayReportMissing: boolean;
}

interface EmployeeOption {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId?: number | null;
  departmentName?: string | null;
}

interface AssignedTaskNotification {
  id: number;
  assigneeUserId: number;
  assignedByUserId?: number | null;
  assignedByName: string;
  assignedByRole: string;
  assignedByDepartment?: string | null;
  assignedToName?: string | null;
  assignedToDepartment?: string | null;
  title: string;
  project?: string | null;
  notes?: string | null;
  status: string;
  responseNote?: string | null;
  createdTaskId?: number | null;
  respondedAt?: string | null;
  createdAt: string;
}

interface AssignmentHistoryItem {
  id: number;
  direction: "received" | "given";
  department: string;
  assignedByUserId?: number | null;
  assignedByName: string;
  assignedByRole: string;
  assignedByDepartment?: string | null;
  assigneeUserId: number;
  assignedToName?: string | null;
  assignedToDepartment?: string | null;
  title: string;
  project?: string | null;
  notes?: string | null;
  status: "pending" | "accepted" | "rejected";
  responseNote?: string | null;
  createdTaskId?: number | null;
  assignedAt: string;
  respondedAt?: string | null;
}

interface AssignmentHistoryResponse {
  received: AssignmentHistoryItem[];
  given: AssignmentHistoryItem[];
}

const ASSIGNMENT_STATUS_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

const ASSIGNMENT_STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

function formatAssignmentDateTime(value?: string | null) {
  if (!value) return "Belum direspons";
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
  const weekday = getPart("weekday");
  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");
  const hour = getPart("hour");
  const minute = getPart("minute");
  return `${weekday}, ${day} ${month} ${year}, ${hour}:${minute} WIB`;
}

function matchesAssignmentFilter(
  item: AssignmentHistoryItem,
  statusFilter: string,
  search: string,
) {
  if (statusFilter !== "all" && item.status !== statusFilter) return false;
  const keyword = search.trim().toLowerCase();
  if (!keyword) return true;
  return [item.title, item.project, item.notes]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(keyword));
}

function AssignmentHistoryTable({
  title,
  items,
  statusFilter,
  search,
  onStatusFilterChange,
  onSearchChange,
}: {
  title: string;
  items: AssignmentHistoryItem[];
  statusFilter: string;
  search: string;
  onStatusFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}) {
  const filteredItems = items.filter((item) =>
    matchesAssignmentFilter(item, statusFilter, search),
  );

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Cari tugas/project..."
              className="h-8 w-full text-sm sm:w-52"
            />
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="h-8 w-full text-sm sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_STATUS_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredItems.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Belum ada history tugas
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Departemen
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Nama Tugas
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Nama Project
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Catatan Tambahan
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Waktu Diberikan
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    Waktu Penerimaan
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.department}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.title}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.project ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.notes ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatAssignmentDateTime(item.assignedAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatAssignmentDateTime(item.respondedAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ASSIGNMENT_STATUS_STYLES[item.status] ?? ASSIGNMENT_STATUS_STYLES.pending}`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentHistorySection({
  history,
}: {
  history?: AssignmentHistoryResponse;
}) {
  const [receivedStatusFilter, setReceivedStatusFilter] = useState("all");
  const [givenStatusFilter, setGivenStatusFilter] = useState("all");
  const [receivedSearch, setReceivedSearch] = useState("");
  const [givenSearch, setGivenSearch] = useState("");

  return (
    <div className="space-y-5">
      <AssignmentHistoryTable
        title="Penerimaan Tugas"
        items={history?.received ?? []}
        statusFilter={receivedStatusFilter}
        search={receivedSearch}
        onStatusFilterChange={setReceivedStatusFilter}
        onSearchChange={setReceivedSearch}
      />
      <AssignmentHistoryTable
        title="Pemberian Tugas"
        items={history?.given ?? []}
        statusFilter={givenStatusFilter}
        search={givenSearch}
        onStatusFilterChange={setGivenStatusFilter}
        onSearchChange={setGivenSearch}
      />
    </div>
  );
}

export default function LaporanSaya() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canEdit } = useEditPermissions();

  const today = getJakartaDateString();
  const todayFormatted = formatJakartaDateLong();
  const isWeekendToday = isWeekendDate(today);

  const { data: todayReport, isLoading, isError } = useGetTodayReport({
    query: { queryKey: getGetTodayReportQueryKey(), retry: false }
  });

  const { data: previousReportTasks } = useGetYesterdayTasks();
  const { data: employees } = useListEmployees();
  const { data: assignedTaskNotifications } = useQuery({
    queryKey: ["assigned-tasks", "pending"],
    queryFn: () =>
      apiRequest<AssignedTaskNotification[]>("/api/assigned-tasks/pending"),
    refetchInterval: 15000,
  });
  const { data: assignmentHistory } = useQuery({
    queryKey: ["assigned-tasks", "history"],
    queryFn: () =>
      apiRequest<AssignmentHistoryResponse>("/api/assigned-tasks/history"),
    refetchInterval: 15000,
  });
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
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    assigneeUserId: "",
    title: "",
    project: "",
    notes: "",
  });
  const [isAssigningTask, setIsAssigningTask] = useState(false);
  const [respondingAssignmentId, setRespondingAssignmentId] = useState<number | null>(null);
  const hasAutoCopiedYesterdayTasks = useRef(false);

  const report = (isError ? null : todayReport) as ReportData | null;
  const previousTasksData = previousReportTasks as PreviousReportTasksData | undefined;
  const yesterdayTasks = previousTasksData?.tasks ?? [];
  const pendingAssignedTasks = Array.isArray(assignedTaskNotifications)
    ? assignedTaskNotifications
    : [];
  const employeeOptions = (Array.isArray(employees) ? employees : []) as EmployeeOption[];
  const assignableEmployees = employeeOptions.filter((employee) => employee.id !== user?.id);
  const missingYesterdayDate = previousTasksData?.missingYesterdayDate ?? null;
  const sourceReportDate = previousTasksData?.sourceReportDate ?? null;
  const existingTasks: ExistingTask[] = report?.tasks ?? [];
const isSubmitted = report?.status === "dikirim";
const isReviewed = report?.status === "direview";
const isPastReport = !!report?.date && report.date !== today;
const isFinanceUser =
  ["AAF", "FIN"].includes(String(user?.departmentCode ?? "").toUpperCase()) ||
  String(user?.departmentName ?? "").toLowerCase().includes("finance");
const canEditOwnDailyReport = canEdit("daily_report_edit_own", true);
const canSubmitDailyReport = canEdit("daily_report_submit", true);
const canAssignDailyTasks = canEdit("daily_report_assign_tasks", true);

const isLocked = isReviewed || isPastReport;
const showSubmittedReadOnly = isSubmitted && !isEditingSubmitted;
const displayedExistingTasks = isEditingSubmitted ? editableTasks : existingTasks;

const canEditReportFields =
  canEditOwnDailyReport &&
  !isWeekendToday && (!report || report.status === "draf" || report.status === "perlu_revisi" || isEditingSubmitted);

const canModifyExistingTasks =
  canEditOwnDailyReport && !!report && !isReviewed && !isPastReport;

const canAddNewTasks = canEditReportFields;
const showSubmitActions = canEditReportFields && !isLocked && !isEditingSubmitted && !isWeekendToday;
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
    completionInputType: "",
    completionValue: "",
    progress: 0,
    status: "belum_mulai",
    notes: "",
  },
]);

  setExpandedTasks(prev => new Set([...prev, id]));
};

  const removeNewTask = (id: string) => setNewTasks(prev => prev.filter(t => t.id !== id));

  const updateNewTask = (id: string, field: keyof TaskForm, value: string | number) =>
    setNewTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (field === "status") {
        const status = String(value);
        return { ...t, status, progress: getTaskProgress(status) };
      }
      return { ...t, [field]: value };
    }));

  const getTaskCopyKey = (task: {
    title: string;
    project?: string | null;
  }) =>
    `${String(task.project ?? "").trim()}|${task.title.trim()}`;

  const getUncopiedYesterdayTasks = () => {
    const existingCounts = new Map<string, number>();
    for (const task of [...existingTasks, ...newTasks]) {
      const key = getTaskCopyKey(task);
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }

    return yesterdayTasks.filter((task) => {
      if (
        ["selesai", "delivered"].includes(task.status) ||
        task.title.trim().length === 0
      ) {
        return false;
      }
      const key = getTaskCopyKey(task);
      const existingCount = existingCounts.get(key) ?? 0;
      if (existingCount > 0) {
        existingCounts.set(key, existingCount - 1);
        return false;
      }
      return true;
    });
  };

  const copyYesterdayTasksToToday = (showToast = true) => {
  if (!Array.isArray(yesterdayTasks)) return;

  const copies = getUncopiedYesterdayTasks()
    .map((t) => ({
      id: Date.now().toString() + Math.random(),
      title: t.title,
      project: t.project ?? "",
      deadline: t.deadline ?? "",
      completionInputType: normalizeCompletionInputType(t.completionInputType),
      completionValue: t.completionValue ?? "",
      progress: t.progress,
      status: t.status,
      notes: t.notes ?? "",
      carryForwardSourceTaskId: t.id,
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
      title: sourceReportDate && sourceReportDate !== previousTasksData?.requestedYesterdayDate
        ? "Tugas laporan terakhir ditambahkan"
        : "Tugas kemarin ditambahkan",
      description: `${copies.length} tugas yang belum selesai otomatis masuk ke laporan hari ini.`,
    });
  }
};

const handleCopyYesterday = () => {
  copyYesterdayTasksToToday(true);
};

const closeAssignModal = () => {
  setShowAssignModal(false);
  setAssignForm({
    assigneeUserId: "",
    title: "",
    project: "",
    notes: "",
  });
};

const handleAssignTask = async () => {
  if (!canAssignDailyTasks) {
    toast({
      title: "Tidak punya izin",
      description: "Anda tidak punya izin untuk memberi tugas harian.",
      variant: "destructive",
    });
    return;
  }
  if (!assignForm.assigneeUserId || !assignForm.title.trim()) {
    toast({
      title: "Data belum lengkap",
      description: "Pilih penerima dan isi tugas terlebih dahulu.",
      variant: "destructive",
    });
    return;
  }

  setIsAssigningTask(true);
  try {
    await apiRequest("/api/assigned-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeUserId: Number(assignForm.assigneeUserId),
        title: assignForm.title,
        project: assignForm.project,
        notes: assignForm.notes,
      }),
    });

    closeAssignModal();
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["assigned-tasks", "history"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary", today] });
    toast({ title: "Tugas dikirim", description: "Tugas berhasil dikirim ke penerima." });
  } catch (error) {
    toast({
      title: "Gagal mengirim tugas",
      description: error instanceof Error ? error.message : "Tugas gagal dikirim",
      variant: "destructive",
    });
  } finally {
    setIsAssigningTask(false);
  }
};

const handleRespondAssignedTask = async (
  assignment: AssignedTaskNotification,
  accepted: boolean,
) => {
  setRespondingAssignmentId(assignment.id);
  try {
    await apiRequest(`/api/assigned-tasks/${assignment.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    });

    queryClient.invalidateQueries({ queryKey: ["assigned-tasks", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["assigned-tasks", "history"] });
    queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
    refreshDashboardAndMonitoring();
    toast({
      title: accepted ? "Tugas diterima" : "Tugas ditolak",
      description: accepted
        ? "Tugas sudah masuk ke laporan harian hari ini."
        : "Tugas tidak dimasukkan ke laporan harian.",
    });
  } catch (error) {
    toast({
      title: "Gagal memproses tugas",
      description: error instanceof Error ? error.message : "Gagal memproses pilihan",
      variant: "destructive",
    });
  } finally {
    setRespondingAssignmentId(null);
  }
};

useEffect(() => {
  if (hasAutoCopiedYesterdayTasks.current) return;
  if (isLoading || !canEditReportFields) return;
  if (!Array.isArray(yesterdayTasks) || yesterdayTasks.length === 0) return;

  if (getUncopiedYesterdayTasks().length === 0) return;

  hasAutoCopiedYesterdayTasks.current = true;
  copyYesterdayTasksToToday(true);
}, [yesterdayTasks, existingTasks, isLoading, canEditReportFields]);

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
    if (!report || !canEditOwnDailyReport) return;

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
      prev.map((task) => {
        if (task.id !== taskId) return task;
        if (field === "status") {
          const status = String(value);
          return { ...task, status, progress: getTaskProgress(status) };
        }
        return { ...task, [field]: value };
      }),
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
    if (!canEditOwnDailyReport) {
      throw new Error("Tidak punya izin untuk mengedit laporan harian");
    }
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
      completionInputType: task.completionInputType || undefined,
      completionValue: task.completionValue || undefined,
      progress: task.progress,
        status: task.status,
        notes: task.notes,
        carryForwardSourceTaskId: task.carryForwardSourceTaskId ?? undefined,
      }
      });
    }
    setNewTasks([]);
    return reportId;
  };

  const handleSaveSubmittedChanges = async (data: { obstacles: string; additionalNotes: string; tomorrowPlan: string }) => {
    if (!report || !validateRequiredReportFields(data)) return;
    if (!canEditOwnDailyReport) {
      toast({
        title: "Tidak punya izin",
        description: "Anda tidak punya izin untuk mengedit laporan harian.",
        variant: "destructive",
      });
      return;
    }

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
          ...(task.carryForwardSourceTaskId ? {} : {
            title: task.title,
            project: task.project ?? "",
          }),
          deadline: task.deadline || undefined,
          completionInputType: task.completionInputType || undefined,
          completionValue: task.completionValue || undefined,
          progress: task.progress,
          status: task.status,
          notes: task.notes ?? "",
        };

        if (
          !original ||
          original.title !== task.title ||
          (original.project ?? "") !== (task.project ?? "") ||
          (original.deadline ?? "") !== (task.deadline ?? "") ||
          (original.completionInputType ?? "") !== (task.completionInputType ?? "") ||
          (original.completionValue ?? "") !== (task.completionValue ?? "") ||
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
            completionInputType: task.completionInputType || undefined,
            completionValue: task.completionValue || undefined,
            progress: task.progress,
            status: task.status,
            notes: task.notes,
            carryForwardSourceTaskId: task.carryForwardSourceTaskId ?? undefined,
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
    if (!canSubmitDailyReport) {
      toast({
        title: "Tidak punya izin",
        description: "Anda tidak punya izin untuk submit laporan harian.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {

      const reportId = await saveAll(formData);
      await submitReport.mutateAsync({ id: reportId });
      queryClient.invalidateQueries({ queryKey: getGetTodayReportQueryKey() });
      refreshDashboardAndMonitoring();
      toast({ title: "Laporan Terkirim!", description: "Laporan harian Anda berhasil dikirim untuk review" });
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Gagal mengirim laporan",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExistingTask = async (
    taskId: number,
    fieldOrData: string | Partial<TaskForm>,
    value?: string | number,
  ) => {
  const task = existingTasks.find(t => t.id === taskId);

  if (
    !task ||
    !canModifyExistingTasks ||
    (!isFinanceUser && (task.isLocked || task.remainingActions <= 0))
  ) {
    toast({
      title: "Tugas terkunci",
      description: "Tugas ini sudah tidak bisa diedit. Batas edit/hapus 2x sudah habis atau tanggal laporan sudah berganti.",
      variant: "destructive",
    });
    return;
  }

  try {
    const data = typeof fieldOrData === "string" ? { [fieldOrData]: value } : fieldOrData;
    await updateTask.mutateAsync({ taskId, data });
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

  if (
    !task ||
    !canModifyExistingTasks ||
    (!isFinanceUser && (task.isLocked || task.remainingActions <= 0))
  ) {
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
          {canSubmitDailyReport && (
            <Button
              onClick={handleSubmitReport}
              disabled={isSubmitting || isSaving || isReportIncomplete}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Kirim Laporan
            </Button>
          )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : isWeekendToday && !report ? (
          <Card className="border border-blue-200 bg-blue-50">
            <CardContent className="p-5 flex items-start gap-3">
              <CalendarDays className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Hari libur</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Sabtu/Minggu tidak wajib mengisi laporan harian.
                </p>
              </div>
            </CardContent>
          </Card>
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
                    {showSubmittedReadOnly && canEditOwnDailyReport && (
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

              {missingYesterdayDate && (
                <Card className="border border-red-200 bg-red-50">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">
                        Anda tidak mengisi laporan harian kemarin tanggal {formatIndonesianDate(missingYesterdayDate)}
                      </p>
                      {sourceReportDate && (
                        <p className="text-xs text-red-600 mt-0.5">
                          Tugas otomatis diambil dari laporan terakhir tanggal {formatIndonesianDate(sourceReportDate)}.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {pendingAssignedTasks.length > 0 && (
                <div className="space-y-3">
                  {pendingAssignedTasks.map((assignment) => (
                    <Card
                      key={assignment.id}
                      className="border border-blue-200 bg-blue-50/80"
                    >
                      <CardContent className="p-4 text-center">
                        <div className="mx-auto max-w-2xl space-y-2">
                          <p className="text-sm font-semibold text-slate-900">
                            Anda menerima tugas dari {assignment.assignedByName}
                          </p>
                          <p className="text-sm text-slate-800">
                            {assignment.title}
                          </p>
                          <p className="text-sm text-slate-700">
                            Catatan :{" "}
                            {assignment.project
                              ? `ini buat project ${assignment.project}`
                              : assignment.notes?.trim() || "-"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatAssignmentDateTime(assignment.createdAt)}
                          </p>
                          <p className="pt-1 text-sm font-semibold text-slate-900">
                            Apakah anda ingin menerima tugas ini?
                          </p>
                          <div className="flex justify-center gap-3 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              disabled={respondingAssignmentId === assignment.id}
                              onClick={() => handleRespondAssignedTask(assignment, true)}
                            >
                              {respondingAssignmentId === assignment.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Ya
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={respondingAssignmentId === assignment.id}
                              onClick={() => handleRespondAssignedTask(assignment, false)}
                            >
                              Tidak
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Tasks Section */}
                <Card className="border border-border bg-white">
                  <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">
                      Daftar Tugas Hari Ini <span className="text-destructive">*</span>
                    </CardTitle>                    <div className="flex flex-wrap gap-2">
                      {canAssignDailyTasks && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignModal(true)}>
                          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                          Beri Tugas
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyYesterday}
                        disabled={getUncopiedYesterdayTasks().length === 0 || !canAddNewTasks}
                      >
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          {sourceReportDate && sourceReportDate !== previousTasksData?.requestedYesterdayDate
                            ? "Ambil Tugas Terakhir"
                            : "Ambil Tugas Kemarin"}
                      </Button>
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
                    const taskLocked =
                      !canModifyExistingTasks ||
                      (!isFinanceUser && (task.isLocked || task.remainingActions <= 0));
                    const isCarryForwardTask = Boolean(task.carryForwardSourceTaskId);
                    const identityLocked = taskLocked || isCarryForwardTask;
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

                            {!isFinanceUser && task.remainingActions <= 0 && (
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
                                  Tanggal Tugas Diberikan: {formatDeliveryValue(task.deadline)}
                                </span>
                              )}

                              {task.completionValue && (
                                <span className="text-xs text-muted-foreground">
                                  Tanggal Tugas Diselesaikan: {task.completionValue}
                                </span>
                              )}

                              <span className="text-xs text-muted-foreground">
                                {isFinanceUser
                                  ? "Edit/hapus tidak dibatasi"
                                  : `Sisa edit/hapus: ${task.remainingActions}x`}
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
                                    disabled={identityLocked}
                                    onBlur={e => isEditingSubmitted ? updateEditableTask(task.id, "title", e.target.value) : handleUpdateExistingTask(task.id, "title", e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Project</Label>
                                  <Input
                                    defaultValue={task.project ?? ""}
                                    disabled={identityLocked}
                                    onBlur={e => isEditingSubmitted ? updateEditableTask(task.id, "project", e.target.value) : handleUpdateExistingTask(task.id, "project", e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Tanggal Tugas Diberikan</Label>
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
                                <div className="space-y-1">
                                  <Label className="text-xs">Tanggal Tugas Diselesaikan</Label>
                                  <TaskCompletionInput
                                    inputType={task.completionInputType}
                                    value={task.completionValue ?? ""}
                                    disabled={taskLocked}
                                    onCommit={(inputType, value) => {
                                      if (isEditingSubmitted) {
                                        updateEditableTask(task.id, "completionInputType", inputType);
                                        updateEditableTask(task.id, "completionValue", value);
                                      } else {
                                        handleUpdateExistingTask(task.id, {
                                          completionInputType: inputType,
                                          completionValue: value,
                                        });
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              <div className={`rounded-md border p-2 text-xs ${taskLocked ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                                {isCarryForwardTask
                                  ? "Tugas lanjutan dari laporan sebelumnya. Nama tugas dan project dikunci; lanjutkan dengan mengubah status atau tanggal."
                                  : taskLocked
                                  ? "Tugas terkunci. Batas edit/hapus sudah habis atau tanggal laporan sudah berganti."
                                  : isFinanceUser
                                    ? "Tugas Finance tidak dibatasi jumlah edit/hapus."
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
                                    disabled
                                    value={[task.progress]}
                                    min={0}
                                    max={100}
                                    step={25}
                                  /> 
                                 </div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Job yang dikerjakan</Label>
                                <Input
                                  defaultValue={task.notes ?? ""}
                                  disabled={taskLocked || isCarryForwardTask}
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
                                disabled={taskLocked || isCarryForwardTask}
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
                  {newTasks.map(task => {
                    const isCarryForwardTask = Boolean(task.carryForwardSourceTaskId);
                    return (
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
                          disabled={isCarryForwardTask}
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Project</Label>
                        <Input
                          value={task.project}
                          onChange={e => updateNewTask(task.id, "project", e.target.value)}
                          placeholder="Nama project..."
                          disabled={isCarryForwardTask}
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Tanggal Tugas Diberikan</Label>
                        <TaskDeliveryInput
                          value={task.deadline}
                          onCommit={(value) => updateNewTask(task.id, "deadline", value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tanggal Tugas Diselesaikan</Label>
                        <TaskCompletionInput
                          inputType={task.completionInputType}
                          value={task.completionValue}
                          onCommit={(inputType, value) => {
                            updateNewTask(task.id, "completionInputType", inputType);
                            updateNewTask(task.id, "completionValue", value);
                          }}
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
                            <Slider disabled value={[task.progress]} min={0} max={100} step={25} />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Job yang dikerjakan</Label>
                        <Input value={task.notes} onChange={e => updateNewTask(task.id, "notes", e.target.value)} placeholder="Catatan opsional..." disabled={isCarryForwardTask} className="h-8 text-sm" />
                      </div>
                    </div>
                    );
                  })}
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
              {!isEditingSubmitted && canSubmitDailyReport && (
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
        {!isLoading && (
          <AssignmentHistorySection history={assignmentHistory} />
        )}
      </div>
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeAssignModal}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Beri Tugas Harian
                </h2>
                <p className="text-xs text-muted-foreground">
                  Tugas akan muncul sebagai notifikasi di halaman Laporan Harian penerima.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={closeAssignModal}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Penerima <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={assignForm.assigneeUserId}
                  onValueChange={(value) =>
                    setAssignForm((current) => ({
                      ...current,
                      assigneeUserId: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Pilih penerima tugas..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.name}
                        {employee.departmentName ? ` - ${employee.departmentName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Isi Tugas <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={assignForm.title}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Contoh: Follow up approval drawing customer"
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Project</Label>
                <Input
                  value={assignForm.project}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      project: event.target.value,
                    }))
                  }
                  placeholder="Contoh: Project X"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan Tambahan</Label>
                <Input
                  value={assignForm.notes}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Opsional"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeAssignModal}
                disabled={isAssigningTask}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleAssignTask}
                disabled={
                  isAssigningTask ||
                  !assignForm.assigneeUserId ||
                  !assignForm.title.trim()
                }
              >
                {isAssigningTask ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Kirim Tugas
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
