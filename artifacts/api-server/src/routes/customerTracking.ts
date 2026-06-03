import {
  and,
  customerTrackingCommentsTable,
  db,
  desc,
  eq,
  poInternalCommentsTable,
  poChangeLogsTable,
  projectsPoTable,
  sql,
  usersTable,
  departmentsTable,
} from "@workspace/db";
import { Router } from "express";
import { getUserFromToken } from "./auth";

const router = Router();

const TRACKING_STAGES = [
  { key: "po_diterima", label: "PO Diterima", minProgress: 1 },
  { key: "engineering", label: "Engineering", minProgress: 15 },
  { key: "approval_drawing", label: "Approval Drawing", minProgress: 30 },
  { key: "procurement", label: "Procurement", minProgress: 45 },
  { key: "produksi", label: "Produksi", minProgress: 60 },
  { key: "qc", label: "QC", minProgress: 80 },
  { key: "pengiriman", label: "Pengiriman", minProgress: 95 },
  { key: "selesai", label: "Selesai", minProgress: 100 },
] as const;

function isDateOnly(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function daysUntil(value: string | null | undefined): number | null {
  if (!isDateOnly(value)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function deadlineStatus(po: typeof projectsPoTable.$inferSelect) {
  if (po.status === "selesai" || po.status === "close" || po.progress >= 100) {
    return {
      value: "on_time",
      label: "On Time",
      description: "Project selesai.",
    };
  }

  const targetDate = po.targetPenyelesaian ?? (isDateOnly(po.deadline) ? po.deadline : null);
  const remainingDays = daysUntil(targetDate);

  if (remainingDays === null) {
    return {
      value: "on_time",
      label: "On Time",
      description: "Target penyelesaian masih dipantau.",
    };
  }

  if (remainingDays < 0) {
    return {
      value: "delay",
      label: "Delay",
      description: `${Math.abs(remainingDays)} hari melewati target penyelesaian.`,
    };
  }

  if (remainingDays <= 7 && po.progress < 100) {
    return {
      value: "at_risk",
      label: "At Risk",
      description: `${remainingDays} hari menuju target penyelesaian.`,
    };
  }

  return {
    value: "on_time",
    label: "On Time",
    description: "Deadline aman.",
  };
}

function stageState(stageIndex: number, progress: number) {
  let currentIndex = -1;
  TRACKING_STAGES.forEach((stage, index) => {
    if (progress >= stage.minProgress) currentIndex = index;
  });

  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return progress >= 100 ? "done" : "active";
  return "pending";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    belum_mulai: "Belum Mulai",
    proses: "Proses",
    hampir_deadline: "Hampir Tanggal Delivery",
    delay: "Delay",
    selesai: "Selesai",
    close: "Close",
  };

  return labels[status] ?? status;
}

async function buildTrackingDetail(po: typeof projectsPoTable.$inferSelect) {
  const [pic] = po.picUserId
    ? await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, po.picUserId))
        .limit(1)
    : [];

  const [department] = po.departmentId
    ? await db
        .select({ name: departmentsTable.name })
        .from(departmentsTable)
        .where(eq(departmentsTable.id, po.departmentId))
        .limit(1)
    : [];

  const logs = await db
    .select()
    .from(poChangeLogsTable)
    .where(eq(poChangeLogsTable.poId, po.id))
    .orderBy(desc(poChangeLogsTable.createdAt))
    .limit(30);

  const customerHistory = po.customer
    ? await db
        .select()
        .from(projectsPoTable)
        .where(
          sql`lower(trim(${projectsPoTable.customer})) = lower(trim(${po.customer}))`,
        )
        .orderBy(desc(projectsPoTable.tanggalPoMasuk))
    : [];

  return {
    id: po.id,
    noPo: po.noPo,
    namaProject: po.namaProject,
    customer: po.customer,
    tanggalPoMasuk: po.tanggalPoMasuk,
    targetPenyelesaian: po.targetPenyelesaian,
    deadline: po.targetPenyelesaian ?? po.deadline,
    tanggalDelivery: po.deadline,
    picName: pic?.name ?? null,
    departmentName: department?.name ?? null,
    status: po.status,
    statusLabel: statusLabel(po.status),
    progress: Math.min(100, Math.max(0, po.progress)),
    catatan: po.catatan,
    deadlineStatus: deadlineStatus(po),
    stages: TRACKING_STAGES.map((stage, index) => ({
      key: stage.key,
      label: stage.label,
      state: stageState(index, po.progress),
    })),
    timeline: logs.map((log) => ({
      id: log.id,
      action: log.action,
      title:
        log.action === "created"
          ? "PO diterima"
          : log.action === "closed"
            ? "Project selesai"
            : "Progress project diperbarui",
      changedByName: log.changedByName,
      createdAt: log.createdAt.toISOString(),
    })),
    history: customerHistory.map((item) => ({
      id: item.id,
      noPo: item.noPo,
      namaProject: item.namaProject,
      tanggalPoMasuk: item.tanggalPoMasuk,
      status: item.status,
      statusLabel: statusLabel(item.status),
    })),
  };
}

async function findPoByCustomerAndNumber(customerName: string, poNumber: string) {
  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        sql`lower(trim(${projectsPoTable.customer})) = lower(trim(${customerName}))`,
        sql`lower(trim(${projectsPoTable.noPo})) = lower(trim(${poNumber}))`,
      ),
    )
    .limit(1);

  return po;
}

router.post("/customer-tracking/search", async (req, res) => {
  const customerName = String(req.body?.customerName ?? "").trim();
  const poNumber = String(req.body?.poNumber ?? "").trim();

  if (!customerName || !poNumber) {
    res.status(400).json({ error: "Nama Customer dan Nomor PO wajib diisi" });
    return;
  }

  const po = await findPoByCustomerAndNumber(customerName, poNumber);
  if (!po) {
    res.status(404).json({
      error: "Data PO tidak ditemukan. Pastikan Nomor PO sesuai.",
    });
    return;
  }

  res.json(await buildTrackingDetail(po));
});

router.get("/customer-tracking/internal/comments", async (req, res) => {
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

  const comments = await db
    .select({
      id: customerTrackingCommentsTable.id,
      poId: customerTrackingCommentsTable.poId,
      customerName: customerTrackingCommentsTable.customerName,
      comment: customerTrackingCommentsTable.comment,
      createdAt: customerTrackingCommentsTable.createdAt,
      isRead: customerTrackingCommentsTable.isRead,
      noPo: projectsPoTable.noPo,
      namaProject: projectsPoTable.namaProject,
    })
    .from(customerTrackingCommentsTable)
    .leftJoin(projectsPoTable, eq(customerTrackingCommentsTable.poId, projectsPoTable.id))
    .orderBy(desc(customerTrackingCommentsTable.createdAt))
    .limit(50);

  res.json(
    comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  );
});

router.get("/po/:poId/internal-comments", async (req, res) => {
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

  const poId = Number(req.params.poId);
  const comments = await db
    .select()
    .from(poInternalCommentsTable)
    .where(eq(poInternalCommentsTable.poId, poId))
    .orderBy(desc(poInternalCommentsTable.createdAt));

  res.json(
    comments.map((comment) => ({
      id: comment.id,
      poId: comment.poId,
      userId: comment.userId,
      userName: comment.userName,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  );
});

router.post("/po/:poId/internal-comments", async (req, res) => {
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

  const poId = Number(req.params.poId);
  const comment = String(req.body?.comment ?? "").trim();

  if (!comment) {
    res.status(400).json({ error: "Komentar wajib diisi" });
    return;
  }

  const [po] = await db
    .select({ id: projectsPoTable.id })
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, poId))
    .limit(1);

  if (!po) {
    res.status(404).json({ error: "PO tidak ditemukan" });
    return;
  }

  const [saved] = await db
    .insert(poInternalCommentsTable)
    .values({
      poId,
      userId: user.id,
      userName: user.name ?? "User PTAA",
      comment,
    })
    .returning();

  res.status(201).json({
    id: saved.id,
    poId: saved.poId,
    userId: saved.userId,
    userName: saved.userName,
    comment: saved.comment,
    createdAt: saved.createdAt.toISOString(),
  });
});

router.get("/customer-tracking/:poId", async (req, res) => {
  const poId = Number(req.params.poId);
  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, poId))
    .limit(1);

  if (!po) {
    res.status(404).json({ error: "Data PO tidak ditemukan. Pastikan Nomor PO sesuai." });
    return;
  }

  res.json(await buildTrackingDetail(po));
});

router.get("/customer-tracking/:poId/comments", async (req, res) => {
  const poId = Number(req.params.poId);
  const comments = await db
    .select()
    .from(customerTrackingCommentsTable)
    .where(eq(customerTrackingCommentsTable.poId, poId))
    .orderBy(desc(customerTrackingCommentsTable.createdAt));

  res.json(
    comments.map((comment) => ({
      id: comment.id,
      poId: comment.poId,
      customerName: comment.customerName,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
      isRead: comment.isRead,
    })),
  );
});

router.post("/customer-tracking/:poId/comments", async (req, res) => {
  const poId = Number(req.params.poId);
  const customerName = String(req.body?.customerName ?? "").trim();
  const comment = String(req.body?.comment ?? "").trim();

  if (!customerName || !comment) {
    res.status(400).json({ error: "Nama dan komentar wajib diisi" });
    return;
  }

  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(eq(projectsPoTable.id, poId))
    .limit(1);

  if (!po) {
    res.status(404).json({ error: "PO tidak ditemukan" });
    return;
  }

  const [saved] = await db
    .insert(customerTrackingCommentsTable)
    .values({ poId, customerName, comment })
    .returning();

  res.status(201).json({
    id: saved.id,
    poId: saved.poId,
    customerName: saved.customerName,
    comment: saved.comment,
    createdAt: saved.createdAt.toISOString(),
    isRead: saved.isRead,
  });
});

export default router;
