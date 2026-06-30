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
  todoChecklistHistoryTable,
  todoTaskAssigneesTable,
  todoTaskChecklistTable,
  todoTaskCommentsTable,
  todoTasksTable,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";

const router = Router();
let todoTypeConstraintReady: Promise<void> | null = null;

function getJakartaDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function isPermanentTodoType(type: string) {
  return type === "personal_permanent" || type === "team_permanent";
}

function ensureTodoTypeConstraint() {
  if (!todoTypeConstraintReady) {
    todoTypeConstraintReady = (async () => {
      await db.execute(sql`
        ALTER TABLE todo_tasks
          DROP CONSTRAINT IF EXISTS todo_tasks_type_check
      `);
      await db.execute(sql`
        ALTER TABLE todo_tasks
          ADD CONSTRAINT todo_tasks_type_check
          CHECK (type IN ('personal', 'personal_permanent', 'team', 'team_permanent'))
      `);
    })();
  }
  return todoTypeConstraintReady;
}

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

function isTodoManager(user: TodoActor) {
  return ["admin", "direktur", "director", "dir", "monitoring_dummy"].includes(
    String(user.role ?? "").toLowerCase(),
  );
}

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function canAccessTask(taskId: number, user: TodoActor) {
  const [task] = await db.select().from(todoTasksTable)
    .where(eq(todoTasksTable.id, taskId)).limit(1);
  if (!task) return { task: null, allowed: false };
  if (isTodoManager(user) || task.createdByUserId === user.id) return { task, allowed: true };
  const [assignee] = await db.select({ id: todoTaskAssigneesTable.id })
    .from(todoTaskAssigneesTable)
    .where(and(
      eq(todoTaskAssigneesTable.taskId, taskId),
      eq(todoTaskAssigneesTable.userId, user.id),
    )).limit(1);
  return { task, allowed: Boolean(assignee) };
}

function canManageTask(task: typeof todoTasksTable.$inferSelect, user: TodoActor) {
  return isTodoManager(user) || task.createdByUserId === user.id;
}

async function recordChecklistHistory({
  taskId,
  checklistId,
  action,
  previousText,
  nextText,
  previousCompleted,
  nextCompleted,
  user,
}: {
  taskId: number;
  checklistId?: number | null;
  action: string;
  previousText?: string | null;
  nextText?: string | null;
  previousCompleted?: number | null;
  nextCompleted?: number | null;
  user: TodoActor & { name?: string | null };
}) {
  await db.insert(todoChecklistHistoryTable).values({
    taskId,
    checklistId: checklistId ?? null,
    action,
    previousText: previousText ?? null,
    nextText: nextText ?? null,
    previousCompleted: previousCompleted ?? null,
    nextCompleted: nextCompleted ?? null,
    actorUserId: user.id,
    actorName: user.name ?? "User",
  });
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
  if (isTodoManager(user)) {
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
  const type = req.body?.type === "team"
    ? "team"
    : req.body?.type === "team_permanent"
      ? "team_permanent"
    : req.body?.type === "personal_permanent"
      ? "personal_permanent"
      : "personal";
  const today = getJakartaDateString();
  const rawStartDate = String(req.body?.startDate ?? "");
  const rawDueDate = String(req.body?.dueDate ?? rawStartDate);
  const startDate = isPermanentTodoType(type) && !/^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)
    ? today
    : rawStartDate;
  const dueDate = isPermanentTodoType(type) && !/^\d{4}-\d{2}-\d{2}$/.test(rawDueDate)
    ? startDate
    : rawDueDate;
  const priority = ["Rendah", "Sedang", "Urgent"].includes(req.body?.priority)
    ? req.body.priority : "Sedang";
  const assigneeIds: number[] = ["team", "team_permanent"].includes(type)
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
  if (["team", "team_permanent"].includes(type) && assigneeIds.length === 0) {
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

  await ensureTodoTypeConstraint();

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
  const manager = canManageTask(access.task, user);
  const status = req.body?.status;
  const updateData: Partial<typeof todoTasksTable.$inferInsert> = {};

  if (status !== undefined) {
    if (!["Belum Mulai", "In Progress", "Selesai"].includes(status)) {
      res.status(400).json({ error: "Status tugas tidak valid" }); return;
    }
    updateData.status = status;
  }

  if (!manager) {
    const extraKeys = Object.keys(req.body ?? {}).filter((key) => key !== "status");
    if (extraKeys.length > 0) {
      res.status(403).json({ error: "Anda hanya dapat mengubah status tugas ini" });
      return;
    }
  } else {
    if (req.body?.title !== undefined) {
      const title = String(req.body.title ?? "").trim();
      if (!title) { res.status(400).json({ error: "Nama tugas wajib diisi" }); return; }
      updateData.title = title;
    }
    if (req.body?.description !== undefined) {
      const description = String(req.body.description ?? "").trim();
      updateData.description = description || null;
    }
    if (req.body?.type !== undefined) {
      updateData.type = req.body.type === "team"
        ? "team"
        : req.body.type === "team_permanent"
          ? "team_permanent"
        : req.body.type === "personal_permanent"
          ? "personal_permanent"
          : "personal";
    }
    if (req.body?.startDate !== undefined) {
      const startDate = String(req.body.startDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { res.status(400).json({ error: "Tanggal mulai tidak valid" }); return; }
      updateData.startDate = startDate;
    }
    if (req.body?.dueDate !== undefined) {
      const dueDate = String(req.body.dueDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { res.status(400).json({ error: "Tanggal selesai tidak valid" }); return; }
      updateData.dueDate = dueDate;
    }
    if (req.body?.priority !== undefined) {
      updateData.priority = ["Rendah", "Sedang", "Urgent"].includes(req.body.priority)
        ? req.body.priority
        : access.task.priority;
    }
  }

  if (Object.keys(updateData).length === 0 && req.body?.assigneeIds === undefined) {
    res.status(400).json({ error: "Tidak ada data tugas yang diubah" });
    return;
  }

  let assigneesForUpdate: Array<{ id: number; name: string }> | null = null;
  if (updateData.type !== undefined) {
    await ensureTodoTypeConstraint();
  }

  if (manager && req.body?.assigneeIds !== undefined) {
    const nextType = updateData.type ?? access.task.type;
    const assigneeIds: number[] = ["team", "team_permanent"].includes(nextType)
      ? [...new Set<number>((Array.isArray(req.body?.assigneeIds) ? req.body.assigneeIds : [])
          .map(Number)
          .filter((value: number) => Number.isInteger(value)))]
      : [];
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
    assigneesForUpdate = assignees;
  }

  const [updated] = await db.update(todoTasksTable)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(todoTasksTable.id, id)).returning();

  if (manager && assigneesForUpdate) {
    await db.delete(todoTaskAssigneesTable).where(eq(todoTaskAssigneesTable.taskId, id));
    if (assigneesForUpdate.length) {
      await db.insert(todoTaskAssigneesTable).values(assigneesForUpdate.map((assignee) => ({
        taskId: id, userId: assignee.id, userName: assignee.name,
      })));
    }
  }

  res.json(await buildTask(updated));
});

router.patch("/todo-tasks/:taskId/checklist/:itemId", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const taskId = parseId(req.params.taskId);
  const itemId = parseId(req.params.itemId);
  if (!taskId || !itemId) { res.status(400).json({ error: "ID checklist tidak valid" }); return; }
  const access = await canAccessTask(taskId, user);
  if (!access.task || !canManageTask(access.task, user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const [existing] = await db.select().from(todoTaskChecklistTable)
    .where(and(
      eq(todoTaskChecklistTable.id, itemId),
      eq(todoTaskChecklistTable.taskId, taskId),
    )).limit(1);
  if (!existing) { res.status(404).json({ error: "Checklist tidak ditemukan" }); return; }
  const updateData: {
    isCompleted?: number;
    text?: string;
  } = {};
  if (req.body?.isCompleted !== undefined) updateData.isCompleted = req.body.isCompleted ? 1 : 0;
  if (req.body?.text !== undefined) {
    const text = String(req.body.text ?? "").trim();
    if (!text) { res.status(400).json({ error: "Isi checklist wajib diisi" }); return; }
    updateData.text = text;
  }
  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Tidak ada data checklist yang diubah" });
    return;
  }
  const [updated] = await db.update(todoTaskChecklistTable)
    .set(updateData)
    .where(and(
      eq(todoTaskChecklistTable.id, itemId),
      eq(todoTaskChecklistTable.taskId, taskId),
    )).returning();
  if (!updated) { res.status(404).json({ error: "Checklist tidak ditemukan" }); return; }
  await db.update(todoTasksTable).set({ updatedAt: new Date() }).where(eq(todoTasksTable.id, taskId));
  await recordChecklistHistory({
    taskId,
    checklistId: itemId,
    action: updateData.text !== undefined ? "edit" : "toggle",
    previousText: existing.text,
    nextText: updated.text,
    previousCompleted: existing.isCompleted,
    nextCompleted: updated.isCompleted,
    user,
  });
  res.json({ ...updated, isCompleted: Boolean(updated.isCompleted) });
});

router.post("/todo-tasks/:taskId/checklist", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const taskId = parseId(req.params.taskId);
  if (!taskId) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const access = await canAccessTask(taskId, user);
  if (!access.task) { res.status(404).json({ error: "Tugas tidak ditemukan" }); return; }
  if (!canManageTask(access.task, user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const text = String(req.body?.text ?? "").trim();
  if (!text) { res.status(400).json({ error: "Isi checklist wajib diisi" }); return; }
  const [created] = await db.insert(todoTaskChecklistTable).values({ taskId, text }).returning();
  await db.update(todoTasksTable).set({ updatedAt: new Date() }).where(eq(todoTasksTable.id, taskId));
  await recordChecklistHistory({
    taskId,
    checklistId: created.id,
    action: "create",
    nextText: created.text,
    nextCompleted: created.isCompleted,
    user,
  });
  res.status(201).json({ ...created, isCompleted: Boolean(created.isCompleted) });
});

router.delete("/todo-tasks/:taskId/checklist/:itemId", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const taskId = parseId(req.params.taskId);
  const itemId = parseId(req.params.itemId);
  if (!taskId || !itemId) { res.status(400).json({ error: "ID checklist tidak valid" }); return; }
  const access = await canAccessTask(taskId, user);
  if (!access.task || !canManageTask(access.task, user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const [deleted] = await db.delete(todoTaskChecklistTable)
    .where(and(
      eq(todoTaskChecklistTable.id, itemId),
      eq(todoTaskChecklistTable.taskId, taskId),
    )).returning();
  if (!deleted) { res.status(404).json({ error: "Checklist tidak ditemukan" }); return; }
  await db.update(todoTasksTable).set({ updatedAt: new Date() }).where(eq(todoTasksTable.id, taskId));
  await recordChecklistHistory({
    taskId,
    checklistId: itemId,
    action: "delete",
    previousText: deleted.text,
    previousCompleted: deleted.isCompleted,
    user,
  });
  res.json({ success: true });
});

router.get("/todo-tasks/:taskId/checklist-history", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  if (!isTodoManager(user)) { res.status(403).json({ error: "Hanya pengelola yang dapat melihat riwayat checklist" }); return; }
  const taskId = parseId(req.params.taskId);
  if (!taskId) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const history = await db.select().from(todoChecklistHistoryTable)
    .where(eq(todoChecklistHistoryTable.taskId, taskId))
    .orderBy(desc(todoChecklistHistoryTable.createdAt));
  res.json(history.map((item) => ({
    ...item,
    previousCompleted: item.previousCompleted === null ? null : Boolean(item.previousCompleted),
    nextCompleted: item.nextCompleted === null ? null : Boolean(item.nextCompleted),
    createdAt: item.createdAt.toISOString(),
  })));
});

router.post("/todo-tasks/:id/comments", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tugas tidak valid" }); return; }
  const access = await canAccessTask(id, user);
  if (!access.task || !canManageTask(access.task, user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const comment = String(req.body?.comment ?? "").trim();
  if (!comment) { res.status(400).json({ error: "Komentar wajib diisi" }); return; }
  const [createdComment] = await db.insert(todoTaskCommentsTable).values({
    taskId: id, userId: user.id, userName: user.name, comment,
  }).returning();
  res.status(201).json({ ...createdComment, createdAt: createdComment.createdAt.toISOString() });
});

router.delete("/todo-tasks/:taskId/comments/:commentId", async (req, res) => {
  const user = await getUser(req, res);
  if (!user) return;
  const taskId = parseId(req.params.taskId);
  const commentId = parseId(req.params.commentId);
  if (!taskId || !commentId) { res.status(400).json({ error: "ID komentar tidak valid" }); return; }
  const access = await canAccessTask(taskId, user);
  if (!access.task || !canManageTask(access.task, user)) { res.status(403).json({ error: "Tidak diizinkan" }); return; }
  const [deleted] = await db.delete(todoTaskCommentsTable)
    .where(and(eq(todoTaskCommentsTable.id, commentId), eq(todoTaskCommentsTable.taskId, taskId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Komentar tidak ditemukan" }); return; }
  await db.update(todoTasksTable).set({ updatedAt: new Date() }).where(eq(todoTasksTable.id, taskId));
  res.json({ success: true });
});

export default router;
