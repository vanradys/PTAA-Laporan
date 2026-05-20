import { and, db, departmentsTable, eq, notInArray, REMOVED_USER_EMAILS, sql, usersTable } from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();

function activeUserCondition() {
  return and(sql`${usersTable.isActive} is distinct from false`, notInArray(usersTable.email, [...REMOVED_USER_EMAILS]));
}

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
    .where(activeUserCondition())
    .orderBy(usersTable.name);

  res.json(employees.map((employee) => ({
    ...employee,
    departmentName: employee.departmentName ?? null,
    avatarInitials: employee.name.split(" ").map((word: string) => word[0]).join("").toUpperCase().slice(0, 2),
  })));
});

export default router;
