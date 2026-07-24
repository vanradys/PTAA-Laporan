import {
  and,
  db,
  departmentsTable,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  notificationsTable,
  or,
  poChangeLogsTable,
  poInternalCommentsTable,
  poNotesTable,
  projectsPoTable,
  sql,
  usersTable,
} from "@workspace/db";
import { getSessionTokenFromRequest, getUserFromToken } from "./auth";
import { Router } from "express";
import { canEditByPermission } from "../services/editPermissions";
import { ensureProjectsPoCustomerFieldsSchema } from "../services/projectsPoSchema";

const router = Router();

router.use(async (_req, _res, next) => {
  try {
    await ensureProjectsPoCustomerFieldsSchema();
    next();
  } catch (error) {
    next(error);
  }
});

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
const FULL_ACCESS_ROLES = ["admin", "direktur", "director", "dir"];
const PO_AMOUNT_HIDDEN_ROLES = ["admin_marketing", "monitoring_dummy", "monitoring", "monitor"];
const PO_AMOUNT_HIDDEN_EMAILS = ["monitoring.progress@adiyasa.com"];
const MONTHLY_PO_TARGET = 3_000_000_000;
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
const ALLOWED_PIC_EMAILS = new Set([
  "marketing@adiyasa.com",
  "engineering1@adiyasa.com",
  "engineering2@adiyasa.com",
]);

function normalizeCustomerName(value: unknown): string | null {
  const customer = String(value ?? "").trim();
  if (!customer) return null;
  return customer.replace(/^PT\s*\.\s*/i, "PT ");
}

function normalizeFlexibleSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canViewPoAmount(user?: {
  email?: string | null;
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): boolean {
  const email = String(user?.email ?? "").toLowerCase();
  const role = String(user?.role ?? "").toLowerCase();
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (PO_AMOUNT_HIDDEN_EMAILS.includes(email) || email.includes("monitor")) return false;

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
const PO_NOTE_DELETE_ALL_ROLES = ["admin", "direktur", "director", "dir", "monitoring_dummy", "monitoring", "monitor"];

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

async function getAllowedPicUser(id: unknown) {
  const userId = Number(id);
  if (!Number.isInteger(userId)) return null;

  const [pic] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      departmentId: usersTable.departmentId,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!pic?.isActive || !ALLOWED_PIC_EMAILS.has(pic.email.toLowerCase())) return null;
  return pic;
}

function isDateOnly(value: string | null | undefined): value is string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getJakartaDateString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
}

function dateOnlyToUtcTime(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
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

  return Math.round(
    (dateOnlyToUtcTime(targetPengiriman) -
      dateOnlyToUtcTime(getJakartaDateString())) /
      (1000 * 60 * 60 * 24),
  );
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

function canDeleteAnyPoNote(user?: { role?: string | null }) {
  const role = String(user?.role ?? "").toLowerCase();
  return PO_NOTE_DELETE_ALL_ROLES.includes(role);
}

function canMutateOwnPoNote(
  user: { id: number },
  note: { userId?: number | null; createdByUserId?: number | null },
) {
  return note.userId === user.id || note.createdByUserId === user.id;
}

function summarizePoNote(note: string) {
  const compact = note.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

async function notifyPoNoteRecipients(options: {
  po: Pick<typeof projectsPoTable.$inferSelect, "noPo" | "namaProject">;
  fromName: string;
  note: string;
}) {
  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  if (recipients.length === 0) return;

  await db.insert(notificationsTable).values(recipients.map((recipient) => ({
    userId: recipient.id,
    type: "po_note",
    title: `Catatan internal baru pada PO ${options.po.noPo}`,
    message: `Catatan internal baru pada PO ${options.po.noPo}/${options.po.namaProject} dari ${options.fromName}: ${summarizePoNote(options.note)}.`,
    isRead: false,
  })));
}

function serializePoNote(note: typeof poNotesTable.$inferSelect) {
  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

async function buildPoItem(
  po: typeof projectsPoTable.$inferSelect,
  options?: { includeAmount?: boolean },
) {
  const targetPengiriman = po.targetPengiriman || po.deadline;
  const aktualPengiriman = po.aktualPengiriman;
  const sisaHari = calcSisaHari(targetPengiriman, aktualPengiriman);
  const targetValid = isDateOnly(targetPengiriman);
  const actualValid = isDateOnly(aktualPengiriman);
  const comparisonDate = aktualPengiriman || getJakartaDateString();
  let deliveryStatus = "Tanggal Belum Valid";
  let delayDays: number | null = null;
  if (targetValid && (!aktualPengiriman || actualValid)) {
    const difference = Math.round(
      (dateOnlyToUtcTime(comparisonDate) -
        dateOnlyToUtcTime(targetPengiriman)) /
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
    projectIssueAction: po.projectIssueAction,
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
  const aktualPengiriman = po.aktualPengiriman;
  const sisaHari = calcSisaHari(targetPengiriman, aktualPengiriman);
  if (sisaHari === null) return;
  if (isProjectClosed(po.status)) return;

  const candidateRecipientIds = Array.from(
    new Set(
      [po.picUserId, po.createdByUserId].filter(
        (userId): userId is number => typeof userId === "number",
      ),
    ),
  );
  const candidateRecipients = candidateRecipientIds.length > 0
    ? await db
        .select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(inArray(usersTable.id, candidateRecipientIds))
    : [];
  const recipients = candidateRecipients
    .filter((recipient) => String(recipient.role).toLowerCase() !== "admin")
    .map((recipient) => recipient.id);

  if (sisaHari < 0 && !po.notifiedPassed) {
    const leadershipRecipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(${usersTable.role}) in ('direktur', 'director')`);

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

  const now = new Date();
  const month = parseInt(req.query.month as string) || now.getMonth() + 1;
  const year = parseInt(req.query.year as string) || now.getFullYear();
  const targetStartDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const targetEndDate = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  ).padStart(2, "0")}`;

  const pos = await db.select().from(projectsPoTable);

  const totalPo = pos.length;
  const poSelesai = pos.filter((p) => isProjectClosed(p.status)).length;
  const ongoingPos = pos.filter((p) => !isProjectClosed(p.status));
  const poBelumSelesai = ongoingPos.length;
  const poDelay = ongoingPos.filter(
    (p) =>
      (calcSisaHari(
        p.targetPengiriman || p.deadline,
        p.aktualPengiriman,
      ) ?? Number.POSITIVE_INFINITY) < 0,
  ).length;
  const poHampirDeadline = ongoingPos.filter((p) => {
    const s = calcSisaHari(
      p.targetPengiriman || p.deadline,
      p.aktualPengiriman,
    );
    if (s === null) return false;
    return s >= 0 && s <= 7;
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
    canViewAmount: true,
    canViewPoListAmount: canSeeAmount,
    totalPo,
    poSelesai,
    poBelumSelesai,
    poDelay,
    poHampirDeadline,
    totalNominal,
    monthlyTarget,
    persentasePencapaian,
    targetMonthName: MONTH_NAMES[month - 1] ?? String(month),
    targetStartDate,
    targetEndDate,
    month,
    year,
  });
});

router.get("/po/activity", async (req, res) => {
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

  const { month, year, status, departmentId, picUserId, customer, search, dateFrom, dateTo, openOnly, nominalSort } = req.query;

  const conditions = [];
  if (month && year) {
    const m = parseInt(month as string);
    const y = parseInt(year as string);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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
    const normalizedSearch = normalizeFlexibleSearch(search);
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(
        or(
          sql`regexp_replace(lower(coalesce(${projectsPoTable.noPo}, '')), '[^a-z0-9]+', '', 'g') like ${pattern}`,
          sql`regexp_replace(lower(coalesce(${projectsPoTable.namaProject}, '')), '[^a-z0-9]+', '', 'g') like ${pattern}`,
          sql`regexp_replace(lower(coalesce(${projectsPoTable.customer}, '')), '[^a-z0-9]+', '', 'g') like ${pattern}`,
        ),
      );
    }
  }
  if (customer) {
    conditions.push(like(sql`coalesce(${projectsPoTable.customer}, '')`, `%${customer}%`));
  }

  const pos = await db
    .select()
    .from(projectsPoTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(projectsPoTable.deadline);

  if (canViewPoAmount(user) && (nominalSort === "asc" || nominalSort === "desc")) {
    pos.sort((left, right) => {
      const difference = Number(left.poAmount ?? 0) - Number(right.poAmount ?? 0);
      return nominalSort === "asc" ? difference : -difference;
    });
  }

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
      ? filteredByStatus.filter((item) => !isProjectClosed(item.status))
      : filteredByStatus;

  res.json(filteredItems);
});

router.post("/po", async (req, res) => {
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

  if (!(await canEditByPermission(user, "po_create"))) {
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
    projectIssueAction,
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

  if (!noPo || !namaProject || !normalizeCustomerName(customer) || !tanggalPoMasuk || !targetValue) {
    res.status(400).json({
      error: "No PO, nama project, customer, Tanggal Masuk PO, dan Target Pengiriman diperlukan",
    });
    return;
  }

  const selectedPic = await getAllowedPicUser(picUserId);
  if (!selectedPic || !selectedPic.departmentId) {
    res.status(400).json({
      error: "PIC Departemen hanya boleh Admin Marketing 1, Engineering 1, atau Engineering 2",
    });
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
      customer: normalizeCustomerName(customer),
      qty: qty ?? null,
      poAmount:
        canViewPoAmount(user) && poAmount !== undefined && poAmount !== ""
          ? String(poAmount)
          : null,
      tanggalPoMasuk,
      targetPenyelesaian: null,
      deadline: String(targetValue).trim(),
      targetPengiriman: String(targetValue).trim(),
      aktualPengiriman: aktualPengiriman ? String(aktualPengiriman).trim() : null,
      picUserId: selectedPic.id,
      picProject: picProject ? String(picProject).trim() : null,
      departmentId: selectedPic.departmentId,
      status: parsedStatus,
      progress: parsedProgress,
      hasPainting: usesPainting,
      trackingStages: normalizeTrackingStages(trackingStages),
      trackingTimeline: normalizeTrackingTimeline(trackingTimeline),
      projectIssueAction: projectIssueAction
        ? String(projectIssueAction).trim()
        : null,
      ...(parsedStatus === "closed"
        ? { closedAt: new Date(), closedByUserId: user.id }
        : {}),
      catatan: catatan ?? null,
      createdByUserId: user.id,
    })
    .returning();

  const initialNote = String(catatan ?? "").trim();
  if (initialNote) {
    await db.insert(poNotesTable).values({
      poId: po.id,
      userId: user.id,
      userName: user.name ?? "User",
      note: initialNote,
    });
    await notifyPoNoteRecipients({
      po,
      fromName: user.name ?? "User",
      note: initialNote,
    });
  }

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
      "projectIssueAction",
    ]),
  });
  const item = await buildPoItem(po, {
    includeAmount: canViewPoAmount(user),
  });
  res.status(201).json(item);
});

router.get("/po/yearly-trend", async (req, res) => {
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

  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const canSeeAmount = canViewPoAmount(user);

  const pos = await db
    .select()
    .from(projectsPoTable)
    .where(
      and(
        gte(projectsPoTable.tanggalPoMasuk, startDate),
        lte(projectsPoTable.tanggalPoMasuk, endDate),
      ),
    );

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

    const totalAmount = monthlyPos.reduce((sum, po) => sum + Number(po.poAmount ?? 0), 0);

    return {
      month,
      monthNumber,
      totalPo: monthlyPos.length,
      totalAmount,
      targetAmount: MONTHLY_PO_TARGET,
    };
  });

  res.json({
    year,
    canViewAmount: true,
    canViewPoListAmount: canSeeAmount,
    items: trend,
  });
});

router.get("/po/:id", async (req, res) => {
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

router.get("/po/:id/notes", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const poId = Number(req.params.id);
  if (!Number.isInteger(poId)) { res.status(400).json({ error: "ID PO tidak valid" }); return; }
  const notes = await db.select().from(poNotesTable)
    .where(eq(poNotesTable.poId, poId))
    .orderBy(poNotesTable.createdAt);
  res.json(notes.map((note) => ({
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  })));
});

router.post("/po/:id/notes", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const poId = Number(req.params.id);
  if (!Number.isInteger(poId)) { res.status(400).json({ error: "ID PO tidak valid" }); return; }
  const note = String(req.body?.note ?? "").trim();
  if (!note) { res.status(400).json({ error: "Isi catatan wajib diisi" }); return; }
  const [po] = await db.select({
    id: projectsPoTable.id,
    noPo: projectsPoTable.noPo,
    namaProject: projectsPoTable.namaProject,
  }).from(projectsPoTable)
    .where(eq(projectsPoTable.id, poId)).limit(1);
  if (!po) { res.status(404).json({ error: "PO tidak ditemukan" }); return; }
  const [created] = await db.insert(poNotesTable).values({
    poId,
    userId: user.id,
    userName: user.name ?? "User",
    note,
  }).returning();
  await recordPoChange({
    poId,
    noPo: po.noPo,
    action: "note_created",
    user,
    changes: { catatan: { before: null, after: note } },
  });
  await notifyPoNoteRecipients({
    po,
    fromName: user.name ?? "User",
    note,
  });
  res.status(201).json(serializePoNote(created));
});

router.patch("/po/:poId/notes/:noteId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const note = String(req.body?.note ?? "").trim();
  if (!note) { res.status(400).json({ error: "Isi catatan wajib diisi" }); return; }
  const poId = Number(req.params.poId);
  const noteId = Number(req.params.noteId);
  if (!Number.isInteger(poId) || !Number.isInteger(noteId)) {
    res.status(400).json({ error: "ID catatan PO tidak valid" });
    return;
  }
  const [existing] = await db
    .select({
      id: poNotesTable.id,
      poId: poNotesTable.poId,
      userId: poNotesTable.userId,
      note: poNotesTable.note,
      noPo: projectsPoTable.noPo,
      createdByUserId: projectsPoTable.createdByUserId,
    })
    .from(poNotesTable)
    .innerJoin(projectsPoTable, eq(poNotesTable.poId, projectsPoTable.id))
    .where(and(
      eq(poNotesTable.id, noteId),
      eq(poNotesTable.poId, poId),
    ))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Catatan tidak ditemukan" }); return; }
  const canManageNotes = await canEditByPermission(user, "po_manage_notes");
  if (!canMutateOwnPoNote(user, existing) && !canManageNotes) {
    res.status(403).json({ error: "Tidak punya izin untuk mengedit catatan PO ini" }); return;
  }
  const [updated] = await db.update(poNotesTable).set({ note, updatedAt: new Date() })
    .where(and(
      eq(poNotesTable.id, noteId),
      eq(poNotesTable.poId, poId),
    )).returning();
  if (!updated) { res.status(404).json({ error: "Catatan tidak ditemukan" }); return; }
  await recordPoChange({
    poId,
    noPo: existing.noPo,
    action: "note_updated",
    user,
    changes: { catatan: { before: existing.note, after: note } },
  });
  res.json(serializePoNote(updated));
});

router.delete("/po/:poId/notes/:noteId", async (req, res) => {
  const token = getSessionTokenFromRequest(req);
  const user = token ? await getUserFromToken(token) : null;
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const poId = Number(req.params.poId);
  const noteId = Number(req.params.noteId);
  if (!Number.isInteger(poId) || !Number.isInteger(noteId)) {
    res.status(400).json({ error: "ID catatan PO tidak valid" });
    return;
  }
  const [existing] = await db
    .select({
      id: poNotesTable.id,
      poId: poNotesTable.poId,
      userId: poNotesTable.userId,
      note: poNotesTable.note,
      noPo: projectsPoTable.noPo,
      createdByUserId: projectsPoTable.createdByUserId,
    })
    .from(poNotesTable)
    .innerJoin(projectsPoTable, eq(poNotesTable.poId, projectsPoTable.id))
    .where(and(
      eq(poNotesTable.id, noteId),
      eq(poNotesTable.poId, poId),
    ))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Catatan tidak ditemukan" }); return; }
  const canManageNotes = await canEditByPermission(user, "po_manage_notes");
  if (!canMutateOwnPoNote(user, existing) && !canDeleteAnyPoNote(user) && !canManageNotes) {
    res.status(403).json({ error: "Tidak punya izin untuk menghapus catatan PO ini" }); return;
  }
  const [deleted] = await db.delete(poNotesTable).where(and(
    eq(poNotesTable.id, noteId),
    eq(poNotesTable.poId, poId),
  )).returning();
  if (!deleted) { res.status(404).json({ error: "Catatan tidak ditemukan" }); return; }
  await recordPoChange({
    poId,
    noPo: existing.noPo,
    action: "note_deleted",
    user,
    changes: { catatan: { before: existing.note, after: null } },
  });
  res.json({ success: true });
});

router.patch("/po/:id", async (req, res) => {
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

  const hasFullManagePermission = await canEditByPermission(user, "po_edit_data");
  const hasProgressPermission = await canEditByPermission(user, "po_update_progress");
  const hasTimelinePermission = await canEditByPermission(user, "po_edit_customer_timeline");
  const canEditIssueAction = hasFullManagePermission || hasProgressPermission;

  if (!hasFullManagePermission && !hasProgressPermission && !hasTimelinePermission) {
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
    projectIssueAction,
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
  if (!hasProgressPermission) {
    const progressFields = [status, hasPainting, trackingStages];
    if (progressFields.some((value) => value !== undefined)) {
      res.status(403).json({
        error: "Tidak diizinkan mengubah Project Progress",
      });
      return;
    }
  }
  if (!hasTimelinePermission && trackingTimeline !== undefined) {
    res.status(403).json({
      error: "Tidak diizinkan mengubah Timeline Customer",
    });
    return;
  }
  if (!canEditIssueAction && projectIssueAction !== undefined) {
    res.status(403).json({
      error: "Tidak diizinkan mengubah Project Issue & Action internal",
    });
    return;
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
    if (customer !== undefined) updates.customer = normalizeCustomerName(customer);
    if (qty !== undefined) updates.qty = qty;
    if (poAmount !== undefined && canViewPoAmount(user)) {
      updates.poAmount =
        poAmount === "" || poAmount === null ? null : String(poAmount);
    }
    if (tanggalPoMasuk !== undefined) updates.tanggalPoMasuk = tanggalPoMasuk;
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
    // Catatan baru disimpan sebagai item terpisah melalui endpoint /po/:id/notes.
  }

  if (hasFullManagePermission && picUserId !== undefined) {
    const selectedPic = await getAllowedPicUser(picUserId);
    if (!selectedPic?.departmentId) {
      res.status(400).json({
        error: "PIC Departemen hanya boleh Admin Marketing 1, Engineering 1, atau Engineering 2",
      });
      return;
    }
    updates.picUserId = selectedPic.id;
    updates.departmentId = selectedPic.departmentId;
  }

  if (hasProgressPermission) {
    if (hasPainting !== undefined) updates.hasPainting = Boolean(hasPainting);
    if (trackingStages !== undefined)
      updates.trackingStages = normalizeTrackingStages(trackingStages);
  }

  if (hasTimelinePermission && trackingTimeline !== undefined)
    updates.trackingTimeline = normalizeTrackingTimeline(trackingTimeline);
  if (canEditIssueAction && projectIssueAction !== undefined)
    updates.projectIssueAction = projectIssueAction
      ? String(projectIssueAction).trim()
      : null;

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
    "projectIssueAction",
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

  if (!(await canEditByPermission(user, "po_mark_complete"))) {
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

  if (normalizeProjectProgress(po.status) !== "project_invoiced") {
    res.status(400).json({
      error:
        "PO hanya bisa ditutup setelah berstatus Project Invoiced (PIC Finance)",
    });
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

  if (!(await canEditByPermission(user, "po_delete"))) {
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
      "projectIssueAction",
    ]),
  });
  res.json({ success: true, message: "PO berhasil dihapus" });
});

export default router;
