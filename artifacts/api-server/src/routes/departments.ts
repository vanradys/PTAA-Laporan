import { db, departmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();
router.get("/departments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
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
    .orderBy(usersTable.name);

  res.json(employees.map(e => ({
    ...e,
    departmentName: e.departmentName ?? null,
    avatarInitials: e.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2),
  })));
});

export default router;
