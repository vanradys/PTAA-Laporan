import { db, sql } from "@workspace/db";

export const editPermissionFeatures = [
  { key: "po_create", label: "PO - Tambah PO" },
  { key: "po_edit_data", label: "PO - Edit Data PO" },
  { key: "po_update_progress", label: "PO - Update Project Progress" },
  { key: "po_edit_customer_timeline", label: "PO - Edit Timeline Customer" },
  { key: "po_mark_complete", label: "PO - Mark Project Selesai" },
  { key: "po_delete", label: "PO - Hapus PO" },
  { key: "po_add_notes", label: "PO - Tambah Catatan" },
  { key: "po_manage_notes", label: "PO - Edit/Hapus Catatan" },
  { key: "po_export", label: "PO - Export" },
  { key: "project_comment_add", label: "Komentar Project - Tambah" },
  { key: "project_comment_edit", label: "Komentar Project - Edit" },
  { key: "project_comment_delete", label: "Komentar Project - Hapus" },
  { key: "daily_report_edit_own", label: "Laporan Harian - Edit Laporan Sendiri" },
  { key: "daily_report_submit", label: "Laporan Harian - Submit" },
  { key: "daily_report_assign_tasks", label: "Laporan Harian - Assign Task" },
  { key: "daily_report_review", label: "Monitoring Laporan - Review/Revisi" },
  { key: "monitoring_send_reminder", label: "Monitoring Laporan - Kirim Reminder" },
  { key: "attendance_import", label: "Absensi - Import Data" },
  { key: "attendance_manage_mappings", label: "Absensi - Mapping User" },
  { key: "attendance_manage_holidays", label: "Absensi - Libur/Settings" },
  { key: "attendance_manual_corrections", label: "Absensi - Koreksi Manual" },
  { key: "attendance_export", label: "Absensi - Export" },
  { key: "tutorial_manage", label: "Panduan Website - Kelola Panduan" },
] as const;

export type EditPermissionKey = (typeof editPermissionFeatures)[number]["key"];

export const editPermissionFeatureKeys = new Set<string>(
  editPermissionFeatures.map((feature) => feature.key),
);

const allEditPermissionKeys = editPermissionFeatures.map((feature) => feature.key);
const poManagePermissions = [
  "po_create",
  "po_edit_data",
  "po_update_progress",
  "po_edit_customer_timeline",
  "po_mark_complete",
  "po_delete",
  "po_add_notes",
] satisfies EditPermissionKey[];
const poProgressPermissions = [
  "po_update_progress",
  "po_edit_customer_timeline",
] satisfies EditPermissionKey[];
const dailyReportEmployeePermissions = [
  "daily_report_edit_own",
  "daily_report_submit",
  "daily_report_assign_tasks",
] satisfies EditPermissionKey[];
const attendanceManagePermissions = [
  "attendance_import",
  "attendance_manage_mappings",
  "attendance_manage_holidays",
  "attendance_manual_corrections",
  "attendance_export",
] satisfies EditPermissionKey[];

export const defaultEditPermissionBySubject: Record<string, string[]> = {
  "role:admin": allEditPermissionKeys,
  "role:direktur": [
    ...poManagePermissions,
    "po_export",
    "project_comment_add",
    "project_comment_delete",
    "daily_report_review",
    "monitoring_send_reminder",
  ],
  "role:monitoring_dummy": [
    ...poManagePermissions,
    "po_export",
    "project_comment_add",
  ],
  "DEPT:MKT": [
    ...poManagePermissions,
    ...dailyReportEmployeePermissions,
  ],
  "DEPT:ENG": [
    ...poProgressPermissions,
    "project_comment_add",
    ...dailyReportEmployeePermissions,
  ],
  "DEPT:AAF": [
    ...poManagePermissions,
    "po_export",
    ...dailyReportEmployeePermissions,
    ...attendanceManagePermissions,
  ],
  "DEPT:FIN": [
    ...poManagePermissions,
    "po_export",
    ...dailyReportEmployeePermissions,
    ...attendanceManagePermissions,
  ],
  "DEPT:PUR": [
    ...poProgressPermissions,
    ...dailyReportEmployeePermissions,
  ],
  "DEPT:GA": [
    ...poManagePermissions,
    ...dailyReportEmployeePermissions,
  ],
};

export type PermissionSubject = {
  key: string;
  legacyDepartmentCode?: string;
  locked?: boolean;
};

export type PermissionUser = {
  role?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
};

export async function ensureEditPermissionTable() {
  await db.execute(sql`
    create table if not exists department_edit_permissions (
      subject_key text not null,
      permission_key text not null,
      can_edit boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (subject_key, permission_key)
    )
  `);
}

export function getPermissionSubjectForUser(user: PermissionUser): PermissionSubject | null {
  const role = String(user.role ?? "").trim().toLowerCase();
  if (role === "admin") return { key: "role:admin", legacyDepartmentCode: "ADM", locked: true };
  if (["direktur", "director", "dir"].includes(role)) {
    return { key: "role:direktur", legacyDepartmentCode: "DIR" };
  }
  if (["monitoring_dummy", "monitoring", "monitor"].includes(role)) {
    return { key: "role:monitoring_dummy" };
  }

  const departmentCode = String(user.departmentCode ?? "").trim().toUpperCase();
  if (!departmentCode) return null;
  return { key: `DEPT:${departmentCode}`, legacyDepartmentCode: departmentCode };
}

export function getDefaultEditPermission(subject: PermissionSubject, permissionKey: string) {
  if (subject.locked) return true;
  return Boolean(defaultEditPermissionBySubject[subject.key]?.includes(permissionKey));
}

export async function getSavedEditPermissionMap() {
  await ensureEditPermissionTable();
  const result = await db.execute(sql`
    select subject_key, permission_key, can_edit
    from department_edit_permissions
  `);
  const rows =
    (result as unknown as { rows?: Array<{ subject_key: string; permission_key: string; can_edit: boolean }> }).rows ??
    (result as unknown as Array<{ subject_key: string; permission_key: string; can_edit: boolean }>);

  return new Map(rows.map((item) => [`${item.subject_key}:${item.permission_key}`, item.can_edit]));
}

export function getEffectiveEditPermission(
  subject: PermissionSubject,
  permissionKey: string,
  savedByKey: Map<string, boolean>,
) {
  if (subject.locked) return true;

  const directSaved = savedByKey.get(`${subject.key}:${permissionKey}`);
  if (directSaved !== undefined) return directSaved;

  if (subject.legacyDepartmentCode) {
    const legacySaved = savedByKey.get(`${subject.legacyDepartmentCode}:${permissionKey}`);
    if (legacySaved !== undefined) return legacySaved;
  }

  return getDefaultEditPermission(subject, permissionKey);
}

export async function canEditByPermission(user: PermissionUser, permissionKey: string) {
  if (!editPermissionFeatureKeys.has(permissionKey)) return false;
  const subject = getPermissionSubjectForUser(user);
  if (!subject) return false;
  const savedByKey = await getSavedEditPermissionMap();
  return getEffectiveEditPermission(subject, permissionKey, savedByKey);
}

export async function getEditPermissionsForUser(user: PermissionUser) {
  const subject = getPermissionSubjectForUser(user);
  const savedByKey = await getSavedEditPermissionMap();
  return Object.fromEntries(
    editPermissionFeatures.map((feature) => [
      feature.key,
      subject ? getEffectiveEditPermission(subject, feature.key, savedByKey) : false,
    ]),
  );
}
