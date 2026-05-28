import {
  and,
  db,
  departmentsTable,
  eq,
  gte,
  like,
  lte,
  notificationsTable,
  or,
  projectsPoTable,
  sql,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router } from "express";

const router = Router();

const PO_STATUSES = [
  "belum_mulai",
  "proses",
  "hampir_deadline",
  "delay",
  "selesai",
  "close",
] as const;

const PO_AMOUNT_VISIBLE_ROLES = [
  "admin",
  "direktur",
  "dir",
];

const PO_AMOUNT_HIDDEN_DEPARTMENT_CODES = ["PUR", "ENG"];
const PO_AMOUNT_HIDDEN_DEPARTMENT_NAMES = ["purchasing", "engineering"];

function canViewPoAmount(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  if (PO_AMOUNT_VISIBLE_ROLES.includes(role)) return true;

  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (PO_AMOUNT_HIDDEN_DEPARTMENT_CODES.includes(departmentCode)) return false;

  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  return !PO_AMOUNT_HIDDEN_DEPARTMENT_NAMES.some((name) =>
    departmentName.includes(name),
  );
}

function calcSisaHari(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  return Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function autoStatus(
  current: string,
  deadline: string,
  sisaHari: number,
): string {
  if (current === "selesai" || current === "close") return current;
  if (sisaHari < 0) return "delay";
  if (sisaHari <= 7) return "hampir_deadline";
  return current === "delay" || current === "hampir_deadline"
    ? "proses"
    : current;
}

async function buildPoItem(
  po: typeof projectsPoTable.$inferSelect,
  options?: { includeAmount?: boolean },
) {
  const sisaHari = calcSisaHari(po.deadline);
  const computedStatus = autoStatus(po.status, po.deadline, sisaHari);
  let picName: string | null = null;
  let deptName: string | null = null;
  if (po.picUserId) {
    const pic = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, po.picUserId))
      .limit(1);
    picName = pic[0]?.name ?? null;
  }
  if (po.departmentId) {
    const dept = await db
      .select({ name: departmentsTable.name })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, po.departmentId))
      .limit(1);
    deptName = dept[0]?.name ?? null;
  }
  return {
    id: po.id,
    noPo: po.noPo,
    namaProject: po.namaProject,
    customer: po.customer,
    ...(options?.includeAmount
      ? { poAmount: po.poAmount ? Number(po.poAmount) : 0 }
      : {}),
    tanggalPoMasuk: po.tanggalPoMasuk,
    targetPenyelesaian: po.targetPenyelesaian,
    deadline: po.deadline,
    sisaHari,
    picUserId: po.picUserId,
    picName,
    departmentId: po.departmentId,
    departmentName: deptName,
    status: computedStatus,
    progress: po.progress,
    catatan: po.catatan,
    createdByUserId: po.createdByUserId,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
  };
}

async function sendDeadlineNotifications(
  po: typeof projectsPoTable.$inferSelect,
) {
  const sisaHari = calcSisaHari(po.deadline);
  if (po.status === "selesai" || po.status === "close") return;

  const recipients: number[] = [];
  if (po.picUserId) recipients.push(po.picUserId);
  if (po.createdByUserId && !recipients.includes(po.createdByUserId))
    recipients.push(po.createdByUserId);

  if (sisaHari < 0 && !po.notifiedPassed) {
    for (const uid of recipients) {
      await db.insert(notificationsTable).values({
        userId: uid,
        type: "po_overdue",
        title: `Deadline PO Terlewat: ${po.noPo}`,
        message: `Project "${po.namaProject}" telah melewati deadline (${po.deadline}). Segera tindak lanjut!`,
        isRead: false,
      });
    }
    await db
      .update(projectsPoTable)
      .set({ notifiedPassed: true })
      .where(eq(projectsPoTable.id, po.id));
  } else if (sisaHari >= 0 && sisaHari <= 7 && !po.notified7Days) {
    for (const uid of recipients) {
      await db.insert(notificationsTable).values({
        userId: uid,
        type: "po_deadline_7days",
        title: `Deadline Mendekat: ${po.noPo}`,
        message: `Project "${po.namaProject}" akan deadline dalam ${sisaHari} hari (${po.deadline}). Percepat penyelesaian!`,
        isRead: false,
      });
    }
    await db
      .update(projectsPoTable)
      .set({ notified7Days: true })
      .where(eq(projectsPoTable.id, po.id));
  } else if (sisaHari > 7 && sisaHari <= 14 && !po.notified14Days) {
    for (const uid of recipients) {
      await db.insert(notificationsTable).values({
        userId: uid,
        type: "po_deadline_14days",
        title: `Reminder Deadline: ${po.noPo}`,
        message: `Project "${po.namaProject}" akan deadline dalam ${sisaHari} hari (${po.deadline}).`,
        isRead: false,
      });
    }
    await db
      .update(projectsPoTable)
      .set({ notified14Days: true })
      .where(eq(projectsPoTable.id, po.id));
  }
}

router.get("/po/summary", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const now = new Date();
  const month = parseInt(req.query.month as string) || now.getMonth() + 1;
  const year = parseInt(req.query.year as string) || now.getFullYear();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const pos = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        gte(projectsPoTable.tanggalPoMasuk, startDate),
        lte(projectsPoTable.tanggalPoMasuk, endDate),
      ),
    );

  const totalPo = pos.length;
  const poSelesai = pos.filter(
    (p) => p.status === "selesai" || p.status === "close",
  ).length;
  const poBelumSelesai = totalPo - poSelesai;
  const poDelay = pos.filter(
    (p) =>
      p.status === "delay" ||
      (calcSisaHari(p.deadline) < 0 &&
        p.status !== "selesai" &&
        p.status !== "close"),
  ).length;
  const poHampirDeadline = pos.filter((p) => {
    const s = calcSisaHari(p.deadline);
    return s >= 0 && s <= 7 && p.status !== "selesai" && p.status !== "close";
  }).length;
  const persentasePencapaian =
    totalPo > 0 ? Math.round((poSelesai / totalPo) * 100) : 0;

  res.json({
    totalPo,
    poSelesai,
    poBelumSelesai,
    poDelay,
    poHampirDeadline,
    persentasePencapaian,
    month,
    year,
  });
});

router.get("/po", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const { month, year, status, departmentId, picUserId, search } = req.query;

  const conditions = [];
  if (month && year) {
    const m = parseInt(month as string);
    const y = parseInt(year as string);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0).toISOString().split("T")[0];
    conditions.push(gte(projectsPoTable.tanggalPoMasuk, startDate));
    conditions.push(lte(projectsPoTable.tanggalPoMasuk, endDate));
  }
  if (departmentId)
    conditions.push(
      eq(projectsPoTable.departmentId, parseInt(departmentId as string)),
    );
  if (picUserId)
    conditions.push(
      eq(projectsPoTable.picUserId, parseInt(picUserId as string)),
    );
  if (search) {
    const s = `%${search}%`;
    conditions.push(
      or(
        like(projectsPoTable.noPo, s),
        like(projectsPoTable.namaProject, s),
        like(sql`coalesce(${projectsPoTable.customer}, '')`, s),
      ),
    );
  }

  const pos = await db
    .select()
    .from(projectsPoTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(projectsPoTable.deadline);

  // Check and send notifications
  for (const po of pos) {
    await sendDeadlineNotifications(po);
  }

  const items = await Promise.all(
    pos.map((po) =>
      buildPoItem(po, { includeAmount: canViewPoAmount(user) }),
    ),
  );

  const filteredItems =
    status && status !== "semua"
      ? items.filter((item) => item.status === status)
      : items;

  res.json(filteredItems);
});

router.post("/po", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const allowedRoles = [
    "admin",
    "direktur",
    "dir",
    "finance",
    "marketing",
    "ga",
  ];
  if (!allowedRoles.includes(user.role)) {
    res
      .status(403)
      .json({ error: "Hanya Admin/Direktur atau departemen terkait yang dapat menambah PO" });
    return;
  }

  const {
    noPo,
    namaProject,
    customer,
    poAmount,
    tanggalPoMasuk,
    targetPenyelesaian,
    deadline,
    picUserId,
    departmentId,
    status,
    progress,
    catatan,
  } = req.body;
  if (!noPo || !namaProject || !tanggalPoMasuk || !deadline) {
    res.status(400).json({
      error: "noPo, namaProject, tanggalPoMasuk, dan deadline diperlukan",
    });
    return;
  }

  const [po] = await db
    .insert(projectsPoTable)
    .values({
      noPo,
      namaProject,
      customer: customer ?? null,
      poAmount:
        canViewPoAmount(user) && poAmount !== undefined && poAmount !== ""
          ? String(poAmount)
          : null,
      tanggalPoMasuk,
      targetPenyelesaian: targetPenyelesaian ?? null,
      deadline,
      picUserId: picUserId ? parseInt(picUserId) : null,
      departmentId: departmentId ? parseInt(departmentId) : null,
      status: status ?? "belum_mulai",
      progress: progress ? parseInt(progress) : 0,
      catatan: catatan ?? null,
      createdByUserId: user.id,
    })
    .returning();

  await sendDeadlineNotifications(po);
  const item = await buildPoItem(po, {
    includeAmount: canViewPoAmount(user),
  });
  res.status(201).json(item);
});

router.get("/po/yearly-trend", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const pos = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        gte(projectsPoTable.tanggalPoMasuk, startDate),
        lte(projectsPoTable.tanggalPoMasuk, endDate),
      ),
    );

  const canSeeAmount = canViewPoAmount(user);

  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  const trend = monthLabels.map((month, index) => {
    const monthNumber = index + 1;

    const monthlyPos = pos.filter((po) => {
      const date = new Date(po.tanggalPoMasuk);
      return date.getFullYear() === year && date.getMonth() + 1 === monthNumber;
    });

    const totalAmount = canSeeAmount
      ? monthlyPos.reduce((sum, po) => sum + Number(po.poAmount ?? 0), 0)
      : 0;

    return {
      month,
      monthNumber,
      totalPo: monthlyPos.length,
      ...(canSeeAmount ? { totalAmount } : {}),
    };
  });

  res.json({
    year,
    canViewAmount: canSeeAmount,
    items: trend,
  });
});

router.get("/po/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const id = parseInt(req.params.id);
  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, id))
    .limit(1);
  if (!po) {
    res.status(404).json({ error: "PO tidak ditemukan" });
    return;
  }

  const item = await buildPoItem(po, {
    includeAmount: canViewPoAmount(user),
  });
  res.json(item);
});

router.patch("/po/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const allowedRoles = [
    "admin",
    "direktur",
    "dir",
    "finance",
    "marketing",
    "ga",
  ];
  if (!allowedRoles.includes(user.role)) {
    res
      .status(403)
      .json({ error: "Hanya Admin/Direktur atau departemen terkait yang dapat mengubah PO" });
    return;
  }

  const id = parseInt(req.params.id);
  const [existing] = await db
    .select()
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "PO tidak ditemukan" });
    return;
  }

  const updates: Partial<typeof projectsPoTable.$inferInsert> = {};
  const {
    noPo,
    namaProject,
    customer,
    poAmount,
    tanggalPoMasuk,
    targetPenyelesaian,
    deadline,
    picUserId,
    departmentId,
    status,
    progress,
    catatan,
  } = req.body;
  if (noPo !== undefined) updates.noPo = noPo;
  if (namaProject !== undefined) updates.namaProject = namaProject;
  if (customer !== undefined) updates.customer = customer;
  if (poAmount !== undefined && canViewPoAmount(user)) {
    updates.poAmount =
      poAmount === "" || poAmount === null ? null : String(poAmount);
  }
  if (tanggalPoMasuk !== undefined) updates.tanggalPoMasuk = tanggalPoMasuk;
  if (targetPenyelesaian !== undefined)
    updates.targetPenyelesaian = targetPenyelesaian;
  if (deadline !== undefined) updates.deadline = deadline;
  if (picUserId !== undefined)
    updates.picUserId = picUserId ? parseInt(picUserId) : null;
  if (departmentId !== undefined)
    updates.departmentId = departmentId ? parseInt(departmentId) : null;
  if (status !== undefined) updates.status = status;
  if (progress !== undefined) updates.progress = parseInt(progress);
  if (catatan !== undefined) updates.catatan = catatan;

  const [updated] = await db
    .update(projectsPoTable)
    .set(updates)
    .where(eq(projectsPoTable.id, id))
    .returning();
  await sendDeadlineNotifications(updated);
  const item = await buildPoItem(updated, { includeAmount: canViewPoAmount(user) });
  res.json(item);
});

router.post("/po/:id/close", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  const allowedRoles = [
    "admin",
    "direktur",
    "dir",
    "finance",
    "marketing",
    "ga",
  ];
  if (!allowedRoles.includes(user.role)) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const id = parseInt(req.params.id);
  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, id))
    .limit(1);
  if (!po) {
    res.status(404).json({ error: "PO tidak ditemukan" });
    return;
  }

  const [updated] = await db
    .update(projectsPoTable)
    .set({
      status: "close",
      closedAt: new Date(),
      closedByUserId: user.id,
      progress: 100,
    })
    .where(eq(projectsPoTable.id, id))
    .returning();

  const item = await buildPoItem(updated, { includeAmount: canViewPoAmount(user) });
  res.json(item);
});

export default router;
