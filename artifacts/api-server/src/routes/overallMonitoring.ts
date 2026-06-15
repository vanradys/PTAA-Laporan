import {
  assignedDailyTasksTable,
  customerTrackingCommentsTable,
  db,
  departmentsTable,
  desc,
  eq,
  poChangeLogsTable,
  poInternalCommentsTable,
  projectsPoTable,
} from "@workspace/db";
import { Router } from "express";
import { getUserFromToken } from "./auth";

const router = Router();

const AMOUNT_VISIBLE_ROLES = ["admin", "direktur", "director", "dir"];
const OVERALL_MONITORING_ROLES = ["admin", "monitoring_dummy"];

function canAccessOverallMonitoring(user?: { role?: string | null }) {
  const role = String(user?.role ?? "").toLowerCase();
  return OVERALL_MONITORING_ROLES.includes(role);
}

function canViewAmount(user?: { role?: string | null }) {
  const role = String(user?.role ?? "").toLowerCase();
  return AMOUNT_VISIBLE_ROLES.includes(role);
}

function sanitizePoChanges(
  changes: Record<string, { before: unknown; after: unknown }>,
  includeAmount: boolean,
) {
  if (includeAmount) return changes;

  const { poAmount: _poAmount, ...safeChanges } = changes ?? {};
  return safeChanges;
}

router.get("/monitoring-overall", async (req, res) => {
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

  if (!canAccessOverallMonitoring(user)) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const includeAmount = canViewAmount(user);

  const [poActivities, customerNotes, internalComments, taskHistories] =
    await Promise.all([
      db
        .select({
          id: poChangeLogsTable.id,
          poId: poChangeLogsTable.poId,
          noPo: poChangeLogsTable.noPo,
          action: poChangeLogsTable.action,
          changes: poChangeLogsTable.changes,
          changedByUserId: poChangeLogsTable.changedByUserId,
          changedByName: poChangeLogsTable.changedByName,
          createdAt: poChangeLogsTable.createdAt,
          namaProject: projectsPoTable.namaProject,
          customer: projectsPoTable.customer,
          departmentName: departmentsTable.name,
        })
        .from(poChangeLogsTable)
        .leftJoin(projectsPoTable, eq(poChangeLogsTable.poId, projectsPoTable.id))
        .leftJoin(departmentsTable, eq(projectsPoTable.departmentId, departmentsTable.id))
        .orderBy(desc(poChangeLogsTable.createdAt))
        .limit(250),
      db
        .select({
          id: customerTrackingCommentsTable.id,
          poId: customerTrackingCommentsTable.poId,
          customerName: customerTrackingCommentsTable.customerName,
          comment: customerTrackingCommentsTable.comment,
          createdAt: customerTrackingCommentsTable.createdAt,
          isRead: customerTrackingCommentsTable.isRead,
          noPo: projectsPoTable.noPo,
          namaProject: projectsPoTable.namaProject,
          customer: projectsPoTable.customer,
          departmentName: departmentsTable.name,
        })
        .from(customerTrackingCommentsTable)
        .leftJoin(projectsPoTable, eq(customerTrackingCommentsTable.poId, projectsPoTable.id))
        .leftJoin(departmentsTable, eq(projectsPoTable.departmentId, departmentsTable.id))
        .orderBy(desc(customerTrackingCommentsTable.createdAt))
        .limit(250),
      db
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
          customer: projectsPoTable.customer,
          departmentName: departmentsTable.name,
        })
        .from(poInternalCommentsTable)
        .leftJoin(projectsPoTable, eq(poInternalCommentsTable.poId, projectsPoTable.id))
        .leftJoin(departmentsTable, eq(projectsPoTable.departmentId, departmentsTable.id))
        .orderBy(desc(poInternalCommentsTable.createdAt))
        .limit(250),
      db
        .select()
        .from(assignedDailyTasksTable)
        .orderBy(desc(assignedDailyTasksTable.createdAt))
        .limit(250),
    ]);

  res.json({
    poActivities: poActivities.map((item) => ({
      ...item,
      changes: sanitizePoChanges(item.changes, includeAmount),
      createdAt: item.createdAt.toISOString(),
    })),
    customerNotes: customerNotes.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    internalComments: internalComments.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    taskHistories: taskHistories.map((item) => ({
      id: item.id,
      assigneeUserId: item.assigneeUserId,
      assignedByUserId: item.assignedByUserId,
      assignedByName: item.assignedByName,
      assignedByRole: item.assignedByRole,
      assignedByDepartment: item.assignedByDepartment ?? null,
      assignedToName: item.assignedToName ?? null,
      assignedToDepartment: item.assignedToDepartment ?? null,
      title: item.title,
      project: item.project ?? null,
      notes: item.notes ?? null,
      status: item.status,
      responseNote: item.responseNote ?? null,
      createdTaskId: item.createdTaskId ?? null,
      assignedAt: item.createdAt.toISOString(),
      respondedAt: item.respondedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
