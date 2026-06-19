import { Router } from "express";
import {
  and,
  db,
  desc,
  eq,
  inArray,
  notificationsTable,
  or,
  sql,
  todoTaskAssigneesTable,
  todoTaskChecklistTable,
  todoTaskCommentsTable,
  todoTasksTable,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";

const router = Router();

async function getUser(req: any, res: any) {
  const token = req.cookies?.session_token;
  const user = token ? await getUserFromToken(token) : null;
  if (!user) res.status(401).json({ error: "Tidak terautentikasi" });
  return user;
}

type TodoActor = {
  id: number;
  role?: string | null;
};

function isAdmin(user: TodoActor) {
  return String(user.role ?? "").toLowerCase() === "admin";
}

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function canAccessTask(taskId: number, user: TodoActor) {
  const [task] = await db.select().from(todoTasksTable)
    .where(eq(todoTasksTable.id, taskId)).limit(1);
  if (!task) return { task: null, allowed: false };
  if (isAdmin(user) || task.createdByUserId === user.id) return { task, allowed: true };
  const [assignee] = await db.select({ id: todoTaskAssigneesTable.id })
    .from(todoTaskAssigneesTable)
    .where(and(
      eq(todoTaskAssigneesTable.taskId, taskId),
      eq(todoTaskAssigneesTable.userId, user.id),
    )).limit(1);
  return { task, allowed: Boolean(assignee) };
}

async function buildTasks(tasks: Array<typeof todoTasksTable.$inferSelect>) {
  if (tasks.length === 0) return [];
  const taskIds = tasks.map((task) => task.id);
  const creatorIds = tasks
    .map((task) => task.createdByUserId)
    .filter((id): id is number => id !== null);
  const creatorsPromise: Promise<Array<{ id: number; name: string }>> =
    creatorIds.length > 0
      ? db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, creatorIds))
      : Promise.resolve([]);
  const [assignees, checklist, comments, creators] = await Promise.all([
    db.select({
      id: todoTaskAssigneesTable.id,
      taskId: todoTaskAssigneesTable.taskId,
      userId: todoTaskAssigneesTable.userId,
      userName: usersTable.name,
      createdAt: todoTaskAssigneesTable.createdAt,
    }).from(todoTaskAssigneesTable)
      .innerJoin(usersTable, eq(todoTaskAssigneesTable.userId, usersTable.id))
      .where(inArray(todoTaskAssigneesTable.taskId, taskIds))
      .orderBy(todoTaskAssigneesTable.userName),
    db.select().from(todoTaskChecklistTable)
      .where(inArray(todoTaskChecklistTable.taskId, taskIds))
      .orderBy(todoTaskChecklistTable.createdAt),
    db.select().from(todoTaskCommentsTable)
      .where(inArray(todoTaskCommentsTable.taskId, taskIds))
      .orderBy(todoTaskCommentsTable.createdAt),
    creatorsPromise,
  ]);
  return tasks.map((task) => ({
    ...task,
    createdByName:
      creators.find((creator) => creator.id === task.createdByUserId)?.name ??
      task.createdByName,
    assignees: assignees.filter((item) => item.taskId === task.id),
    checklist: checklist
      .filter((item) => item.taskId === task.id)
      .map((item) => ({ ...item, isCompleted: Boolean(item.isCompleted) })),
    comments: comments
      .filter((item) => item.taskId === task.id)
      .map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  }));
}

async function buildTask(task: typeof todoTasksTable.$inferSelect) {
  return (await buildTasks([task]))[0];
}

router.get("/todo-tasks", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  let tasks: Array<typeof todoTasksTable.$inferSelect>;
  if (isAdmin(user)) {
    tasks = await db.select().from(todoTasksTable).orderBy(desc(todoTasksTable.updatedAt));
  } else {
    const assignedRows = await db.select({ taskId: todoTaskAssigneesTable.taskId })
      .from(todoTaskAssigneesTable)
      .where(eq(todoTaskAssigneesTable.userId, user.id));
    const assignedIds = assignedRows.map((item) => item.taskId);
    const accessCondition = assignedIds.length
      ? or(eq(todoTasksTable.createdByUserId, user.id), inArray(todoTasksTable.id, assignedIds))
      : eq(todoTasksTable.createdByUserId, user.id);
    tasks = await db.select().from(todoTasksTable)
      .where(accessCondition)
      .orderBy(desc(todoTasksTable.updatedAt));
  }
  res.json(await buildTasks(tasks));
});

router.get("/todo-tasks/:id", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const access = await canAccessTask(id, user);
  if (!access.task) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "Tidak diizinkan" }); return; }

  await db.update(notificationsTable).set({ isRead: true }).where(and(
    eq(notificationsTable.userId, user.id),
    eq(notificationsTable.relatedTodoId, id),
  ));
  res.json(await buildTask(access.task));
});

router.post("/todo-tasks", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;

  const title = String(req.body?.title ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const type = req.body?.type === "team" ? "team" : "personal";
  const startDate = String(req.body?.startDate ?? "");
  const dueDate = String(req.body?.dueDate ?? startDate);
  const priority = ["Rendah", "Sedang", "Urgent"].includes(req.body?.priority)
    ? req.body.priority : "Sedang";
  const assigneeIds: number[] = type === "team"
    ? [...new Set<number>((Array.isArray(req.body?.assigneeIds) ? req.body.assigneeIds : [])
        .map(Number)
        .filter((value: number) => Number.isInteger(value)))]
    : [];
  const checklist: string[] = (Array.isArray(req.body?.checklist) ? req.body.checklist : [])
    .map((item: unknown) => String(item).trim()).filter(Boolean);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    res.status(400).json({ error: "Nama tugas dan tanggal wajib diisi" }); return;
  }
  if (dueDate < startDate) {
    res.status(400).json({ error: "Due date tidak boleh sebelum tanggal mulai" }); return;
  }
  if (type === "team" && assigneeIds.length === 0) {
    res.status(400).json({ error: "Tugas tim wajib memiliki minimal 1 karyawan" }); return;
  }

  const assignees = assigneeIds.length
    ? await db.select({
        id: usersTable.id, name: usersTable.name,
      }).from(usersTable).where(and(
        inArray(usersTable.id, assigneeIds),
        eq(usersTable.isActive, true),
        sql`lower(${usersTable.role}) not in ('admin', 'direktur', 'director', 'dir', 'hr', 'monitoring_dummy')`,
      ))
    : [];
  if (assignees.length !== assigneeIds.length) {
    res.status(400).json({ error: "Salah satu karyawan yang dipilih tidak valid atau tidak aktif" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [task] = await tx.insert(todoTasksTable).values({
      title, description: description || null, type, startDate, dueDate, priority,
      createdByUserId: user.id, createdByName: user.name,
    }).returning();

    if (assignees.length) {
      await tx.insert(todoTaskAssigneesTable).values(assignees.map((assignee) => ({
        taskId: task.id, userId: assignee.id, userName: assignee.name,
      })));
      const recipients = assignees.filter((assignee) => assignee.id !== user.id);
      if (recipients.length) {
        await tx.insert(notificationsTable).values(recipients.map((assignee) => ({
          userId: assignee.id,
          title: "To Do List Baru",
          message: `Anda mendapatkan to do list baru: ${task.title} dari ${user.name}`,
          type: "todo",
          relatedTodoId: task.id,
        })));
      }
    }
    if (checklist.length) {
      await tx.insert(todoTaskChecklistTable).values(checklist.map((text: string) => ({
        taskId: task.id, text,
      })));
    }
    return task;
  });

  res.status(201).json(await buildTask(created));
});

router.patch("/todo-tasks/:id", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const access = await canAccessTask(id, user);
  if (!access.task) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }
  if (!access.allowed) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const status = req.body?.status;
  if (!["Belum Mulai", "In Progress", "Selesai"].includes(status)) {
    res.status(400).json({ error: "Status tugas tidak valid" }); return;
  }
  const [updated] = await db.update(todoTasksTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(todoTasksTable.id, id)).returning();
  res.json(await buildTask(updated));
});

router.patch("/todo-tasks/:taskId/checklist/:itemId", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const taskId = parseId(req.params.taskId);
  const itemId = parseId(req.params.itemId);
  if (!taskId || !itemId) { res.status(400).json({ error: "ID checklist tidak valid" }); return; }
  const access = await canAccessTask(taskId, user);
  if (!access.allowed) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const [updated] = await db.update(todoTaskChecklistTable)
    .set({ isCompleted: req.body?.isCompleted ? 1 : 0 })
    .where(and(
      eq(todoTaskChecklistTable.id, itemId),
      eq(todoTaskChecklistTable.taskId, taskId),
    )).returning();
  if (!updated) { res.status(404).json({ error: "Checklist tidak ditemukan" }); return; }
  res.json({ ...updated, isCompleted: Boolean(updated.isCompleted) });
});

router.post("/todo-tasks/:id/comments", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const access = await canAccessTask(id, user);
  if (!access.allowed) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const comment = String(req.body?.comment ?? "").trim();
  if (!comment) { res.status(400).json({ error: "Komentar wajib diisi" }); return; }
  const [createdComment] = await db.insert(todoTaskCommentsTable).values({
    taskId: id, userId: user.id, userName: user.name, comment,
  }).returning();
  res.status(201).json({ ...createdComment, createdAt: createdComment.createdAt.toISOString() });
});

export default router;
