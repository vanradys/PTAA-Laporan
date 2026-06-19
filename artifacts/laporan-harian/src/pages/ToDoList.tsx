import { type ElementType, type FormEvent, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  Grid2X2,
  ListChecks,
  Plus,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getJakartaDateString } from "@/lib/date";

type TaskType = "personal" | "team";
type TaskStatus = "Belum Mulai" | "In Progress" | "Selesai";
type TaskPriority = "Rendah" | "Sedang" | "Urgent";
type ViewMode = "today" | "calendar" | "cards";

type Task = {
  id: number;
  title: string;
  type: TaskType;
  startDate: string;
  endDate: string;
  priority: TaskPriority;
  description: string;
  employees: string[];
  status: TaskStatus;
  createdBy: string;
};

type TaskFormState = {
  title: string;
  type: TaskType;
  startDate: string;
  endDate: string;
  priority: TaskPriority;
  description: string;
  employees: string[];
};

const todayDate = getJakartaDateString();

const employeeOptions = [
  { name: "Siti Aminah", initials: "SA", department: "Marketing" },
  { name: "Andi Nugroho", initials: "AN", department: "Engineering" },
  { name: "Budi Lesmana", initials: "BL", department: "Purchasing" },
  { name: "Rena Fitri", initials: "RF", department: "Production" },
];

const initialFormState: TaskFormState = {
  title: "",
  type: "personal",
  startDate: todayDate,
  endDate: todayDate,
  priority: "Sedang",
  description: "",
  employees: [],
};

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Persiapan launching produk baru",
    type: "team",
    startDate: "2026-06-19",
    endDate: "2026-06-23",
    priority: "Urgent",
    description: "Persiapan materi, desain, dan publikasi launching.",
    employees: ["Siti Aminah", "Andi Nugroho"],
    status: "Selesai",
    createdBy: "Admin Marketing",
  },
  {
    id: 2,
    title: "Update katalog produk",
    type: "team",
    startDate: "2026-06-19",
    endDate: "2026-06-21",
    priority: "Rendah",
    description: "Update harga dan stok terbaru di katalog.",
    employees: ["Budi Lesmana", "Rena Fitri"],
    status: "In Progress",
    createdBy: "Admin Marketing",
  },
];

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

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(dateString));
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseLocalDate(dateString));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function isDateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function taskMatchesToday(task: Task) {
  return isDateInRange(todayDate, task.startDate, task.endDate);
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition",
        active
          ? "bg-[#06258d] text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconClass,
  description,
}: {
  title: string;
  value: number;
  icon: ElementType;
  iconClass: string;
  description: string;
}) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {value}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {description}
            </p>
          </div>
          <div className={cn("rounded-xl p-3", iconClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black leading-snug text-slate-950">
          {task.title}
        </h3>
        <Badge className={cn("shrink-0 border px-2.5 py-1", priorityStyles[task.priority])}>
          {task.priority}
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{task.description}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4" />
          {task.startDate === task.endDate
            ? formatShortDate(task.endDate)
            : `${formatShortDate(task.startDate)} - ${formatShortDate(task.endDate)}`}
        </div>
        <Badge className={cn("border px-2.5 py-1", statusStyles[task.status])}>
          {task.status}
        </Badge>
      </div>

      {task.type === "team" && task.employees.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {task.employees.slice(0, 4).map((employee) => (
              <div
                key={employee}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600 ring-2 ring-white"
                title={employee}
              >
                {getInitials(employee)}
              </div>
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {task.createdBy}
          </span>
        </div>
      )}
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm font-semibold text-slate-500">
      {label}
    </div>
  );
}

export default function ToDoList() {
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [form, setForm] = useState<TaskFormState>(initialFormState);
  const [calendarAnchor, setCalendarAnchor] = useState(parseLocalDate(todayDate));

  const personalTasksToday = tasks.filter(
    (task) => task.type === "personal" && taskMatchesToday(task),
  );
  const teamTasksToday = tasks.filter(
    (task) => task.type === "team" && taskMatchesToday(task),
  );
  const personalTasks = tasks.filter((task) => task.type === "personal");
  const teamTasks = tasks.filter(
    (task) => task.type === "team" && task.status !== "Selesai",
  );
  const completedTasks = tasks.filter((task) => task.status === "Selesai");

  const weekDays = useMemo(() => {
    const day = calendarAnchor.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = addDays(calendarAnchor, mondayOffset);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [calendarAnchor]);

  const weekLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(weekDays[0]);

  const handleOpenForm = () => {
    setForm(initialFormState);
    setIsFormOpen(true);
  };

  const handleChange = (field: keyof TaskFormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "type" && value === "personal") {
        next.employees = [];
      }

      if (field === "startDate" && value > current.endDate) {
        next.endDate = value;
      }

      if (field === "endDate" && value < current.startDate) {
        next.startDate = value;
      }

      return next;
    });
  };

  const handleToggleEmployee = (name: string) => {
    setForm((current) => ({
      ...current,
      employees: current.employees.includes(name)
        ? current.employees.filter((employee) => employee !== name)
        : [...current.employees, name],
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) return;

    const nextTask: Task = {
      id: Date.now(),
      title: form.title.trim(),
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      priority: form.priority,
      description: form.description.trim() || "Tidak ada deskripsi tambahan.",
      employees: form.type === "team" ? form.employees : [],
      status: "Belum Mulai",
      createdBy: "Saya",
    };

    setTasks((current) => [nextTask, ...current]);
    setIsFormOpen(false);
  };

  return (
    <>
      <Layout>
        <div className="page-shell space-y-6">
          <section className="relative overflow-hidden rounded-xl bg-[#062bbd] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100">Manajemen tugas internal</p>
                <h1 className="mt-1 text-xl font-black sm:text-2xl">To Do List</h1>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-100">
                  <CalendarDays className="h-4 w-4" />
                  {formatLongDate(todayDate)}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleOpenForm}
                className="w-full bg-white font-black text-[#06258d] hover:bg-blue-50 sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Tambah To Do List
              </Button>
            </div>
          </section>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <ViewButton
                active={viewMode === "today"}
                icon={Grid2X2}
                label="Hari Ini"
                onClick={() => setViewMode("today")}
              />
              <ViewButton
                active={viewMode === "calendar"}
                icon={CalendarDays}
                label="Kalender"
                onClick={() => setViewMode("calendar")}
              />
              <ViewButton
                active={viewMode === "cards"}
                icon={Columns3}
                label="Kartu"
                onClick={() => setViewMode("cards")}
              />
            </div>
            <p className="px-2 text-xs font-semibold text-slate-500">
              Tugas pribadi hanya tampil untuk akun masing-masing. Tugas tim tampil untuk pembuat dan karyawan yang di-tag.
            </p>
          </div>

          {viewMode === "today" && (
            <section className="space-y-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SummaryCard
                  title="Tugas Pribadi Hari Ini"
                  value={personalTasksToday.length}
                  icon={ListChecks}
                  iconClass="bg-blue-50 text-blue-600"
                  description="Tugas milik akun pribadi"
                />
                <SummaryCard
                  title="Tugas Tim Hari Ini"
                  value={teamTasksToday.length}
                  icon={UsersRound}
                  iconClass="bg-emerald-50 text-emerald-600"
                  description="Tugas tim yang perlu dipantau"
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-3">
                    <CardTitle className="text-base font-bold text-slate-800">Tugas Pribadi</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {personalTasksToday.length > 0 ? (
                      personalTasksToday.map((task) => <TaskCard key={task.id} task={task} />)
                    ) : (
                      <EmptyState label="Tidak ada tugas pribadi untuk hari ini." />
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-100 pb-3">
                    <CardTitle className="text-base font-bold text-slate-800">Tugas Tim</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {teamTasksToday.length > 0 ? (
                      teamTasksToday.map((task) => <TaskCard key={task.id} task={task} />)
                    ) : (
                      <EmptyState label="Tidak ada tugas tim untuk hari ini." />
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {viewMode === "calendar" && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Kalender Tugas</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Tampilan mingguan untuk melihat jadwal tugas pribadi dan tim.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCalendarAnchor(addDays(calendarAnchor, -7))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCalendarAnchor(parseLocalDate(todayDate))}
                    className="font-bold"
                  >
                    Hari Ini
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCalendarAnchor(addDays(calendarAnchor, 7))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-4 flex items-center gap-2 text-sm font-black text-[#06258d]">
                <Clock3 className="h-4 w-4" />
                {weekLabel}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <div className="grid min-w-[900px] grid-cols-7 bg-slate-50">
                  {weekDays.map((date) => {
                    const value = toDateInputValue(date);
                    const dayTasks = tasks.filter((task) => isDateInRange(value, task.startDate, task.endDate));
                    const isToday = value === todayDate;

                    return (
                      <div key={value} className="min-h-[420px] border-r border-slate-200 last:border-r-0">
                        <div className={cn("border-b border-slate-200 p-3", isToday && "bg-blue-50")}>
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            {new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date)}
                          </p>
                          <p className={cn("mt-1 text-lg font-black", isToday ? "text-[#06258d]" : "text-slate-900")}>
                            {date.getDate()}
                          </p>
                        </div>
                        <div className="space-y-2 p-3">
                          {dayTasks.length > 0 ? (
                            dayTasks.map((task) => (
                              <div
                                key={`${value}-${task.id}`}
                                className={cn(
                                  "rounded-lg border p-3 text-xs shadow-sm",
                                  task.type === "team"
                                    ? "border-blue-100 bg-blue-50/70"
                                    : "border-emerald-100 bg-emerald-50/70",
                                )}
                              >
                                <p className="font-black text-slate-950">{task.title}</p>
                                <p className="mt-1 line-clamp-2 text-slate-600">{task.description}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <Badge className={cn("border px-2 py-0.5 text-[10px]", statusStyles[task.status])}>
                                    {task.status}
                                  </Badge>
                                  <Badge className={cn("border px-2 py-0.5 text-[10px]", priorityStyles[task.priority])}>
                                    {task.priority}
                                  </Badge>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="pt-6 text-center text-xs font-semibold text-slate-400">Tidak ada tugas</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {viewMode === "cards" && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Papan Kartu</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Kelompokkan tugas berdasarkan jenis dan status penyelesaian.
                </p>
              </div>

              <div className="grid gap-5 xl:grid-cols-3">
                <Card className="min-h-[520px] rounded-xl border border-slate-200 bg-slate-100/70 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base font-bold text-slate-800">Tugas Pribadi</CardTitle>
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700">{personalTasks.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {personalTasks.length > 0 ? (
                      personalTasks.map((task) => <TaskCard key={task.id} task={task} />)
                    ) : (
                      <EmptyState label="Kosong" />
                    )}
                  </CardContent>
                </Card>

                <Card className="min-h-[520px] rounded-xl border border-slate-200 bg-slate-100/70 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base font-bold text-slate-800">Tugas Tim</CardTitle>
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">{teamTasks.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {teamTasks.length > 0 ? (
                      teamTasks.map((task) => <TaskCard key={task.id} task={task} />)
                    ) : (
                      <EmptyState label="Kosong" />
                    )}
                  </CardContent>
                </Card>

                <Card className="min-h-[520px] rounded-xl border border-slate-200 bg-slate-100/70 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base font-bold text-slate-800">Selesai</CardTitle>
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">{completedTasks.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {completedTasks.length > 0 ? (
                      completedTasks.map((task) => <TaskCard key={task.id} task={task} />)
                    ) : (
                      <EmptyState label="Kosong" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          )}
        </div>
      </Layout>

      {isFormOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">Tambah To Do List</h2>
                <p className="text-sm font-semibold text-slate-500">
                  Lengkapi detail tugas yang akan dibuat.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsFormOpen(false)}
                title="Tutup"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
              <div className="space-y-2">
                <Label htmlFor="todo-title">Nama Kegiatan</Label>
                <Input
                  id="todo-title"
                  value={form.title}
                  onChange={(event) => handleChange("title", event.target.value)}
                  placeholder="Contoh: Follow up customer conveyor"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="todo-type">Jenis Tugas</Label>
                  <select
                    id="todo-type"
                    value={form.type}
                    onChange={(event) => handleChange("type", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="personal">Tugas Pribadi</option>
                    <option value="team">Tugas Tim</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="todo-priority">Prioritas</Label>
                  <select
                    id="todo-priority"
                    value={form.priority}
                    onChange={(event) => handleChange("priority", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Rendah">Rendah</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="todo-start-date">Tanggal Mulai</Label>
                  <Input
                    id="todo-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(event) => handleChange("startDate", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="todo-end-date">Tanggal Selesai</Label>
                  <Input
                    id="todo-end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(event) => handleChange("endDate", event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="todo-description">Deskripsi</Label>
                <Textarea
                  id="todo-description"
                  value={form.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  placeholder="Tambahkan detail pekerjaan, catatan, atau arahan tugas."
                  rows={4}
                />
              </div>

              {form.type === "team" && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <Label>Tag Karyawan</Label>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Tugas tim akan tampil untuk karyawan yang dipilih.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {employeeOptions.map((employee) => {
                      const checked = form.employees.includes(employee.name);
                      return (
                        <button
                          type="button"
                          key={employee.name}
                          onClick={() => handleToggleEmployee(employee.name)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                            checked
                              ? "border-[#06258d] bg-blue-50 text-[#06258d]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/50",
                          )}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                            {employee.initials}
                          </span>
                          <span>
                            <span className="block text-sm font-black">{employee.name}</span>
                            <span className="block text-xs font-semibold text-slate-500">{employee.department}</span>
                          </span>
                          {checked && <CheckCircle2 className="ml-auto h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" className="bg-[#06258d] font-black text-white hover:bg-[#061f78]">
                  Simpan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
