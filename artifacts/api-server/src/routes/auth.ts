import { db, usersTable, departmentsTable, sessionsTable, eq, ilike } from "@workspace/db";
import crypto from "crypto";
import { Router } from "express";

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
    isActive: usersTable.isActive,
    departmentName: departmentsTable.name,
    departmentCode: departmentsTable.code,
  }).from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  const user = users[0];
  if (!user || user.isActive === false) return null;
  return user;
}

export const defaultDepartments = [
  { code: "DIR", name: "Director" },
  { code: "GA", name: "General Affairs" },
  { code: "AAF", name: "Finance & Accounting" },
  { code: "PUR", name: "Purchasing" },
  { code: "MKT", name: "Marketing" },
  { code: "ENG", name: "Engineering" },
];

export const activeDepartmentCodes = defaultDepartments.map(
  (department) => department.code,
);

const hiddenDepartments = [{ code: "ADM", name: "Admin" }];

const ptaaUsers = [
  {
    name: "Admin PTAA",
    email: "admin@adiyasa.com",
    password: "AdiyasaFamily",
    role: "admin",
    departmentCode: "ADM",
  },
  {
    name: "Director PTAA",
    email: "director@adiyasa.com",
    password: "DIRPTAA",
    role: "direktur",
    departmentCode: "DIR",
  },
  {
    name: "Marketing PTAA",
    email: "marketing@adiyasa.com",
    password: "MKTPTAA",
    role: "karyawan",
    departmentCode: "MKT",
  },
  {
    name: "Marketing Specialist",
    email: "mkt.specialist@adiyasa.com",
    password: "MKTPTAA",
    role: "karyawan",
    departmentCode: "MKT",
  },
  {
    name: "Finance & Accounting PTAA",
    email: "finance@adiyasa.com",
    password: "ACCPTAA",
    role: "karyawan",
    departmentCode: "AAF",
  },
  {
    name: "General Affairs PTAA",
    email: "ga@adiyasa.com",
    password: "GAPTAA",
    role: "karyawan",
    departmentCode: "GA",
  },
  {
    name: "Purchasing PTAA",
    email: "purchasing@adiyasa.com",
    password: "PURPTAA",
    role: "karyawan",
    departmentCode: "PUR",
  },
  {
    name: "Engineering 1 PTAA",
    email: "engineering1@adiyasa.com",
    password: "ENG1PTAA",
    role: "karyawan",
    departmentCode: "ENG",
  },
  {
    name: "Engineering 2 PTAA",
    email: "engineering2@adiyasa.com",
    password: "ENG2PTAA",
    role: "karyawan",
    departmentCode: "ENG",
  },
];

const inactiveEmails = [
  "admin@ptaa.com",
  "ahmad@perusahaan.com",
  "budi@perusahaan.com",
  "eko@perusahaan.com",
  "engineering3@adiyasa.com",
  "mkspec@adiyasa.com",
  "hr@adiyasa.com",
];

function getSeedSecret(): string {
  return process.env.SEED_SECRET || process.env.SEED_PTAA_SECRET || "ptaa-seed-2026";
}

function getSchemaSetupHelp(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('relation "departments" does not exist') ||
    message.includes('relation "users" does not exist') ||
    message.includes("Failed query: select") ||
    message.includes("Failed query: insert")
  ) {
    return "Tabel database belum siap. Jalankan: cd C:\\Laporan Harian PTAA lalu pnpm --filter @workspace/db push-force, kemudian restart backend dan seed ulang.";
  }

  return null;
}

async function seedDepartments() {
  for (const department of [...defaultDepartments, ...hiddenDepartments]) {
    await db
      .insert(departmentsTable)
      .values(department)
      .onConflictDoUpdate({
        target: departmentsTable.code,
        set: {
          name: department.name,
        },
      });
  }
}

async function getDepartmentIdByCode(code: string): Promise<number> {
  const result = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.code, code))
    .limit(1);

  const departmentId = result[0]?.id;

  if (!departmentId) {
    throw new Error(`Departemen dengan kode ${code} tidak ditemukan setelah proses seed departments.`);
  }

  return departmentId;
}

async function seedUsers() {
  const seededUsers = [];

  for (const user of ptaaUsers) {
    const departmentId = await getDepartmentIdByCode(user.departmentCode);
    const hashedPassword = hashPassword(user.password);

    await db
      .insert(usersTable)
      .values({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        departmentId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          name: user.name,
          password: hashedPassword,
          role: user.role,
          departmentId,
          isActive: true,
        },
      });

    const department = defaultDepartments.find((item) => item.code === user.departmentCode);

    seededUsers.push({
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      department: department?.name ?? user.departmentCode,
      departmentCode: user.departmentCode,
    });
  }

  return seededUsers;
}

async function deactivateOldDummyUsers() {
  for (const email of inactiveEmails) {
    await db
      .update(usersTable)
      .set({ isActive: false })
      .where(eq(usersTable.email, email));
  }
}

router.post("/seed-ptaa-users", async (req, res) => {
  try {
    const seedSecret = String(req.headers["x-seed-secret"] ?? "");
    const allowedSeedSecret = getSeedSecret();

    if (seedSecret !== allowedSeedSecret) {
      res.status(403).json({ error: "Akses seed tidak diizinkan" });
      return;
    }

    await seedDepartments();
    const seededUsers = await seedUsers();
    await deactivateOldDummyUsers();

    res.json({
      success: true,
      message: "User dan departemen PTAA berhasil dibuat / diupdate",
      users: seededUsers,
      inactiveEmails,
    });
  } catch (error) {
    console.error("Seed PTAA users error:", error);

    const setupHelp = getSchemaSetupHelp(error);

    res.status(500).json({
      error: "Gagal membuat user PTAA",
      detail: error instanceof Error ? error.message : String(error),
      setupHelp,
    });
  }
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
      isActive: usersTable.isActive,
      departmentName: departmentsTable.name,
      departmentCode: departmentsTable.code,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user[0] || user[0].isActive === false) {
    res.status(401).json({ error: "Pengguna tidak ditemukan atau sudah tidak aktif" });
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
    departmentCode: u.departmentCode ?? null,
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
      isActive: usersTable.isActive,
      departmentName: departmentsTable.name,
      departmentCode: departmentsTable.code,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(ilike(usersTable.email, email))
    .limit(1);

  const user = users[0];
  const isPasswordValid =
    user?.password === hashPassword(password) || user?.password === password;

  if (!user || !isPasswordValid || user.isActive === false) {
    res.status(401).json({ error: "Email atau password salah atau akun sudah tidak aktif" });
    return;
  }

  if (user.password === password) {
    await db
      .update(usersTable)
      .set({ password: hashPassword(password) })
      .where(eq(usersTable.id, user.id));
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ userId: user.id, token, expiresAt });

  res.cookie("session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
    departmentCode: user.departmentCode ?? null,
    avatarInitials: initials,
  });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.session_token;

  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }

  res.clearCookie("session_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.json({ success: true, message: "Berhasil keluar" });
});

export { getUserFromToken };
export default router;
