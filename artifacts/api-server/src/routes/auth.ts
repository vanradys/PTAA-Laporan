import { db, usersTable, departmentsTable, sessionsTable, eq } from "@workspace/db";
import crypto from "crypto";
import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();

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
  }).from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  const user = users[0];
  if (!user || user.isActive === false) return null;
  return user;
}

router.post("/seed-ptaa-users", async (req, res) => {
  try {
    const seedSecret = String(req.headers["x-seed-secret"] ?? "");

    const allowedSeedSecret =
  process.env.SEED_SECRET ||
  process.env.SEED_PTAA_SECRET ||
  "ptaa-seed-2026";

    if (!process.env.SEED_SECRET || seedSecret !== process.env.SEED_SECRET) {
      res.status(403).json({ error: "Akses seed tidak diizinkan" });
      return;
    }

    const ptaaUsers = [
      {
        name: "Admin HR PTAA",
        email: "admin@adiyasa.com",
        password: "AdiyasaFamily",
        role: "admin",
        department: "HR",
        departmentCode: "HR",
      },
      {
        name: "Marketing PTAA",
        email: "marketing@adiyasa.com",
        password: "MKTPTAA",
        role: "karyawan",
        department: "Marketing",
        departmentCode: "MKT",
      },
      {
        name: "MKT Specialist",
        email: "mkt.specialist@adiyasa.com",
        password: "MKTPTAA",
        role: "karyawan",
        department: "Marketing",
        departmentCode: "MKT",
      },
      {
        name: "Finance & Accounting PTAA",
        email: "finance@adiyasa.com",
        password: "ACCPTAA",
        role: "karyawan",
        department: "Finance & Accounting",
        departmentCode: "AAF",
      },
      {
        name: "HR PTAA",
        email: "hr@adiyasa.com",
        password: "HRPTAA",
        role: "hr",
        department: "HR",
        departmentCode: "HR",
      },
      {
        name: "Director PTAA",
        email: "director@adiyasa.com",
        password: "DIRPTAA",
        role: "direktur",
        department: "Management",
        departmentCode: "DIR",
      },
      {
        name: "GA PTAA",
        email: "ga@adiyasa.com",
        password: "GAPTAA",
        role: "karyawan",
        department: "General Affairs",
        departmentCode: "GA",
      },
      {
        name: "Purchasing PTAA",
        email: "purchasing@adiyasa.com",
        password: "PURPTAA",
        role: "karyawan",
        department: "Purchasing",
        departmentCode: "PUR",
      },
      {
        name: "Engineering 1 PTAA",
        email: "engineering1@adiyasa.com",
        password: "ENG1PTAA",
        role: "karyawan",
        department: "Engineering",
        departmentCode: "ENG",
      },
      {
        name: "Engineering 2 PTAA",
        email: "engineering2@adiyasa.com",
        password: "ENG2PTAA",
        role: "karyawan",
        department: "Engineering",
        departmentCode: "ENG",
      },
    ];

    for (const item of ptaaUsers) {
      let existingDepartment = await db
        .select({ id: departmentsTable.id })
        .from(departmentsTable)
        .where(eq(departmentsTable.code, item.departmentCode))
        .limit(1);

      let departmentId = existingDepartment[0]?.id;

      if (!departmentId) {
        await db.insert(departmentsTable).values({
          name: item.department,
          code: item.departmentCode,
        });

        existingDepartment = await db
          .select({ id: departmentsTable.id })
          .from(departmentsTable)
          .where(eq(departmentsTable.code, item.departmentCode))
          .limit(1);

        departmentId = existingDepartment[0]?.id;
      }

      if (!departmentId) {
        throw new Error(`Departemen gagal dibuat: ${item.department}`);
      }

      const existingUser = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, item.email))
        .limit(1);

      const hashedPassword = hashPassword(item.password);

      if (existingUser[0]) {
        await db
          .update(usersTable)
          .set({
            name: item.name,
            password: hashedPassword,
            role: item.role,
            departmentId,
            isActive: true,
          })
          .where(eq(usersTable.email, item.email));
      } else {
        await db.insert(usersTable).values({
          name: item.name,
          email: item.email,
          password: hashedPassword,
          role: item.role,
          departmentId,
          isActive: true,
        });
      }
    }


    const inactiveEmails = [
      "admin@ptaa.com",
      "ahmad@perusahaan.com",
      "budi@perusahaan.com",
      "eko@perusahaan.com",
      "engineering3@adiyasa.com",
      "mkspec@adiyasa.com",
    ];

    for (const inactiveEmail of inactiveEmails) {
      await db
        .update(usersTable)
        .set({ isActive: false })
        .where(eq(usersTable.email, inactiveEmail));
    }

    res.json({
      success: true,
      message: "User PTAA berhasil dibuat / diupdate",
      users: ptaaUsers.map((item) => ({
        email: item.email,
        password: item.password,
        department: item.department,
        departmentCode: item.departmentCode,
        role: item.role,
      })),
    });
  } catch (error) {
    console.error("Seed PTAA users error:", error);

    res.status(500).json({
      error: "Gagal membuat user PTAA",
      detail: error instanceof Error ? error.message : String(error),
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
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.email, email))
    .limit(1);

  const user = users[0];
  if (!user || user.password !== hashPassword(password) || user.isActive === false) {
    res.status(401).json({ error: "Email atau password salah atau akun sudah tidak aktif" });
    return;
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
