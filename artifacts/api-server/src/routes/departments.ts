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
    "monitoring_dummy",
  ]);
  if (role !== undefined && !allowedRoles.has(String(role).toLowerCase())) {
    res.status(400).json({ error: "Role tidak valid" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(role !== undefined ? { role: String(role).toLowerCase() } : {}),
      ...(departmentId !== undefined
        ? { departmentId: departmentId ? Number(departmentId) : null }
        : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "User tidak ditemukan" }); return; }
  res.json(updated);
});

export default router;
