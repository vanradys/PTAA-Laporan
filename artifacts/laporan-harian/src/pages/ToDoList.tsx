import { type ElementType, type FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  getListNotificationsQueryKey,
  useListEmployees,
} from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Columns3,
  Grid2X2, History, ListChecks, MessageSquare, Pencil, Plus, Send, Trash2, UsersRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getJakartaDateString } from "@/lib/date";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type TaskType = "personal" | "team";
type TaskStatus = "Belum Mulai" | "In Progress" | "Selesai";
type TaskPriority = "Rendah" | "Sedang" | "Urgent";
type ViewMode = "today" | "calendar" | "cards";
type FilterMode = "date" | "month" | "year";
type Employee = {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentName?: string | null;
};
type ChecklistItem = { id: number; text: string; isCompleted: boolean };
type ChecklistHistoryItem = {
  id: number;
  action: string;
  previousText: string | null;
  nextText: string | null;
  actorName: string;
  createdAt: string;
};
type TaskComment = { id: number; userName: string; comment: string; createdAt: string };
type Task = {
  id: number; title: string; description: string | null; type: TaskType;
  startDate: string; dueDate: string; priority: TaskPriority; status: TaskStatus;
  createdByUserId: number | null; createdByName: string;
  assignees: Array<{ id: number; userId: number; userName: string }>;
  checklist: ChecklistItem[]; comments: TaskComment[];
};
type TaskForm = {
  title: string; type: TaskType; startDate: string; dueDate: string;
  priority: TaskPriority; description: string; assigneeIds: number[]; checklist: string[];
};

const today = getJakartaDateString();
const emptyForm: TaskForm = {
  title: "", type: "personal", startDate: today, dueDate: today,
  priority: "Sedang", description: "", assigneeIds: [], checklist: [""],
};
const priorityStyles: Record<TaskPriority, string> = {
  Rendah: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Sedang: "border-blue-200 bg-blue-50 text-blue-700",
  Urgent: "border-red-200 bg-red-50 text-red-700",
};
const statusStyles: Record<TaskStatus, string> = {
  "Belum Mulai": "border-slate-200 bg-slate-100 text-slate-700",
  "In Progress": "border-blue-200 bg-blue-50 text-blue-700",
  Selesai: "border-emerald-200 bg-emerald-50 text-emerald-700",
};
const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(parseDate(value));
}
function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDate(value));
}
function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function inRange(date: string, task: Task) {
  return date >= task.startDate && date <= task.dueDate;
}
function taskOverlapsPeriod(task: Task, start: string, end: string) {
  return task.startDate <= end && task.dueDate >= start;
}

function ViewButton({ active, icon: Icon, label, onClick }: {
  active: boolean; icon: ElementType; label: string; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} className={cn(
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition",
    active ? "bg-[#06258d] text-white" : "text-slate-600 hover:bg-slate-100",
  )}><Icon className="h-4 w-4" />{label}</button>;
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  return (
    <button type="button" onClick={() => onOpen(task)}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-black text-slate-950">{task.title}</h3>
        <Badge className={cn("border", priorityStyles[task.priority])}>{task.priority}</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{task.description || "Tidak ada deskripsi."}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1 font-semibold"><CalendarDays className="h-3.5 w-3.5" />{formatDate(task.startDate)} - {formatDate(task.dueDate)}</span>
        <Badge className={cn("border", statusStyles[task.status])}>{task.status}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1">
          {task.assignees.slice(0, 4).map((employee) => <span key={employee.userId}
            title={employee.userName}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black ring-2 ring-white">
            {initials(employee.userName)}
          </span>)}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">{task.createdByName}</span>
      </div>
    </button>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: ElementType;
  description: string;
}) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ToDoList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [filterMode, setFilterMode] = useState<FilterMode>("date");
  const [selectedDate, setSelectedDate] = useState(today);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [comment, setComment] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");
  const [editingChecklistId, setEditingChecklistId] = useState<number | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState("");
  const [checklistHistory, setChecklistHistory] = useState<ChecklistHistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const isAdmin = String(user?.role ?? "").toLowerCase() === "admin";

  const { data: tasks = [], isLoading, isError, error } = useQuery({
    queryKey: ["todo-tasks"],
    queryFn: () => apiRequest<Task[]>("/api/todo-tasks"),
  });
  const { data: employeesData } = useListEmployees();
  const employees = ((Array.isArray(employeesData) ? employeesData : []) as Employee[])
    .filter((employee) =>
      !["admin", "direktur", "director", "dir", "hr", "monitoring_dummy"]
        .includes(String(employee.role ?? "").toLowerCase()),
    );

  const openTask = async (task: Task) => {
    try {
      const detail = await apiRequest<Task>(`/api/todo-tasks/${task.id}`);
      setSelectedTask(detail);
      if (isAdmin) {
        setChecklistHistory(await apiRequest<ChecklistHistoryItem[]>(`/api/todo-tasks/${task.id}/checklist-history`));
      } else {
        setChecklistHistory([]);
      }
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (error) {
      toast({ title: "Gagal membuka tugas", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };

  useEffect(() => {
    const taskId = Number(new URLSearchParams(search).get("task"));
    if (!taskId || !tasks.length || selectedTask) return;
    const task = tasks.find((item) => item.id === taskId);
    if (task) void openTask(task);
  }, [tasks, search, selectedTask]);

  useEffect(() => {
    if (viewMode === "calendar" && filterMode !== "month") setFilterMode("month");
  }, [viewMode, filterMode]);

  const selectedYear = selectedDate.slice(0, 4);
  const selectedMonth = selectedDate.slice(0, 7);
  const periodStart =
    filterMode === "year"
      ? `${selectedYear}-01-01`
      : filterMode === "month"
        ? `${selectedMonth}-01`
        : selectedDate;
  const periodEnd =
    filterMode === "year"
      ? `${selectedYear}-12-31`
      : filterMode === "month"
        ? new Date(
            Date.UTC(Number(selectedYear), Number(selectedDate.slice(5, 7)), 0),
          ).toISOString().slice(0, 10)
        : selectedDate;
  const filteredTasks = tasks.filter((task) =>
    filterMode === "date"
      ? inRange(selectedDate, task)
      : taskOverlapsPeriod(task, periodStart, periodEnd),
  );
  const personal = filteredTasks.filter((task) => task.type === "personal");
  const team = filteredTasks.filter((task) => task.type === "team");
  const completed = filteredTasks.filter((task) => task.status === "Selesai");
  const openPersonal = personal.filter((task) => task.status !== "Selesai");
  const openTeam = team.filter((task) => task.status !== "Selesai");

  const calendarDays = useMemo(() => {
    const anchor = parseDate(selectedDate);
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const offset = firstOfMonth.getDay() === 0 ? -6 : 1 - firstOfMonth.getDay();
    const calendarStart = new Date(firstOfMonth);
    calendarStart.setDate(firstOfMonth.getDate() + offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + index);
      return date;
    });
  }, [selectedDate]);
  const selected = parseDate(selectedDate);
  const years = Array.from({ length: 7 }, (_, index) => selected.getFullYear() - 3 + index);
  const calendarLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(selected);
  const periodLabel =
    filterMode === "year"
      ? selectedYear
      : filterMode === "month"
        ? `${months[selected.getMonth()]} ${selected.getFullYear()}`
        : formatLongDate(selectedDate);

  const movePeriod = (direction: number) => {
    const date = parseDate(selectedDate);
    if (filterMode === "year") date.setFullYear(date.getFullYear() + direction);
    else if (filterMode === "month") date.setMonth(date.getMonth() + direction, 1);
    else date.setDate(date.getDate() + direction);
    setSelectedDate(dateValue(date));
  };

  const moveCalendarMonth = (direction: number) => {
    const next = parseDate(selectedDate);
    const originalDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, lastDay));
    setSelectedDate(dateValue(next));
  };
  const changeMonth = (month: number) => {
    const date = parseDate(selectedDate); date.setMonth(month, 1); setSelectedDate(dateValue(date));
  };
  const changeYear = (year: number) => {
    const date = parseDate(selectedDate); date.setFullYear(year); setSelectedDate(dateValue(date));
  };

  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (form.type === "team" && form.assigneeIds.length === 0) {
      toast({ title: "Pilih karyawan", description: "Tugas tim wajib memiliki minimal 1 karyawan.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/todo-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setIsFormOpen(false); setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["todo-tasks"] }),
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
      ]);
      toast({ title: "To Do List disimpan" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Gagal menyimpan tugas", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateStatus = async (status: TaskStatus) => {
    if (!selectedTask) return;
    try {
      const updated = await apiRequest<Task>(`/api/todo-tasks/${selectedTask.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      setSelectedTask(updated);
      queryClient.invalidateQueries({ queryKey: ["todo-tasks"] });
    } catch (error) {
      toast({ title: "Gagal mengubah status", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const toggleChecklist = async (item: ChecklistItem) => {
    if (!selectedTask) return;
    try {
      await apiRequest(`/api/todo-tasks/${selectedTask.id}/checklist/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !item.isCompleted }),
      });
      await openTask(selectedTask);
      queryClient.invalidateQueries({ queryKey: ["todo-tasks"] });
    } catch (error) {
      toast({ title: "Gagal memperbarui checklist", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const addChecklistItem = async () => {
    if (!selectedTask || !newChecklistText.trim()) return;
    try {
      await apiRequest(`/api/todo-tasks/${selectedTask.id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newChecklistText }),
      });
      setNewChecklistText("");
      await openTask(selectedTask);
      queryClient.invalidateQueries({ queryKey: ["todo-tasks"] });
    } catch (error) {
      toast({ title: "Gagal menambah checklist", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const saveChecklistText = async (item: ChecklistItem) => {
    if (!selectedTask || !editingChecklistText.trim()) return;
    try {
      await apiRequest(`/api/todo-tasks/${selectedTask.id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editingChecklistText }),
      });
      setEditingChecklistId(null);
      setEditingChecklistText("");
      await openTask(selectedTask);
      queryClient.invalidateQueries({ queryKey: ["todo-tasks"] });
    } catch (error) {
      toast({ title: "Gagal mengedit checklist", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const deleteChecklistItem = async (item: ChecklistItem) => {
    if (!selectedTask) return;
    if (!window.confirm(`Hapus sub-task "${item.text}"?`)) return;
    try {
      await apiRequest(`/api/todo-tasks/${selectedTask.id}/checklist/${item.id}`, { method: "DELETE" });
      await openTask(selectedTask);
      queryClient.invalidateQueries({ queryKey: ["todo-tasks"] });
    } catch (error) {
      toast({ title: "Gagal menghapus checklist", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };
  const sendComment = async () => {
    if (!selectedTask || !comment.trim()) return;
    try {
      await apiRequest(`/api/todo-tasks/${selectedTask.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }),
      });
      setComment(""); await openTask(selectedTask);
    } catch (error) {
      toast({ title: "Gagal menambahkan komentar", description: error instanceof Error ? error.message : "Terjadi kesalahan", variant: "destructive" });
    }
  };

  return (
    <>
      <Layout>
        <div className="page-shell space-y-6">
          <section className="relative overflow-hidden rounded-xl bg-[#062bbd] px-6 py-6 text-white">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-blue-100">Manajemen tugas internal</p>
                <h1 className="text-2xl font-black">To Do List</h1>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-blue-100">
                  <CalendarDays className="h-4 w-4" />
                  {formatLongDate(selectedDate)}
                </p>
              </div>
              <Button onClick={() => setIsFormOpen(true)} className="bg-white font-bold text-[#06258d] hover:bg-blue-50"><Plus className="mr-2 h-4 w-4" />Tambah To Do List</Button>
            </div>
          </section>

          <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <ViewButton active={viewMode === "today"} icon={Grid2X2} label="Hari Ini" onClick={() => setViewMode("today")} />
              <ViewButton active={viewMode === "calendar"} icon={CalendarDays} label="Kalender" onClick={() => { setViewMode("calendar"); setFilterMode("month"); }} />
              <ViewButton active={viewMode === "cards"} icon={Columns3} label="Kartu" onClick={() => setViewMode("cards")} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={filterMode} onChange={(event) => setFilterMode(event.target.value as FilterMode)} className="h-10 rounded-md border bg-white px-3 text-sm">
                <option value="date">Filter Tanggal</option>
                <option value="month">Filter Bulan</option>
                <option value="year">Filter Tahun</option>
              </select>
              <Button variant="outline" size="icon" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => { setSelectedDate(today); setFilterMode("date"); }}>Hari Ini</Button>
              <Button variant="outline" size="icon" onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" /></Button>
              {filterMode === "date" && (
                <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-40" />
              )}
              <select value={selected.getMonth()} onChange={(event) => changeMonth(Number(event.target.value))} className="h-10 rounded-md border bg-white px-3 text-sm">
                {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
              <select value={selected.getFullYear()} onChange={(event) => changeYear(Number(event.target.value))} className="h-10 rounded-md border bg-white px-3 text-sm">
                {years.map((year) => <option key={year}>{year}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Tugas pribadi hanya tampil untuk akun masing-masing. Tugas tim tampil untuk pembuat dan karyawan yang di-tag.
          </p>
          <p className="text-xs font-bold text-[#06258d]">Filter aktif: {periodLabel}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title={filterMode === "date" && selectedDate === today ? "Tugas Pribadi Hari Ini" : "Tugas Pribadi"}
              value={personal.length}
              icon={ListChecks}
              description={`${filterMode === "date" ? "Pada tanggal" : "Dalam periode"} yang dipilih`}
            />
            <SummaryCard
              title={filterMode === "date" && selectedDate === today ? "Tugas Tim Hari Ini" : "Tugas Tim"}
              value={team.length}
              icon={UsersRound}
              description={`${filterMode === "date" ? "Pada tanggal" : "Dalam periode"} yang dipilih`}
            />
          </div>

          {isLoading ? <p className="py-12 text-center text-slate-500">Memuat tugas...</p> : isError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-700">
              {error instanceof Error ? error.message : "Gagal memuat To Do List."}
            </p>
          ) : viewMode === "calendar" ? (
            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Kalender Tugas</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Tampilan bulanan untuk melihat jadwal tugas pribadi dan tim.
                  </p>
                  <p className="mt-1 text-sm font-black text-[#06258d]">{calendarLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => moveCalendarMonth(-1)} title="Bulan sebelumnya">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => { setSelectedDate(today); setFilterMode("month"); }}>Bulan ini</Button>
                  <Button variant="outline" size="icon" onClick={() => moveCalendarMonth(1)} title="Bulan berikutnya">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <div className="grid min-w-[840px] grid-cols-7 border-b bg-slate-50">
                {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
                  <div key={day} className="border-r px-3 py-2 text-center text-xs font-black text-slate-500 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid min-w-[840px] grid-cols-7">
                {calendarDays.map((date, index) => {
                  const value = dateValue(date);
                  const dayTasks = tasks.filter((task) => inRange(value, task));
                  const inSelectedMonth = date.getMonth() === selected.getMonth() && date.getFullYear() === selected.getFullYear();
                  return <div key={value} className={cn(
                    "min-h-[150px] border-b border-r p-2",
                    index % 7 === 6 && "border-r-0",
                    index >= 35 && "border-b-0",
                    !inSelectedMonth && "bg-slate-50/70",
                  )}>
                    <button type="button" onClick={() => { setSelectedDate(value); setFilterMode("date"); setViewMode("today"); }} className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-black",
                      !inSelectedMonth && "text-slate-400",
                      value === today && "bg-[#ef0012] text-white",
                      value === selectedDate && value !== today && "bg-blue-100 text-[#06258d]",
                    )}>
                      {date.getDate()}
                    </button>
                    <div className="mt-2 space-y-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => void openTask(task)}
                          title={task.title}
                          className={cn(
                            "block w-full truncate rounded px-2 py-1 text-left text-[11px] font-bold",
                            task.status === "Selesai"
                              ? "bg-emerald-100 text-emerald-800"
                              : task.type === "team"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-blue-100 text-blue-800",
                          )}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayTasks.length > 3 && (
                        <button
                          type="button"
                          onClick={() => { setSelectedDate(value); setFilterMode("date"); setViewMode("today"); }}
                          className="text-[11px] font-bold text-slate-500 hover:text-[#06258d]"
                        >
                          +{dayTasks.length - 3} tugas lainnya
                        </button>
                      )}
                    </div>
                  </div>;
                })}
              </div>
            </div>
            </section>
          ) : viewMode === "cards" ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Papan Kartu</h2>
                <p className="text-sm font-semibold text-slate-500">
                  Kelompokkan tugas berdasarkan jenis dan status penyelesaian.
                </p>
              </div>
            <div className="grid gap-5 xl:grid-cols-3">
              {([["Tugas Pribadi", openPersonal], ["Tugas Tim", openTeam], ["Selesai", completed]] as const).map(([label, list]) => (
                <Card key={label} className="min-h-[480px] bg-slate-100/70"><CardHeader><CardTitle className="flex justify-between text-base">{label}<Badge>{list.length}</Badge></CardTitle></CardHeader>
                  <CardContent className="space-y-3">{list.length ? list.map((task) => <TaskCard key={task.id} task={task} onOpen={openTask} />) : <p className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-slate-400">Kosong</p>}</CardContent>
                </Card>
              ))}
            </div>
            </section>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {([["Tugas Pribadi", personal, ListChecks], ["Tugas Tim", team, UsersRound]] as const).map(([label, list, Icon]) => (
                <Card key={label}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{label}<Badge className="ml-auto">{list.length}</Badge></CardTitle></CardHeader>
                  <CardContent className="space-y-3">{list.length ? list.map((task) => <TaskCard key={task.id} task={task} onOpen={openTask} />) : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">Tidak ada tugas pada {formatDate(selectedDate)}</p>}</CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Layout>

      {isFormOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
        <form onSubmit={submitTask} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-black">Tambah To Do List</h2><p className="text-sm text-slate-500">Lengkapi detail tugas yang akan dibuat.</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setIsFormOpen(false)}><X /></Button></div>
          <div className="space-y-4 p-5">
            <div><Label>Nama Tugas</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div>
            <div><Label>Deskripsi</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Jenis Tugas</Label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as TaskType, assigneeIds: [] })} className="h-10 w-full rounded-md border px-3"><option value="personal">Tugas Pribadi</option><option value="team">Tugas Tim</option></select></div>
              <div><Label>Prioritas</Label><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })} className="h-10 w-full rounded-md border px-3"><option>Rendah</option><option>Sedang</option><option>Urgent</option></select></div>
              <div><Label>Tanggal Mulai</Label><Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, dueDate: event.target.value > form.dueDate ? event.target.value : form.dueDate })} /></div>
              <div><Label>Tanggal Selesai</Label><Input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div>
            </div>
            <div><div className="flex items-center justify-between"><Label>Sub-task / Checklist</Label><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, checklist: [...form.checklist, ""] })}><Plus className="mr-1 h-3 w-3" />Tambah</Button></div>
              <div className="mt-2 space-y-2">{form.checklist.map((item, index) => <div key={index} className="flex gap-2"><Input value={item} onChange={(event) => setForm({ ...form, checklist: form.checklist.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })} placeholder={`Sub-task ${index + 1}`} /><Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, itemIndex) => itemIndex !== index) })}><X className="h-4 w-4" /></Button></div>)}</div>
            </div>
            {form.type === "team" && <div><Label>Tag Karyawan</Label><p className="mb-2 text-xs text-slate-500">Data diambil dari database karyawan aktif.</p><div className="grid gap-2 sm:grid-cols-2">{employees.map((employee) => {
              const checked = form.assigneeIds.includes(employee.id);
              return <button key={employee.id} type="button" onClick={() => setForm({ ...form, assigneeIds: checked ? form.assigneeIds.filter((id) => id !== employee.id) : [...form.assigneeIds, employee.id] })} className={cn("flex items-center gap-3 rounded-lg border p-3 text-left", checked && "border-blue-600 bg-blue-50")}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black">{initials(employee.name)}</span><span><b className="block text-sm">{employee.name}</b><small className="text-slate-500">{employee.departmentName || "Tanpa Departemen"}</small></span>{checked && <CheckCircle2 className="ml-auto h-4 w-4 text-blue-700" />}</button>;
            })}</div></div>}
          </div>
          <div className="flex justify-end gap-2 border-t p-5"><Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Batal</Button><Button disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></div>
        </form>
      </div>}

      {selectedTask && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4">
        <div className="grid max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl lg:grid-cols-[1fr_280px]">
          <div className="p-6">
            <div className="flex items-start gap-3"><button type="button" onClick={() => updateStatus(selectedTask.status === "Selesai" ? "Belum Mulai" : "Selesai")} className={cn("mt-1 h-5 w-5 rounded-full border-2", selectedTask.status === "Selesai" && "border-emerald-500 bg-emerald-500")} /><div className="flex-1"><h2 className="text-xl font-black">{selectedTask.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{selectedTask.description || "Tidak ada deskripsi."}</p></div><Button variant="ghost" size="icon" onClick={() => { setSelectedTask(null); navigate("/to-do-list"); }}><X /></Button></div>
            <div className="mt-6">
              <h3 className="text-sm font-black">Sub-task / Checklist ({selectedTask.checklist.filter((item) => item.isCompleted).length}/{selectedTask.checklist.length})</h3>
              <div className="mt-3 flex gap-2">
                <Input
                  value={newChecklistText}
                  onChange={(event) => setNewChecklistText(event.target.value)}
                  placeholder="Tambah sub-task baru..."
                  onKeyDown={(event) => { if (event.key === "Enter") void addChecklistItem(); }}
                />
                <Button type="button" onClick={addChecklistItem} disabled={!newChecklistText.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {selectedTask.checklist.length ? selectedTask.checklist.map((item) => (
                  <div key={item.id} className="flex w-full items-center gap-2 rounded-lg border p-2">
                    <button type="button" onClick={() => toggleChecklist(item)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-slate-100" title="Centang selesai">
                      <span className={cn("h-4 w-4 rounded-full border", item.isCompleted && "border-emerald-500 bg-emerald-500")} />
                    </button>
                    {editingChecklistId === item.id ? (
                      <Input
                        value={editingChecklistText}
                        onChange={(event) => setEditingChecklistText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveChecklistText(item);
                          if (event.key === "Escape") setEditingChecklistId(null);
                        }}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className={cn("flex-1 text-sm", item.isCompleted && "text-slate-400 line-through")}>{item.text}</span>
                    )}
                    {editingChecklistId === item.id ? (
                      <Button type="button" size="sm" onClick={() => saveChecklistText(item)} disabled={!editingChecklistText.trim()}>Simpan</Button>
                    ) : (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingChecklistId(item.id); setEditingChecklistText(item.text); }} title="Edit sub-task">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => deleteChecklistItem(item)} title="Hapus sub-task">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )) : <p className="text-sm text-slate-400">Tidak ada checklist.</p>}
              </div>
              {isAdmin && (
                <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                  <h4 className="flex items-center gap-2 text-xs font-black text-slate-600">
                    <History className="h-3.5 w-3.5" />
                    Riwayat Checklist
                  </h4>
                  <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                    {checklistHistory.length ? checklistHistory.map((item) => (
                      <div key={item.id} className="text-xs text-slate-600">
                        <b>{item.actorName}</b> {item.action} {item.nextText || item.previousText || "-"}
                        <span className="ml-1 text-slate-400">{new Date(item.createdAt).toLocaleString("id-ID")}</span>
                      </div>
                    )) : <p className="text-xs text-slate-400">Belum ada riwayat checklist.</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6"><h3 className="flex items-center gap-2 text-sm font-black"><MessageSquare className="h-4 w-4" />Komentar ({selectedTask.comments.length})</h3><div className="mt-3 max-h-52 space-y-3 overflow-y-auto">{selectedTask.comments.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-black">{item.userName}</p><p className="mt-1 text-sm text-slate-700">{item.comment}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString("id-ID")}</p></div>)}</div><div className="mt-3 flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tambah komentar..." onKeyDown={(event) => { if (event.key === "Enter") void sendComment(); }} /><Button onClick={sendComment}><Send className="h-4 w-4" /></Button></div></div>
          </div>
          <aside className="border-t bg-slate-50 p-6 lg:border-l lg:border-t-0">
            <div className="space-y-5">
              <div><p className="text-xs font-bold text-slate-400">Karyawan Ditugaskan</p><div className="mt-2 space-y-2">{selectedTask.assignees.length ? selectedTask.assignees.map((item) => <div key={item.userId} className="flex items-center gap-2 text-sm font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs">{initials(item.userName)}</span>{item.userName}</div>) : <p className="text-sm text-slate-500">Pribadi</p>}</div></div>
              <div><p className="text-xs font-bold text-slate-400">Tanggal Selesai</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4" />{formatDate(selectedTask.dueDate)}</p></div>
              <div><p className="text-xs font-bold text-slate-400">Prioritas</p><Badge className={cn("mt-1 border", priorityStyles[selectedTask.priority])}>{selectedTask.priority}</Badge></div>
              <div><Label>Status tugas</Label><select value={selectedTask.status} onChange={(event) => updateStatus(event.target.value as TaskStatus)} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"><option>Belum Mulai</option><option>In Progress</option><option>Selesai</option></select></div>
              <div><p className="text-xs font-bold text-slate-400">Dibuat oleh</p><p className="mt-1 text-sm font-bold">{selectedTask.createdByName}</p></div>
            </div>
          </aside>
        </div>
      </div>}
    </>
  );
}
