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

type TrackingTimelineItem = { date: string; description: string };

function stageState(stageKey: string, completedStages: string[]) {
  if (completedStages.includes(stageKey)) return "done";

  const firstPending = TRACKING_STAGES.find(
    (stage) => !completedStages.includes(stage.key),
  );
  if (firstPending?.key === stageKey) return "active";

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

function customerStatusLabel(status: string) {
  if (status === "delay" || status === "hampir_deadline") return "Proses";
  return statusLabel(status);
}

function normalizeTrackingStages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const validKeys = new Set<string>(TRACKING_STAGES.map((stage) => stage.key));
  return value
    .map((item) => String(item))
    .filter((item) => validKeys.has(item));
}

function normalizeTrackingTimeline(value: unknown): TrackingTimelineItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const date = String(raw.date ?? "").trim();
      const description = String(raw.description ?? "").trim();
      if (!date && !description) return null;
      return { date, description };
    })
    .filter((item): item is TrackingTimelineItem => Boolean(item))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
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

  const customerHistory = po.customer
    ? await db
        .select()
        .from(projectsPoTable)
        .where(
          sql`lower(trim(${projectsPoTable.customer})) = lower(trim(${po.customer}))`,
        )
        .orderBy(desc(projectsPoTable.tanggalPoMasuk))
    : [];

  const completedStages = normalizeTrackingStages(po.trackingStages);
  const manualTimeline = normalizeTrackingTimeline(po.trackingTimeline);
  const catatanLogs = await db
    .select()
    .from(poChangeLogsTable)
    .where(eq(poChangeLogsTable.poId, po.id))
    .orderBy(desc(poChangeLogsTable.createdAt))
    .limit(30);
  const catatanHistory = catatanLogs
    .map((log) => {
      const changes = log.changes as
        | Record<string, { before: unknown; after: unknown }>
        | undefined;
      const nextValue = changes?.catatan?.after;
      const text = String(nextValue ?? "").trim();
      if (!text || text === "-") return null;
      return text;
    })
    .filter((item): item is string => Boolean(item));
  const uniqueCatatanHistory = Array.from(new Set(catatanHistory));

  return {
    id: po.id,
    noPo: po.noPo,
    namaProject: po.namaProject,
    customer: po.customer,
    tanggalPoMasuk: po.tanggalPoMasuk,
    targetPenyelesaian: po.targetPenyelesaian,
    deadline: po.targetPenyelesaian,
    tanggalDelivery: po.deadline,
    picName: pic?.name ?? null,
    departmentName: department?.name ?? null,
    status: po.status,
    statusLabel: customerStatusLabel(po.status),
    progress: Math.min(100, Math.max(0, po.progress)),
    catatan:
      uniqueCatatanHistory.length > 0
        ? uniqueCatatanHistory.join("\n")
        : po.catatan,
    stages: TRACKING_STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      state: stageState(stage.key, completedStages),
    })),
    timeline: manualTimeline.map((item, index) => ({
      id: index + 1,
      date: item.date,
      title: item.description,
    })),
    history: customerHistory.map((item) => ({
      id: item.id,
      noPo: item.noPo,
      namaProject: item.namaProject,
      tanggalPoMasuk: item.tanggalPoMasuk,
      status: item.status,
      statusLabel: customerStatusLabel(item.status),
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
