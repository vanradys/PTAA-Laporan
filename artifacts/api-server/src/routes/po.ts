import {
  and,
  db,
  departmentsTable,
  desc,
  eq,
  gte,
  like,
  lte,
  notificationsTable,
  or,
  poChangeLogsTable,
  poInternalCommentsTable,
  projectsPoTable,
  sql,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { Router } from "express";

const router = Router();

const CUSTOMER_TRACKING_STAGE_KEYS = [
  "po_diterima",
  "engineering",
  "approval_drawing",
  "procurement",
  "produksi",
  "qc",
  "finishing_trial",
  "painting",
  "pengiriman",
  "selesai",
] as const;

const PROJECT_PROGRESS_STAGES = [
  { key: "po_received", label: "PO Received", progress: 0, legacyKeys: ["po_diterima", "belum_mulai"] },
  { key: "engineering", label: "Engineering", progress: 20, legacyKeys: ["engineering"] },
  { key: "approval_drawing", label: "Approval Drawing", progress: 20, legacyKeys: ["approval_drawing"] },
  { key: "material_order", label: "Material Order", progress: 40, legacyKeys: ["procurement"] },
  { key: "production", label: "Production", progress: 60, legacyKeys: ["produksi"] },
  { key: "quality_control", label: "Quality Control", progress: 60, legacyKeys: ["qc"] },
  { key: "finishing_trial", label: "Finishing & Trial", progress: 80, legacyKeys: ["finishing_trial"] },
  { key: "painting", label: "Painting", progress: 80, legacyKeys: ["painting"] },
  { key: "delivered", label: "Delivered", progress: 90, legacyKeys: ["delivery", "pengiriman"] },
  { key: "project_invoiced", label: "Project Invoiced (PIC Finance)", progress: 100, legacyKeys: ["project_finished", "selesai"] },
  { key: "closed", label: "Project Sudah Dibayar (Closed)", progress: 100, legacyKeys: ["close", "project_sudah_dibayar"] },
] as const;

type ProjectProgressKey = (typeof PROJECT_PROGRESS_STAGES)[number]["key"];

const PROJECT_PROGRESS_KEYS = new Set<string>(
  PROJECT_PROGRESS_STAGES.map((stage) => stage.key),
);
const LEGACY_PROJECT_PROGRESS_MAP = new Map<string, ProjectProgressKey>(
  PROJECT_PROGRESS_STAGES.flatMap((stage) =>
    stage.legacyKeys.map((legacyKey) => [legacyKey, stage.key] as const),
  ),
);
const GENERIC_LEGACY_STATUS_KEYS = new Set([
  "",
  "belum_mulai",
  "po_diterima",
  "proses",
  "hampir_deadline",
  "delay",
]);

const PO_AMOUNT_VISIBLE_ROLES = [
  "admin",
  "direktur",
  "director",
  "dir",
  "finance",
];
const PO_AMOUNT_VISIBLE_DEPARTMENT_CODES = ["AAF", "FIN"];
const PO_AMOUNT_VISIBLE_DEPARTMENT_NAMES = ["finance"];
const PO_AMOUNT_VISIBLE_EMAILS = [
  "admin@adiyasa.com",
  "director@adiyasa.com",
  "marketing@adiyasa.com",
  "finance@adiyasa.com",
];
const PO_AMOUNT_HIDDEN_ROLES = ["admin_marketing", "monitoring_dummy", "monitoring", "monitor"];
const PO_AMOUNT_HIDDEN_EMAILS = ["monitoring.progress@adiyasa.com"];
const MONTHLY_PO_TARGET = 10_000_000_000;
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function canViewPoAmount(user?: {
  email?: string | null;
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const email = String(user?.email ?? "").toLowerCase();
  if (PO_AMOUNT_HIDDEN_EMAILS.includes(email) || email.includes("monitor")) return false;

  const role = String(user?.role ?? "").toLowerCase();
  if (PO_AMOUNT_HIDDEN_ROLES.includes(role)) return false;
  if (PO_AMOUNT_VISIBLE_EMAILS.includes(email)) return true;
  if (PO_AMOUNT_VISIBLE_ROLES.includes(role)) return true;

  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (PO_AMOUNT_VISIBLE_DEPARTMENT_CODES.includes(departmentCode)) return true;

  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  return PO_AMOUNT_VISIBLE_DEPARTMENT_NAMES.some((name) =>
    departmentName.includes(name),
  );
}

const PO_MANAGE_ROLES = ["admin", "direktur", "director", "dir", "hr"];
const PO_EDIT_ROLES = [...PO_MANAGE_ROLES, "monitoring_dummy"];
const PO_MANAGE_DEPARTMENT_CODES = ["AAF", "FIN", "MKT", "GA"];
const PO_MANAGE_DEPARTMENT_NAMES = ["finance", "marketing", "general affairs"];
const PO_ACTIVITY_VISIBLE_ROLES = ["admin", "direktur", "director", "dir", "monitoring_dummy"];
const PO_ACTIVITY_VISIBLE_DEPARTMENT_CODES = ["GA"];
const PO_ACTIVITY_VISIBLE_DEPARTMENT_NAMES = ["general affairs"];

function canManagePo(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  if (PO_MANAGE_ROLES.includes(role)) return true;

  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (PO_MANAGE_DEPARTMENT_CODES.includes(departmentCode)) return true;

  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  return PO_MANAGE_DEPARTMENT_NAMES.some((name) =>
    departmentName.includes(name),
  );
}

function canEditPoData(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  if (PO_EDIT_ROLES.includes(role)) return true;
  return canManagePo(user);
}

function isPurchasingOrEngineering(user?: {
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (departmentCode === "PUR" || departmentCode === "ENG") return true;

  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  return (
    departmentName.includes("purchasing") ||
    departmentName.includes("engineering")
  );
}

function canUpdateProjectProgress(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  return canEditPoData(user) || isPurchasingOrEngineering(user);
}

function projectProgressLabel(value: string): string {
  const normalized = normalizeProjectProgress(value);
  return (
    PROJECT_PROGRESS_STAGES.find((stage) => stage.key === normalized)?.label ??
    value
  );
}

function normalizeProjectProgress(
  value: unknown,
  trackingStages?: unknown,
  legacyProgress?: unknown,
  hasPainting = false,
): ProjectProgressKey {
  const rawValue = String(value ?? "").trim().toLowerCase();
  if (PROJECT_PROGRESS_KEYS.has(rawValue)) return rawValue as ProjectProgressKey;
  const mappedValue = LEGACY_PROJECT_PROGRESS_MAP.get(rawValue);
  if (mappedValue && !GENERIC_LEGACY_STATUS_KEYS.has(rawValue)) return mappedValue;

  const completedStages = normalizeTrackingStages(trackingStages);
  for (const stage of [...PROJECT_PROGRESS_STAGES].reverse()) {
    if (
      completedStages.includes(stage.key) ||
      stage.legacyKeys.some((legacyKey) => completedStages.includes(legacyKey))
    ) {
      return stage.key;
    }
  }

  return inferProjectProgressFromPercent(legacyProgress, hasPainting);
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

function getProjectProgressPercent(
  value: unknown,
  trackingStages?: unknown,
  legacyProgress?: unknown,
  hasPainting = false,
): number {
  const normalized = normalizeProjectProgress(
    value,
    trackingStages,
    legacyProgress,
    hasPainting,
  );
  return (
    PROJECT_PROGRESS_STAGES.find((stage) => stage.key === normalized)
      ?.progress ?? 0
  );
}

function isProjectFinished(value: unknown): boolean {
  return ["project_invoiced", "closed"].includes(normalizeProjectProgress(value));
}

function isProjectClosed(value: unknown): boolean {
  return normalizeProjectProgress(value) === "closed";
}

function stageAllowedForPainting(
  stage: ProjectProgressKey,
  hasPainting: boolean,
): boolean {
  return stage !== "painting" || hasPainting;
}

async function getPicDepartment(id: unknown) {
  const departmentId = Number(id);
  if (!Number.isInteger(departmentId)) return null;

  const [department] = await db
    .select({ id: departmentsTable.id, code: departmentsTable.code, name: departmentsTable.name })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, departmentId))
    .limit(1);

  return department ?? null;
}

async function validatePicDepartment(id: unknown): Promise<string | null> {
  const department = await getPicDepartment(id);
  if (!department) return "PIC Departemen wajib dipilih";

  const code = String(department.code ?? "").toUpperCase();
  const name = String(department.name ?? "").toLowerCase();
  if (code === "MKT" || code === "ENG") return null;
  if (name.includes("marketing") || name.includes("engineering")) return null;

  return "PIC Departemen hanya boleh Marketing atau Engineering";
}

function isDateOnly(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getJakartaDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function canViewPoActivity(user?: {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const role = String(user?.role ?? "").toLowerCase();
  if (PO_ACTIVITY_VISIBLE_ROLES.includes(role)) return true;

  const departmentCode = String(user?.departmentCode ?? "").toUpperCase();
  if (PO_ACTIVITY_VISIBLE_DEPARTMENT_CODES.includes(departmentCode)) return true;

  const departmentName = String(user?.departmentName ?? "").toLowerCase();
  return PO_ACTIVITY_VISIBLE_DEPARTMENT_NAMES.some((name) =>
    departmentName.includes(name),
  );
}

function calcSisaHari(targetPengiriman: string, aktualPengiriman?: string | null): number | null {
  if (aktualPengiriman?.trim()) return null;
  if (!isDateOnly(targetPengiriman)) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(`${targetPengiriman}T00:00:00`);
  dl.setHours(0, 0, 0, 0);
  return Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function calcDaysAfterClosed(closedAt?: Date | string | null): number | null {
  if (!closedAt) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const closedDate = new Date(closedAt);
  closedDate.setHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - closedDate.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function isPoEditLocked(po: typeof projectsPoTable.$inferSelect): boolean {
  if (!isProjectClosed(po.status)) return false;

  const daysAfterClosed = calcDaysAfterClosed(po.closedAt);
  return daysAfterClosed !== null && daysAfterClosed >= 30;
}

function getPoEditLockNotice(
  po: typeof projectsPoTable.$inferSelect,
): string | null {
  if (!isPoEditLocked(po)) return null;

  return "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya";
}

function normalizeLogValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function sanitizePoChanges(
  changes: Record<string, { before: unknown; after: unknown }>,
  includeAmount: boolean,
) {
  if (includeAmount) return changes;

  const { poAmount: _poAmount, ...safeChanges } = changes ?? {};
  return safeChanges;
}

function normalizeTrackingStages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const validKeys = new Set(CUSTOMER_TRACKING_STAGE_KEYS);
  return value.map((item) => String(item)).filter((item) => validKeys.has(item as any));
}

function normalizeTrackingTimeline(value: unknown) {
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
    .filter((item): item is { date: string; description: string } =>
      Boolean(item),
    );
}

function buildPoChanges(
  before: Partial<typeof projectsPoTable.$inferSelect> | null,
  after: Partial<typeof projectsPoTable.$inferSelect> | null,
  fields: Array<keyof typeof projectsPoTable.$inferSelect>,
) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  for (const field of fields) {
    const beforeValue = normalizeLogValue(before?.[field]);
    const afterValue = normalizeLogValue(after?.[field]);

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[String(field)] = { before: beforeValue, after: afterValue };
    }
  }

  return changes;
}

async function recordPoChange(options: {
  poId: number | null;
  noPo: string;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  user: { id: number; name?: string | null };
}) {
  await db.insert(poChangeLogsTable).values({
    poId: options.poId,
    noPo: options.noPo,
    action: options.action,
    changes: options.changes,
    changedByUserId: options.user.id,
    changedByName: options.user.name ?? null,
  });
}

async function buildPoItem(
  po: typeof projectsPoTable.$inferSelect,
  options?: { includeAmount?: boolean },
) {
  const targetPengiriman = po.targetPengiriman || po.deadline;
  const aktualPengiriman =
    po.aktualPengiriman || (po.targetPenyelesaian ? String(po.targetPenyelesaian) : null);
  const sisaHari = calcSisaHari(targetPengiriman, aktualPengiriman);
  const targetValid = isDateOnly(targetPengiriman);
  const actualValid = isDateOnly(aktualPengiriman);
  const comparisonDate = aktualPengiriman || getJakartaDateString();
  let deliveryStatus = "Tanggal Belum Valid";
  let delayDays: number | null = null;
  if (targetValid && (!aktualPengiriman || actualValid)) {
    const difference = Math.round(
      (new Date(`${comparisonDate}T00:00:00`).getTime() -
        new Date(`${targetPengiriman}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    delayDays = Math.max(0, difference);
    deliveryStatus = difference > 0 ? `Delay ${difference} hari` : "On Time";
  }
  const computedStatus = normalizeProjectProgress(
    po.status,
    po.trackingStages,
    po.progress,
    po.hasPainting,
  );
  const computedProgress = getProjectProgressPercent(
    computedStatus,
    po.trackingStages,
    po.progress,
    po.hasPainting,
  );
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
    qty: po.qty,
    ...(options?.includeAmount
      ? { poAmount: po.poAmount ? Number(po.poAmount) : 0 }
      : {}),
    tanggalPoMasuk: po.tanggalPoMasuk,
    targetPenyelesaian: po.targetPenyelesaian,
    deadline: po.deadline,
    targetPengiriman,
    aktualPengiriman,
    deliveryStatus,
    delayDays,
    aktualPengirimanBelumDiisi: !aktualPengiriman,
    sisaHari,
    picUserId: po.picUserId,
    picName,
    picProject: po.picProject,
    departmentId: po.departmentId,
    departmentName: deptName,
    status: computedStatus,
    statusLabel: projectProgressLabel(computedStatus),
    progress: computedProgress,
    hasPainting: po.hasPainting,
    trackingStages: normalizeTrackingStages(po.trackingStages),
    trackingTimeline: normalizeTrackingTimeline(po.trackingTimeline),
    catatan: po.catatan,
    closedAt: po.closedAt ? po.closedAt.toISOString() : null,
    isEditLocked: isPoEditLocked(po),
    editLockNotice: getPoEditLockNotice(po),
    createdByUserId: po.createdByUserId,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
  };
}

async function sendDeadlineNotifications(
  po: typeof projectsPoTable.$inferSelect,
) {
  const targetPengiriman = po.targetPengiriman || po.deadline;
  const aktualPengiriman =
    po.aktualPengiriman || (po.targetPenyelesaian ? String(po.targetPenyelesaian) : null);
  const sisaHari = calcSisaHari(targetPengiriman, aktualPengiriman);
  if (sisaHari === null) return;
  if (isProjectClosed(po.status)) return;

  const recipients: number[] = [];
  if (po.picUserId) recipients.push(po.picUserId);
  if (po.createdByUserId && !recipients.includes(po.createdByUserId))
    recipients.push(po.createdByUserId);

  if (sisaHari < 0 && !po.notifiedPassed) {
    const leadershipRecipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.role}) in ('admin', 'direktur', 'director')`);

    for (const recipient of leadershipRecipients) {
      if (!recipients.includes(recipient.id)) {
        recipients.push(recipient.id);
      }
    }

    for (const uid of recipients) {
      await db.insert(notificationsTable).values({
        userId: uid,
        type: "po_overdue",
        title: `Target Pengiriman PO Terlewat: ${po.noPo}`,
        message: `Project "${po.namaProject}" telah melewati Target Pengiriman (${targetPengiriman}). Segera tindak lanjut!`,
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
        title: `Target Pengiriman Mendekat: ${po.noPo}`,
        message: `Project "${po.namaProject}" akan mencapai Target Pengiriman dalam ${sisaHari} hari (${targetPengiriman}). Percepat penyelesaian!`,
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
        title: `Reminder Target Pengiriman: ${po.noPo}`,
        message: `Project "${po.namaProject}" akan mencapai Target Pengiriman dalam ${sisaHari} hari (${targetPengiriman}).`,
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
  const targetPeriodStart = new Date(year, month - 2, 21);
  const targetPeriodEnd = new Date(year, month - 1, 20);
  const targetStartDate = targetPeriodStart.toISOString().split("T")[0];
  const targetEndDate = targetPeriodEnd.toISOString().split("T")[0];

  const pos = await db.select().from(projectsPoTable);

  const totalPo = pos.length;
  const poSelesai = pos.filter((p) => isProjectFinished(p.status)).length;
  const poBelumSelesai = totalPo - poSelesai;
  const poDelay = pos.filter(
    (p) =>
      ((calcSisaHari(
        p.targetPengiriman || p.deadline,
        p.aktualPengiriman || (p.targetPenyelesaian ? String(p.targetPenyelesaian) : null),
      ) ?? Number.POSITIVE_INFINITY) < 0 &&
        !isProjectClosed(p.status)),
  ).length;
  const poHampirDeadline = pos.filter((p) => {
    const s = calcSisaHari(
      p.targetPengiriman || p.deadline,
      p.aktualPengiriman || (p.targetPenyelesaian ? String(p.targetPenyelesaian) : null),
    );
    if (s === null) return false;
    return s >= 0 && s <= 7 && !isProjectClosed(p.status);
  }).length;
  const monthlyTarget = MONTHLY_PO_TARGET;
  const canSeeAmount = canViewPoAmount(user);
  const targetPos = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        gte(projectsPoTable.tanggalPoMasuk, targetStartDate),
        lte(projectsPoTable.tanggalPoMasuk, targetEndDate),
      ),
    );

  const totalNominal = targetPos.reduce(
    (sum, p) => sum + Number(p.poAmount ?? 0),
    0,
  );
  const persentasePencapaian = Number(
    (monthlyTarget > 0 ? (totalNominal / monthlyTarget) * 100 : 0).toFixed(2),
  );

  res.json({
    canViewAmount: canSeeAmount,
    totalPo,
    poSelesai,
    poBelumSelesai,
    poDelay,
    poHampirDeadline,
    ...(canSeeAmount ? { totalNominal, monthlyTarget } : {}),
    persentasePencapaian,
    targetMonthName: MONTH_NAMES[month - 1] ?? String(month),
    targetStartDate,
    targetEndDate,
    month,
    year,
  });
});

router.get("/po/activity", async (req, res) => {
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

  if (!canViewPoActivity(user)) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const canSeeAmount = canViewPoAmount(user);
  const logs = await db
    .select()
    .from(poChangeLogsTable)
    .orderBy(desc(poChangeLogsTable.createdAt))
    .limit(30);

  res.json(
    logs.map((log) => ({
      id: log.id,
      poId: log.poId,
      noPo: log.noPo,
      action: log.action,
      changes: sanitizePoChanges(log.changes, canSeeAmount),
      changedByUserId: log.changedByUserId,
      changedByName: log.changedByName,
      createdAt: log.createdAt.toISOString(),
    })),
  );
});

router.get("/po/internal-comments", async (req, res) => {
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
      id: poInternalCommentsTable.id,
      poId: poInternalCommentsTable.poId,
      userId: poInternalCommentsTable.userId,
      userName: poInternalCommentsTable.userName,
      userRole: poInternalCommentsTable.userRole,
      userDepartment: poInternalCommentsTable.userDepartment,
      comment: poInternalCommentsTable.comment,
      createdAt: poInternalCommentsTable.createdAt,
      noPo: projectsPoTable.noPo,
      namaProject: projectsPoTable.namaProject,
    })
    .from(poInternalCommentsTable)
    .leftJoin(projectsPoTable, eq(poInternalCommentsTable.poId, projectsPoTable.id))
    .orderBy(desc(poInternalCommentsTable.createdAt))
    .limit(50);

  res.json(
    comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    })),
  );
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

  const { month, year, status, departmentId, picUserId, customer, search, dateFrom, dateTo, openOnly } = req.query;

  const conditions = [];
  if (month && year) {
    const m = parseInt(month as string);
    const y = parseInt(year as string);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0).toISOString().split("T")[0];
    conditions.push(gte(projectsPoTable.tanggalPoMasuk, startDate));
    conditions.push(lte(projectsPoTable.tanggalPoMasuk, endDate));
  }
  if (dateFrom) conditions.push(gte(projectsPoTable.tanggalPoMasuk, String(dateFrom)));
  if (dateTo) conditions.push(lte(projectsPoTable.tanggalPoMasuk, String(dateTo)));
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
  if (customer) {
    conditions.push(like(sql`coalesce(${projectsPoTable.customer}, '')`, `%${customer}%`));
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
    pos.map((po) => buildPoItem(po, { includeAmount: canViewPoAmount(user) })),
  );

  const filteredByStatus =
    status && status !== "semua"
      ? items.filter(
          (item) =>
            item.status === normalizeProjectProgress(String(status)),
        )
      : items;
  const filteredItems =
    String(openOnly) === "true"
      ? filteredByStatus.filter((item) => item.status !== "closed")
      : filteredByStatus;

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

  if (!canManagePo(user)) {
    res.status(403).json({
      error:
        "Hanya Admin/Direktur atau departemen terkait yang dapat menambah PO",
    });
    return;
  }

  const {
    noPo,
    namaProject,
    customer,
    qty,
    poAmount,
    tanggalPoMasuk,
    targetPenyelesaian,
    deadline,
    tanggal_Delivery,
    targetPengiriman,
    aktualPengiriman,
    picUserId,
    picProject,
    departmentId,
    status,
    progress,
    hasPainting,
    trackingStages,
    trackingTimeline,
    catatan,
  } = req.body;
  const targetValue = targetPengiriman ?? deadline ?? tanggal_Delivery;
  const usesPainting = Boolean(hasPainting);
  const parsedStatus = normalizeProjectProgress(status ?? "po_received");
  const parsedProgress = getProjectProgressPercent(parsedStatus);

  if (progress !== undefined) {
    res.status(400).json({
      error: "Progress persen tidak bisa diinput manual",
    });
    return;
  }

  if (!noPo || !namaProject || !tanggalPoMasuk || !targetValue) {
    res.status(400).json({
      error: "No PO, nama project, Tanggal Masuk PO, dan Target Pengiriman diperlukan",
    });
    return;
  }

  const picDepartmentError = await validatePicDepartment(departmentId);
  if (picDepartmentError) {
    res.status(400).json({ error: picDepartmentError });
    return;
  }

  if (!stageAllowedForPainting(parsedStatus, usesPainting)) {
    res.status(400).json({
      error: "Project Progress Painting hanya boleh dipilih jika Painting dicentang",
    });
    return;
  }

  const [po] = await db
    .insert(projectsPoTable)
    .values({
      noPo,
      namaProject,
      customer: customer ?? null,
      qty: qty ?? null,
      poAmount:
        canViewPoAmount(user) && poAmount !== undefined && poAmount !== ""
          ? String(poAmount)
          : null,
      tanggalPoMasuk,
      targetPenyelesaian: targetPenyelesaian ?? null,
      deadline: String(targetValue).trim(),
      targetPengiriman: String(targetValue).trim(),
      aktualPengiriman: aktualPengiriman ? String(aktualPengiriman).trim() : null,
      picUserId: picUserId ? parseInt(picUserId) : null,
      picProject: picProject ? String(picProject).trim() : null,
      departmentId: departmentId ? parseInt(departmentId) : null,
      status: parsedStatus,
      progress: parsedProgress,
      hasPainting: usesPainting,
      trackingStages: normalizeTrackingStages(trackingStages),
      trackingTimeline: normalizeTrackingTimeline(trackingTimeline),
      ...(parsedStatus === "closed"
        ? { closedAt: new Date(), closedByUserId: user.id }
        : {}),
      catatan: catatan ?? null,
      createdByUserId: user.id,
    })
    .returning();

  await sendDeadlineNotifications(po);
  await recordPoChange({
    poId: po.id,
    noPo: po.noPo,
    action: "created",
    user,
    changes: buildPoChanges(null, po, [
      "noPo",
      "namaProject",
      "customer",
      "qty",
      "poAmount",
      "tanggalPoMasuk",
      "targetPenyelesaian",
      "deadline",
      "targetPengiriman",
      "aktualPengiriman",
      "picUserId",
      "picProject",
      "departmentId",
      "status",
      "progress",
      "hasPainting",
      "trackingStages",
      "trackingTimeline",
      "catatan",
    ]),
  });
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

  const hasFullManagePermission = canEditPoData(user);
  const hasProgressPermission = canUpdateProjectProgress(user);

  if (!hasProgressPermission) {
    res.status(403).json({
      error:
        "Hanya Admin/Direktur atau departemen terkait yang dapat mengubah PO",
    });
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

  if (isPoEditLocked(existing) && user.role !== "admin") {
    res.status(403).json({
      error:
        "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya",
    });
    return;
  }

  const updates: Partial<typeof projectsPoTable.$inferInsert> = {};
  const {
    noPo,
    namaProject,
    customer,
    qty,
    poAmount,
    tanggalPoMasuk,
    targetPenyelesaian,
    deadline,
    tanggal_Delivery,
    targetPengiriman,
    aktualPengiriman,
    picUserId,
    picProject,
    departmentId,
    status,
    progress,
    hasPainting,
    trackingStages,
    trackingTimeline,
    catatan,
  } = req.body;

  if (!hasFullManagePermission) {
    const fullEditFields = [
      noPo,
      namaProject,
      customer,
      qty,
      poAmount,
      tanggalPoMasuk,
      targetPenyelesaian,
      deadline,
      tanggal_Delivery,
      picUserId,
      picProject,
      departmentId,
      progress,
      targetPengiriman,
      aktualPengiriman,
      catatan,
    ];
    if (fullEditFields.some((value) => value !== undefined)) {
      res.status(403).json({
        error: "Engineering/Purchasing hanya boleh mengubah Project Progress, Painting, dan Timeline Customer",
      });
      return;
    }
  }

  if (progress !== undefined) {
    res.status(400).json({
      error: "Progress persen tidak bisa diinput manual",
    });
    return;
  }

  if (hasFullManagePermission) {
    if (noPo !== undefined) updates.noPo = noPo;
    if (namaProject !== undefined) updates.namaProject = namaProject;
    if (customer !== undefined) updates.customer = customer;
    if (qty !== undefined) updates.qty = qty;
    if (poAmount !== undefined && canViewPoAmount(user)) {
      updates.poAmount =
        poAmount === "" || poAmount === null ? null : String(poAmount);
    }
    if (tanggalPoMasuk !== undefined) updates.tanggalPoMasuk = tanggalPoMasuk;
    if (targetPenyelesaian !== undefined)
      updates.targetPenyelesaian = targetPenyelesaian || null;
    const targetValue = targetPengiriman ?? deadline ?? tanggal_Delivery;
    if (targetValue !== undefined) {
      const normalizedTargetValue = String(targetValue).trim();
      if (!normalizedTargetValue) {
        res.status(400).json({ error: "Target Pengiriman wajib diisi" });
        return;
      }
      updates.deadline = normalizedTargetValue;
      updates.targetPengiriman = normalizedTargetValue;
    }
    if (aktualPengiriman !== undefined)
      updates.aktualPengiriman = aktualPengiriman ? String(aktualPengiriman).trim() : null;
    if (picProject !== undefined)
      updates.picProject = picProject ? String(picProject).trim() : null;
    if (departmentId !== undefined) {
      const picDepartmentError = await validatePicDepartment(departmentId);
      if (picDepartmentError) {
        res.status(400).json({ error: picDepartmentError });
        return;
      }
      updates.departmentId = departmentId ? parseInt(departmentId) : null;
    }
    if (hasPainting !== undefined) updates.hasPainting = Boolean(hasPainting);
    if (trackingStages !== undefined)
      updates.trackingStages = normalizeTrackingStages(trackingStages);
    if (trackingTimeline !== undefined)
      updates.trackingTimeline = normalizeTrackingTimeline(trackingTimeline);
    if (catatan !== undefined) updates.catatan = catatan;
  }

  if (hasFullManagePermission && picUserId !== undefined)
    updates.picUserId = picUserId ? parseInt(picUserId) : null;

  if (!hasFullManagePermission && isPurchasingOrEngineering(user)) {
    if (hasPainting !== undefined) updates.hasPainting = Boolean(hasPainting);
    if (trackingStages !== undefined)
      updates.trackingStages = normalizeTrackingStages(trackingStages);
    if (trackingTimeline !== undefined)
      updates.trackingTimeline = normalizeTrackingTimeline(trackingTimeline);
  }

  if (status !== undefined) {
    const nextStatus = normalizeProjectProgress(status);
    const nextHasPainting =
      updates.hasPainting !== undefined
        ? Boolean(updates.hasPainting)
        : Boolean(existing.hasPainting);

    if (!stageAllowedForPainting(nextStatus, nextHasPainting)) {
      res.status(400).json({
        error:
          "Project Progress Painting hanya boleh dipilih jika Painting dicentang",
      });
      return;
    }

    updates.status = nextStatus;
    updates.progress = getProjectProgressPercent(nextStatus);

    if (nextStatus === "closed" && !existing.closedAt) {
      updates.closedAt = new Date();
      updates.closedByUserId = user.id;
    }

    if (nextStatus !== "closed") {
      updates.closedAt = null;
      updates.closedByUserId = null;
    }
  }

  if (updates.hasPainting === false) {
    const effectiveStatus = normalizeProjectProgress(
      updates.status ?? existing.status,
      updates.trackingStages ?? existing.trackingStages,
    );
    if (effectiveStatus === "painting") {
      res.status(400).json({
        error: "Status Painting tidak boleh dipilih jika Painting tidak aktif",
      });
      return;
    }
  }

  const [updated] = await db
    .update(projectsPoTable)
    .set(updates)
    .where(eq(projectsPoTable.id, id))
    .returning();
  await sendDeadlineNotifications(updated);
  const changes = buildPoChanges(existing, updated, [
    "noPo",
    "namaProject",
    "customer",
    "qty",
    "poAmount",
    "tanggalPoMasuk",
    "targetPenyelesaian",
    "deadline",
    "targetPengiriman",
    "aktualPengiriman",
    "picUserId",
    "picProject",
    "departmentId",
    "status",
    "progress",
    "hasPainting",
    "trackingStages",
    "trackingTimeline",
    "catatan",
    "closedAt",
    "closedByUserId",
  ]);

  if (Object.keys(changes).length > 0) {
    await recordPoChange({
      poId: updated.id,
      noPo: updated.noPo,
      action: "updated",
      user,
      changes,
    });
  }
  const item = await buildPoItem(updated, {
    includeAmount: canViewPoAmount(user),
  });
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

  if (!canManagePo(user)) {
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

  if (isPoEditLocked(po) && user.role !== "admin") {
    res.status(403).json({
      error:
        "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya",
    });
    return;
  }

  const [updated] = await db
    .update(projectsPoTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      closedByUserId: user.id,
      progress: 100,
    })
    .where(eq(projectsPoTable.id, id))
    .returning();

  await recordPoChange({
    poId: updated.id,
    noPo: updated.noPo,
    action: "closed",
    user,
    changes: buildPoChanges(po, updated, ["status", "progress", "closedAt", "closedByUserId"]),
  });

  const item = await buildPoItem(updated, {
    includeAmount: canViewPoAmount(user),
  });
  res.json(item);
});

router.delete("/po/:id", async (req, res) => {
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

  if (!canManagePo(user)) {
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

  if (isPoEditLocked(po) && user.role !== "admin") {
    res.status(403).json({
      error:
        "PO yang sudah selesai tidak bisa di edit kembali setelah 30 hari setelahnya",
    });
    return;
  }

  await db.delete(projectsPoTable).where(eq(projectsPoTable.id, id));
  await recordPoChange({
    poId: null,
    noPo: po.noPo,
    action: "deleted",
    user,
    changes: buildPoChanges(po, null, [
      "noPo",
      "namaProject",
      "customer",
      "qty",
      "poAmount",
      "tanggalPoMasuk",
      "targetPenyelesaian",
      "deadline",
      "picUserId",
      "picProject",
      "departmentId",
      "status",
      "progress",
      "hasPainting",
      "catatan",
    ]),
  });
  res.json({ success: true, message: "PO berhasil dihapus" });
});

export default router;
