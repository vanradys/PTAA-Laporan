import { db, departmentsTable, usersTable, eq, inArray, sql } from "@workspace/db";
import { getUserFromToken } from "./auth";
import { activeDepartmentCodes } from "./auth";
import { Router } from "express";
import { activeUserCondition } from "../services/dailyReportReminder";

const router = Router();

router.get("/departments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const departments = await db
    .select()
    .from(departmentsTable)
    .where(inArray(departmentsTable.code, activeDepartmentCodes))
    .orderBy(departmentsTable.name);
  res.json(departments);
});

router.get("/employees", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const employees = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(sql`${activeUserCondition()} and lower(${usersTable.role}) <> 'monitoring_dummy'`)
    .orderBy(usersTable.name);

  res.json(employees.map((employee) => ({
    ...employee,
    departmentName: employee.departmentName ?? null,
    avatarInitials: employee.name.split(" ").map((word: string) => word[0]).join("").toUpperCase().slice(0, 2),
  })));
});

router.get("/users", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses User Management" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
      departmentCode: departmentsTable.code,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .orderBy(usersTable.name);

  res.json(users);
});

router.get("/user-management/departments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses departemen User Management" });
    return;
  }

  const departments = await db
    .select()
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  res.json(departments);
});

router.patch("/users/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengubah user/role" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }
  const [existingUser] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existingUser) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  const { name, role, departmentId, isActive } = req.body ?? {};
  if (id === user.id && isActive === false) {
    res.status(400).json({ error: "Admin tidak dapat menonaktifkan akunnya sendiri" });
    return;
  }
  if (id === user.id && role !== undefined && String(role).toLowerCase() !== "admin") {
    res.status(400).json({ error: "Admin tidak dapat menghapus role Admin dari akunnya sendiri" });
    return;
  }
  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: "Nama user tidak boleh kosong" });
    return;
  }
  const allowedRoles = new Set([
    "admin",
    "direktur",
    "karyawan",
    "admin_marketing",
    "marketing_specialist",
    "monitoring_dummy",
  ]);
  if (role !== undefined && !allowedRoles.has(String(role).toLowerCase())) {
    res.status(400).json({ error: "Role tidak valid" });
    return;
  }

  const normalizedRole =
    role !== undefined ? String(role).toLowerCase() : existingUser.role;
  const requiredDepartmentCodeByRole: Record<string, string> = {
    direktur: "DIR",
    admin_marketing: "MKT",
    marketing_specialist: "MKT",
    monitoring_dummy: "ADM",
  };
  const requiredDepartmentCode = requiredDepartmentCodeByRole[normalizedRole];
  let normalizedDepartmentId =
    departmentId === undefined
      ? undefined
      : departmentId === null || departmentId === ""
        ? null
        : Number(departmentId);

  if (requiredDepartmentCode) {
    const [requiredDepartment] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.code, requiredDepartmentCode))
      .limit(1);
    if (!requiredDepartment) {
      res.status(500).json({
        error: `Departemen wajib ${requiredDepartmentCode} belum tersedia`,
      });
      return;
    }
    normalizedDepartmentId = requiredDepartment.id;
  }

  if (normalizedDepartmentId !== undefined && normalizedDepartmentId !== null) {
    const parsedDepartmentId = Number(normalizedDepartmentId);
    if (!Number.isInteger(parsedDepartmentId) || parsedDepartmentId <= 0) {
      res.status(400).json({ error: "Departemen tidak valid" });
      return;
    }
    const [department] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, parsedDepartmentId))
      .limit(1);
    if (!department) {
      res.status(400).json({ error: "Departemen tidak ditemukan" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(role !== undefined ? { role: String(role).toLowerCase() } : {}),
      ...(normalizedDepartmentId !== undefined
        ? { departmentId: normalizedDepartmentId }
        : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    })
    .where(eq(usersTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/users/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat menghapus user" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }
  if (id === user.id) {
    res.status(400).json({ error: "Admin tidak dapat menghapus akunnya sendiri" });
    return;
  }

  const [existingUser] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existingUser) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  const dependencyResult = await db.execute(sql`
    select
      (
        (select count(*) from daily_reports where user_id = ${id}) +
        (select count(*) from report_comments where user_id = ${id}) +
        (select count(*) from assigned_daily_tasks where assignee_user_id = ${id} or assigned_by_user_id = ${id}) +
        (select count(*) from projects_po where pic_user_id = ${id} or created_by_user_id = ${id} or closed_by_user_id = ${id}) +
        (select count(*) from po_change_logs where changed_by_user_id = ${id}) +
        (select count(*) from po_internal_comments where user_id = ${id}) +
        (select count(*) from daily_tasks where reviewed_by_user_id = ${id}) +
        (select count(*) from todo_tasks where created_by_user_id = ${id}) +
        (select count(*) from todo_task_assignees where user_id = ${id}) +
        (select count(*) from todo_task_comments where user_id = ${id}) +
        (select count(*) from attendance_mappings where user_id = ${id}) +
        (select count(*) from attendance_scans where user_id = ${id}) +
        (select count(*) from attendance_daily where user_id = ${id}) +
        (select count(*) from attendance_import_batches where uploaded_by = ${id}) +
        (select count(*) from attendance_notification_logs where user_id = ${id})
      )::int as blocking_count
  `);
  const dependencyRow =
    ((dependencyResult as { rows?: Array<{ blocking_count?: number | string }> }).rows?.[0]) ??
    ((dependencyResult as unknown as Array<{ blocking_count?: number | string }>)[0]);
  const blockingCount = Number(dependencyRow?.blocking_count ?? 0);

  if (blockingCount > 0) {
    res.status(409).json({
      error:
        "User ini punya histori laporan/tugas/PO/absensi, jadi tidak aman dihapus permanen. Nonaktifkan akun agar hilang dari flow aktif tanpa merusak histori.",
      blockingCount,
    });
    return;
  }

  await db.execute(sql`delete from sessions where user_id = ${id}`);
  await db.execute(sql`delete from notifications where user_id = ${id}`);
  await db.execute(sql`delete from device_tokens where user_id = ${id}`);
  await db.execute(sql`delete from daily_report_reminder_logs where user_id = ${id}`);
  await db.execute(sql`update daily_report_reminder_logs set sent_by = null where sent_by = ${id}`);
  await db.execute(sql`delete from name_change_requests where user_id = ${id}`);
  await db.execute(sql`update name_change_requests set reviewed_by_user_id = null where reviewed_by_user_id = ${id}`);

  const [deletedUser] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    });

  res.json({ deleted: true, user: deletedUser });
});

export default router;
