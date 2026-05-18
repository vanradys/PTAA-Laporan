import { Router } from "express";
import { db, usersTable, departmentsTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function getUserFromToken(token: string) {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).limit(1);
  const session = sessions[0];
  if (!session || session.expiresAt < new Date()) return null;

  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    departmentId: usersTable.departmentId,
    password: usersTable.password,
    departmentName: departmentsTable.name,
  }).from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  return users[0] ?? null;
}

router.post("/seed-demo-users", async (_req, res) => {
  const hashedPassword = hashPassword("password123");

  const demoUsers = [
    {
      name: "Admin HR PTAA",
      email: "admin@ptaa.com",
      password: hashedPassword,
      role: "admin",
      departmentId: null,
    },
    {
      name: "Ahmad HR",
      email: "ahmad@perusahaan.com",
      password: hashedPassword,
      role: "hr",
      departmentId: null,
    },
    {
      name: "Budi Santoso",
      email: "budi@perusahaan.com",
      password: hashedPassword,
      role: "karyawan",
      departmentId: null,
    },
    {
      name: "Eko Direktur",
      email: "eko@perusahaan.com",
      password: hashedPassword,
      role: "direktur",
      departmentId: null,
    },
  ];

  for (const user of demoUsers) {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, user.email))
      .limit(1);

    if (existing[0]) {
      await db
        .update(usersTable)
        .set({
          name: user.name,
          password: user.password,
          role: user.role,
          departmentId: user.departmentId,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.email, user.email));
    } else {
      await db.insert(usersTable).values(user);
    }
  }

  res.json({
    success: true,
    message: "Akun demo berhasil dibuat/reset. Password semua akun: password123",
  });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).limit(1);
  const session = sessions[0];
  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const user = await db
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
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user[0]) {
    res.status(401).json({ error: "Pengguna tidak ditemukan" });
    return;
  }

  const u = user[0];
  const initials = u.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    departmentName: u.departmentName ?? null,
    avatarInitials: initials,
  });
});

router.post("/login", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");

  if (!email || !password) {
    res.status(400).json({ error: "Email dan password diperlukan" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      password: usersTable.password,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.email, email))
    .limit(1);

  const user = users[0];
  if (!user || user.password !== hashPassword(password)) {
    res.status(401).json({ error: "Email atau password salah" });
    return;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });

  res.cookie("session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });

  const initials = user.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: user.departmentName ?? null,
    avatarInitials: initials,
  });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    res.clearCookie("session_token");
  }
  res.json({ success: true, message: "Berhasil keluar" });
});

export { getUserFromToken };
export default router;
