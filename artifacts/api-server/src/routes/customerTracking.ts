import {
  and,
  customerTrackingCommentsTable,
  db,
  desc,
  eq,
  poInternalCommentsTable,
  projectsPoTable,
  notificationsTable,
  sql,
  usersTable,
  departmentsTable,
} from "@workspace/db";
import { Router } from "express";
import { getSessionTokenFromRequest, getUserFromToken } from "./auth";
import { canEditByPermission } from "../services/editPermissions";
import { ensureProjectsPoCustomerFieldsSchema } from "../services/projectsPoSchema";

const router = Router();

router.use(async (req, _res, next) => {
  const isCustomerTrackingPath =
    req.path === "/customer-tracking" ||
    req.path.startsWith("/customer-tracking/");
  const isInternalPoPath = req.path.startsWith("/po/");

  if (
    !isCustomerTrackingPath &&
    !isInternalPoPath
  ) {
    next();
    return;
  }

  const isAuthenticatedRoute =
    isInternalPoPath ||
    req.path === "/customer-tracking/internal/comments" ||
    (
      ["DELETE", "PATCH"].includes(req.method) &&
      req.path.includes("/comments/")
    );
  if (isAuthenticatedRoute && !getSessionTokenFromRequest(req)) {
    next();
    return;
  }

  try {
    await ensureProjectsPoCustomerFieldsSchema();
    next();
  } catch (error) {
    next(error);
  }
});

const TRACKING_STAGES = [
  { key: "po_received", label: "PO Received", progress: 0 },
  { key: "engineering", label: "Engineering", progress: 20 },
  { key: "approval_drawing", label: "Approval Drawing", progress: 20 },
  { key: "material_order", label: "Material Order", progress: 40 },
  { key: "production", label: "Production", progress: 60 },
  { key: "quality_control", label: "Quality Control", progress: 60 },
  { key: "finishing_trial", label: "Finishing & Trial", progress: 80 },
  { key: "painting", label: "Painting", progress: 80 },
  { key: "delivered", label: "Delivered", progress: 90 },
  { key: "project_invoiced", label: "Project Invoiced (PIC Finance)", progress: 100 },
  { key: "closed", label: "Project Sudah Dibayar (Closed)", progress: 100 },
] as const;

type ProjectProgressKey = (typeof TRACKING_STAGES)[number]["key"];

const PROJECT_PROGRESS_KEYS = new Set<string>(
  TRACKING_STAGES.map((stage) => stage.key),
);
const LEGACY_STAGE_MAP: Record<string, ProjectProgressKey> = {
  po_diterima: "po_received",
  belum_mulai: "po_received",
  procurement: "material_order",
  produksi: "production",
  qc: "quality_control",
  pengiriman: "delivered",
  delivery: "delivered",
  selesai: "project_invoiced",
  project_finished: "project_invoiced",
  close: "closed",
};
const GENERIC_LEGACY_STATUS_KEYS = new Set([
  "",
  "po_diterima",
  "belum_mulai",
  "proses",
  "hampir_deadline",
  "delay",
]);

type TrackingTimelineItem = { date: string; description: string };

function getInternalCommentDisplayName(user: {
  name?: string | null;
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}) {
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin_marketing") return user.name ?? "Admin Marketing 2";
  if (role === "marketing_specialist") return user.name ?? "Marketing Specialist";
  if (["direktur", "director", "dir"].includes(role)) return "Director";
  if (role === "admin") return "Admin";

  const code = String(user.departmentCode ?? "").toUpperCase();
  if (code === "MKT") return user.name ?? "Admin Marketing 1";
  if (code === "ENG") return "ENG";
  if (code === "PUR") return "PUR";
  if (code === "GA") return "GA";
  if (code === "AAF" || code === "FIN") return "Finance";

  const departmentName = String(user.departmentName ?? "").toLowerCase();
  if (departmentName.includes("marketing")) return "MKT";
  if (departmentName.includes("engineering")) return "ENG";
  if (departmentName.includes("purchasing")) return "PUR";
  if (departmentName.includes("general affairs")) return "GA";
  if (departmentName.includes("finance")) return "Finance";

  return "PTAA";
}

function summarizeComment(comment: string) {
  const compact = comment.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

async function notifyInternalCommentRecipients(options: {
  po: Pick<typeof projectsPoTable.$inferSelect, "noPo" | "namaProject">;
  fromName: string;
  comment: string;
}) {
  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  for (const recipient of recipients) {
    await db.insert(notificationsTable).values({
      userId: recipient.id,
      type: "po_internal_comment",
      title: `Komentar internal baru pada PO ${options.po.noPo}`,
      message: `Komentar internal baru pada PO ${options.po.noPo}/${options.po.namaProject} dari ${options.fromName}: ${summarizeComment(options.comment)}.`,
      isRead: false,
    });
  }
}

function stageState(stageKey: string, completedStages: string[]) {
  if (completedStages.includes(stageKey)) return "done";

  const firstPending = TRACKING_STAGES.find(
    (stage) => !completedStages.includes(stage.key),
  );
  if (firstPending?.key === stageKey) return "active";

  return "pending";
}

function normalizeProjectProgress(value: unknown): ProjectProgressKey {
  const raw = String(value ?? "").trim().toLowerCase();
  if (PROJECT_PROGRESS_KEYS.has(raw)) return raw as ProjectProgressKey;
  return LEGACY_STAGE_MAP[raw] ?? "po_received";
}

function getVisibleStages(hasPainting: boolean) {
  return TRACKING_STAGES.filter(
    (stage) => hasPainting || stage.key !== "painting",
  );
}

function getStageIndex(stage: ProjectProgressKey, hasPainting: boolean) {
  const visibleStages = getVisibleStages(hasPainting);
  const index = visibleStages.findIndex((item) => item.key === stage);
  return index >= 0 ? index : 0;
}

function getProjectProgressPercent(stage: ProjectProgressKey) {
  return TRACKING_STAGES.find((item) => item.key === stage)?.progress ?? 0;
}

function buildCompletedStages(stage: ProjectProgressKey, hasPainting: boolean) {
  const visibleStages = getVisibleStages(hasPainting);
  const currentIndex = getStageIndex(stage, hasPainting);
  return visibleStages
    .slice(0, currentIndex + 1)
    .map((item) => item.key);
}

function inferProjectProgressFromPercent(
  progress: unknown,
  hasPainting: boolean,
): ProjectProgressKey {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return "po_received";
  if (numericProgress >= 100) return "project_invoiced";
  if (numericProgress >= 90) return "delivered";
  if (numericProgress >= 80) return hasPainting ? "painting" : "finishing_trial";
  if (numericProgress >= 60) return "production";
  if (numericProgress >= 40) return "material_order";
  if (numericProgress >= 20) return "engineering";
  return "po_received";
}

function inferProjectProgress(
  status: unknown,
  trackingStages: unknown,
  hasPainting: boolean,
  progress?: unknown,
): ProjectProgressKey {
  const rawStatus = String(status ?? "").trim().toLowerCase();
  const normalizedStatus = normalizeProjectProgress(status);
  if (!GENERIC_LEGACY_STATUS_KEYS.has(rawStatus) && normalizedStatus !== "po_received") {
    return normalizedStatus;
  }

  const completedStages = normalizeTrackingStages(trackingStages);
  let latestStage = normalizedStatus;
  let latestIndex = getStageIndex(latestStage, hasPainting);

  for (const rawStage of completedStages) {
    const normalizedStage = normalizeProjectProgress(rawStage);
    const index = getStageIndex(normalizedStage, hasPainting);
    if (index >= latestIndex) {
      latestStage = normalizedStage;
      latestIndex = index;
    }
  }

  if (latestStage !== "po_received") return latestStage;
  return inferProjectProgressFromPercent(progress, hasPainting);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    belum_mulai: "Belum Mulai",
    proses: "Proses",
    hampir_deadline: "Hampir Target Pengiriman",
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

  const validKeys = new Set<string>([
    ...TRACKING_STAGES.map((stage) => stage.key),
    ...Object.keys(LEGACY_STAGE_MAP),
  ]);
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

  const currentStage = inferProjectProgress(
    po.status,
    po.trackingStages,
    po.hasPainting,
    po.progress,
  );
  const completedStages = buildCompletedStages(currentStage, po.hasPainting);
  const manualTimeline = normalizeTrackingTimeline(po.trackingTimeline);
  return {
    id: po.id,
    noPo: po.noPo,
    namaProject: po.namaProject,
    customer: po.customer,
    tanggalPoMasuk: po.tanggalPoMasuk,
    tanggalDelivery: po.deadline,
    picName: po.picProject ?? pic?.name ?? null,
    departmentName: department?.name ?? null,
    projectIssueAction: po.projectIssueAction,
    status: po.status,
    statusLabel:
      TRACKING_STAGES.find((stage) => stage.key === currentStage)?.label ??
      customerStatusLabel(po.status),
    progress: getProjectProgressPercent(currentStage),
    stages: getVisibleStages(po.hasPainting).map((stage) => ({
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
      statusLabel:
        TRACKING_STAGES.find(
          (stage) =>
            stage.key ===
            inferProjectProgress(
              item.status,
              item.trackingStages,
              item.hasPainting,
              item.progress,
            ),
        )?.label ?? customerStatusLabel(item.status),
    })),
  };
}

async function findPoByCustomerAndNumber(customerName: string, poNumber: string) {
  const [po] = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        sql`lower(regexp_replace(coalesce(${projectsPoTable.customer}, ''), '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(${customerName}, '[^a-zA-Z0-9]', '', 'g'))`,
        sql`lower(regexp_replace(${projectsPoTable.noPo}, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(${poNumber}, '[^a-zA-Z0-9]', '', 'g'))`,
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
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }
  if (!(await canEditByPermission(user, "project_comment_add"))) {
    res.status(403).json({ error: "Tidak diizinkan menambah komentar project" });
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
  const token = getSessionTokenFromRequest(req);
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
      userRole: comment.userRole,
      userDepartment: comment.userDepartment,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  );
});

router.post("/po/:poId/internal-comments", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
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
    .select({
      id: projectsPoTable.id,
      noPo: projectsPoTable.noPo,
      namaProject: projectsPoTable.namaProject,
    })
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
      userName: getInternalCommentDisplayName(user),
      userRole: user.role ?? null,
      userDepartment: user.departmentName ?? user.departmentCode ?? null,
      comment,
    })
    .returning();

  await notifyInternalCommentRecipients({
    po,
    fromName: saved.userName,
    comment,
  });

  res.status(201).json({
    id: saved.id,
    poId: saved.poId,
    userId: saved.userId,
    userName: saved.userName,
    userRole: saved.userRole,
    userDepartment: saved.userDepartment,
    comment: saved.comment,
    createdAt: saved.createdAt.toISOString(),
  });
});

router.delete("/po/:poId/internal-comments/:commentId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  if (!(await canEditByPermission(user, "project_comment_delete"))) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const poId = Number(req.params.poId);
  const commentId = Number(req.params.commentId);
  await db
    .delete(poInternalCommentsTable)
    .where(
      and(
        eq(poInternalCommentsTable.id, commentId),
        eq(poInternalCommentsTable.poId, poId),
      ),
    );

  res.json({ success: true });
});

router.patch("/po/:poId/internal-comments/:commentId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!(await canEditByPermission(user, "project_comment_edit"))) {
    res.status(403).json({ error: "Hanya Admin yang dapat mengedit komentar internal" });
    return;
  }

  const poId = Number(req.params.poId);
  const commentId = Number(req.params.commentId);
  const comment = String(req.body?.comment ?? "").trim();
  if (!comment) { res.status(400).json({ error: "Komentar wajib diisi" }); return; }

  const [updated] = await db
    .update(poInternalCommentsTable)
    .set({ comment })
    .where(and(
      eq(poInternalCommentsTable.id, commentId),
      eq(poInternalCommentsTable.poId, poId),
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Komentar tidak ditemukan" }); return; }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
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
  const customerComments = await db
    .select()
    .from(customerTrackingCommentsTable)
    .where(eq(customerTrackingCommentsTable.poId, poId))
    .orderBy(desc(customerTrackingCommentsTable.createdAt));

  const comments = customerComments.map((comment) => ({
    id: comment.id,
    poId: comment.poId,
    displayName: comment.customerName,
    comment: comment.comment,
    createdAt: comment.createdAt.toISOString(),
    isRead: comment.isRead,
    source: "customer",
  }));

  res.json(comments);
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
    displayName: saved.customerName,
    comment: saved.comment,
    createdAt: saved.createdAt.toISOString(),
    isRead: saved.isRead,
    source: "customer",
  });
});

router.delete("/customer-tracking/:poId/comments/:commentId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesi tidak valid" });
    return;
  }

  if (!(await canEditByPermission(user, "project_comment_delete"))) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const poId = Number(req.params.poId);
  const commentId = Number(req.params.commentId);
  await db
    .delete(customerTrackingCommentsTable)
    .where(
      and(
        eq(customerTrackingCommentsTable.id, commentId),
        eq(customerTrackingCommentsTable.poId, poId),
      ),
    );

  res.json({ success: true });
});

router.patch("/customer-tracking/:poId/comments/:commentId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (!(await canEditByPermission(user, "project_comment_edit"))) {
    res.status(403).json({ error: "Hanya Admin yang dapat mengedit customer notes" });
    return;
  }

  const poId = Number(req.params.poId);
  const commentId = Number(req.params.commentId);
  const comment = String(req.body?.comment ?? "").trim();
  if (!comment) { res.status(400).json({ error: "Komentar wajib diisi" }); return; }

  const [updated] = await db
    .update(customerTrackingCommentsTable)
    .set({ comment })
    .where(and(
      eq(customerTrackingCommentsTable.id, commentId),
      eq(customerTrackingCommentsTable.poId, poId),
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Customer note tidak ditemukan" }); return; }

  res.json({
    id: updated.id,
    poId: updated.poId,
    displayName: updated.customerName,
    comment: updated.comment,
    createdAt: updated.createdAt.toISOString(),
    isRead: updated.isRead,
    source: "customer",
  });
});

export default router;
