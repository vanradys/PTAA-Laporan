import { db, departmentsTable, usersTable, eq, ilike, inArray, sql } from "@workspace/db";
import { getUserFromToken, hashPassword, ptaaUsers } from "./auth";
import { activeDepartmentCodes } from "./auth";
import { Router } from "express";
import { activeUserCondition } from "../services/dailyReportReminder";
import {
  editPermissionFeatureKeys,
  editPermissionFeatures,
  ensureEditPermissionTable,
  getEditPermissionsForUser,
  getEffectiveEditPermission,
  getSavedEditPermissionMap,
} from "../services/editPermissions";

const router = Router();

router.get("/departments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const departments = await db
    .select()
    .from(departmentsTable)
    .where(inArray(departmentsTable.code, activeDepartmentCodes))
    .orderBy(departmentsTable.name);
  res.json(departments);
});

router.get("/employees", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const employees = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(sql`${activeUserCondition()} and lower(${usersTable.role}) <> 'monitoring_dummy'`)
    .orderBy(usersTable.name);

  res.json(employees.map((employee) => ({
    ...employee,
    departmentName: employee.departmentName ?? null,
    avatarInitials: employee.name.split(" ").map((word: string) => word[0]).join("").toUpperCase().slice(0, 2),
  })));
});

router.get("/users", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses User Management" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
      departmentCode: departmentsTable.code,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .orderBy(usersTable.name);

  res.json(users);
});

router.get("/user-management/departments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses departemen User Management" });
    return;
  }

  const departments = await db
    .select()
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  res.json(departments);
});

router.get("/user-management/department-visibility", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses visibility departemen" });
    return;
  }

  await ensureDepartmentVisibilityTable();

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const visibilitySubjects = buildVisibilitySubjects(departments);

  const savedPermissionsResult = await db.execute(sql`
    select department_code, feature_key, can_view
    from department_feature_permissions
  `);
  const savedPermissions =
    (savedPermissionsResult as unknown as { rows?: Array<{ department_code: string; feature_key: string; can_view: boolean }> }).rows ??
    (savedPermissionsResult as unknown as Array<{ department_code: string; feature_key: string; can_view: boolean }>);

  const savedByKey = new Map(
    savedPermissions.map((item) => [`${item.department_code}:${item.feature_key}`, item.can_view]),
  );

  res.json({
    features: departmentVisibilityFeatures,
    departments: visibilitySubjects.map(serializeVisibilitySubject),
    permissions: visibilitySubjects.flatMap((subject) =>
      departmentVisibilityFeatures.map((feature) => ({
        departmentCode: subject.key,
        subjectKey: subject.key,
        featureKey: feature.key,
        canView: getEffectiveVisibility(subject, feature.key, savedByKey),
      })),
    ),
  });
});

router.get("/department-visibility/me", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  await ensureDepartmentVisibilityTable();

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const visibilitySubjects = buildVisibilitySubjects(departments);
  const subject = getVisibilitySubjectForUser(user, visibilitySubjects);

  const savedPermissionsResult = await db.execute(sql`
    select department_code, feature_key, can_view
    from department_feature_permissions
  `);
  const savedPermissions =
    (savedPermissionsResult as unknown as { rows?: Array<{ department_code: string; feature_key: string; can_view: boolean }> }).rows ??
    (savedPermissionsResult as unknown as Array<{ department_code: string; feature_key: string; can_view: boolean }>);
  const savedByKey = new Map(
    savedPermissions.map((item) => [`${item.department_code}:${item.feature_key}`, item.can_view]),
  );

  res.json({
    features: departmentVisibilityFeatures,
    subject: subject ? serializeVisibilitySubject(subject) : null,
    permissions: Object.fromEntries(
      departmentVisibilityFeatures.map((feature) => [
        feature.key,
        subject ? getEffectiveVisibility(subject, feature.key, savedByKey) : false,
      ]),
    ),
  });
});

router.patch("/user-management/department-visibility", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengubah visibility departemen" });
    return;
  }

  const requestedSubject = String(req.body?.subjectKey ?? req.body?.departmentCode ?? "").trim();
  const featureKey = String(req.body?.featureKey ?? "").trim();
  const canView = Boolean(req.body?.canView);

  if (!requestedSubject || !departmentVisibilityFeatureKeys.has(featureKey)) {
    res.status(400).json({ error: "Departemen atau fitur tidak valid" });
    return;
  }

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const subject = findVisibilitySubject(buildVisibilitySubjects(departments), requestedSubject);

  if (!subject) {
    res.status(404).json({ error: "Visibility profile tidak ditemukan" });
    return;
  }
  if (subject.locked) {
    res.status(403).json({ error: "Permission Admin bersifat absolute dan tidak bisa diubah" });
    return;
  }

  await ensureDepartmentVisibilityTable();
  await db.execute(sql`
    insert into department_feature_permissions (department_code, feature_key, can_view, updated_at)
    values (${subject.key}, ${featureKey}, ${canView}, now())
    on conflict (department_code, feature_key)
    do update set can_view = excluded.can_view, updated_at = now()
  `);

  res.json({ success: true, departmentCode: subject.key, subjectKey: subject.key, featureKey, canView });
});

router.get("/user-management/edit-permissions", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengakses edit permissions" });
    return;
  }

  await ensureEditPermissionTable();

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const subjects = buildVisibilitySubjects(departments);
  const savedByKey = await getSavedEditPermissionMap();

  res.json({
    features: editPermissionFeatures,
    departments: subjects.map(serializeVisibilitySubject),
    permissions: subjects.flatMap((subject) =>
      editPermissionFeatures.map((feature) => ({
        departmentCode: subject.key,
        subjectKey: subject.key,
        permissionKey: feature.key,
        canEdit: getEffectiveEditPermission(subject, feature.key, savedByKey),
      })),
    ),
  });
});

router.get("/edit-permissions/me", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const subject = getVisibilitySubjectForUser(user, buildVisibilitySubjects(departments));

  res.json({
    features: editPermissionFeatures,
    subject: subject ? serializeVisibilitySubject(subject) : null,
    permissions: await getEditPermissionsForUser(user),
  });
});

router.patch("/user-management/edit-permissions", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengubah edit permissions" });
    return;
  }

  const requestedSubject = String(req.body?.subjectKey ?? req.body?.departmentCode ?? "").trim();
  const permissionKey = String(req.body?.permissionKey ?? "").trim();
  const canEdit = Boolean(req.body?.canEdit);

  if (!requestedSubject || !editPermissionFeatureKeys.has(permissionKey)) {
    res.status(400).json({ error: "Profile atau permission tidak valid" });
    return;
  }

  const departments = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
    })
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const subject = findVisibilitySubject(buildVisibilitySubjects(departments), requestedSubject);

  if (!subject) {
    res.status(404).json({ error: "Visibility profile tidak ditemukan" });
    return;
  }
  if (subject.locked) {
    res.status(403).json({ error: "Permission Admin bersifat absolute dan tidak bisa diubah" });
    return;
  }

  await ensureEditPermissionTable();
  await db.execute(sql`
    insert into department_edit_permissions (subject_key, permission_key, can_edit, updated_at)
    values (${subject.key}, ${permissionKey}, ${canEdit}, now())
    on conflict (subject_key, permission_key)
    do update set can_edit = excluded.can_edit, updated_at = now()
  `);

  res.json({ success: true, departmentCode: subject.key, subjectKey: subject.key, permissionKey, canEdit });
});

const allowedUserManagementRoles = new Set([
  "admin",
  "direktur",
  "karyawan",
  "admin_marketing",
  "marketing_specialist",
  "monitoring_dummy",
]);

const departmentVisibilityFeatures = [
  { key: "dashboard", label: "Dashboard" },
  { key: "daily_reports", label: "LAPORAN HARIAN" },
  { key: "todo_list", label: "To Do List" },
  { key: "monitoring_reports", label: "Monitoring Laporan" },
  { key: "overall_monitoring", label: "Monitoring Keseluruhan" },
  { key: "project_schedule", label: "Jadwal Project" },
  { key: "project_comments", label: "Komentar Project" },
  { key: "customer_notes", label: "Customer Notes" },
  { key: "attendance", label: "Absensi" },
  { key: "website_guide", label: "Panduan Website" },
  { key: "notifications", label: "Notifikasi" },
] as const;

const departmentVisibilityFeatureKeys = new Set<string>(
  departmentVisibilityFeatures.map((feature) => feature.key),
);

type VisibilitySubject = {
  id: number;
  key: string;
  name: string;
  displayCode: string;
  locked?: boolean;
  legacyDepartmentCode?: string;
};

type DepartmentLike = {
  id: number;
  name: string | null;
  code: string | null;
};

const allDepartmentVisibilityFeatures = departmentVisibilityFeatures.map(
  (feature) => feature.key,
);

const defaultLoggedInFeatureVisibility = [
  "dashboard",
  "daily_reports",
  "todo_list",
  "monitoring_reports",
  "project_schedule",
  "attendance",
  "website_guide",
  "notifications",
];

const defaultSubjectVisibility: Record<string, string[]> = {
  "role:admin": allDepartmentVisibilityFeatures,
  "role:direktur": [
    ...defaultLoggedInFeatureVisibility,
    "project_comments",
    "customer_notes",
  ],
  "role:monitoring_dummy": [
    ...defaultLoggedInFeatureVisibility,
    "overall_monitoring",
    "project_comments",
    "customer_notes",
  ],
  "DEPT:MKT": [
    ...defaultLoggedInFeatureVisibility,
  ],
  "DEPT:ENG": [
    ...defaultLoggedInFeatureVisibility,
    "project_comments",
    "customer_notes",
  ],
  "DEPT:AAF": [
    ...defaultLoggedInFeatureVisibility,
  ],
  "DEPT:FIN": [
    ...defaultLoggedInFeatureVisibility,
  ],
  "DEPT:PUR": [
    ...defaultLoggedInFeatureVisibility,
  ],
  "DEPT:GA": [
    ...defaultLoggedInFeatureVisibility,
  ],
};

const defaultDepartmentVisibility: Record<string, string[]> = {
  DIR: defaultSubjectVisibility["role:direktur"],
  MKT: defaultSubjectVisibility["DEPT:MKT"],
  ENG: defaultSubjectVisibility["DEPT:ENG"],
  AAF: defaultSubjectVisibility["DEPT:AAF"],
  FIN: defaultSubjectVisibility["DEPT:FIN"],
  PUR: defaultSubjectVisibility["DEPT:PUR"],
  GA: defaultSubjectVisibility["DEPT:GA"],
  ADM: departmentVisibilityFeatures.map((feature) => feature.key),
};

async function ensureDepartmentVisibilityTable() {
  await db.execute(sql`
    create table if not exists department_feature_permissions (
      department_code text not null,
      feature_key text not null,
      can_view boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (department_code, feature_key)
    )
  `);
}

function getDefaultDepartmentVisibility(departmentCode: string, featureKey: string) {
  return Boolean(defaultDepartmentVisibility[departmentCode]?.includes(featureKey));
}

function buildVisibilitySubjects(departments: DepartmentLike[]): VisibilitySubject[] {
  const departmentSubjects = departments
    .map((department) => ({
      ...department,
      code: String(department.code ?? "").trim().toUpperCase(),
      name: String(department.name ?? department.code ?? "").trim(),
    }))
    .filter((department) => department.code && !["ADM", "DIR"].includes(department.code))
    .map((department) => ({
      id: department.id,
      key: `DEPT:${department.code}`,
      name: department.name || department.code,
      displayCode: department.code,
      legacyDepartmentCode: department.code,
    }));

  return [
    {
      id: -1,
      key: "role:admin",
      name: "Admin",
      displayCode: "ADMIN",
      locked: true,
      legacyDepartmentCode: "ADM",
    },
    {
      id: -2,
      key: "role:direktur",
      name: "Direktur",
      displayCode: "DIR",
      legacyDepartmentCode: "DIR",
    },
    {
      id: -3,
      key: "role:monitoring_dummy",
      name: "Monitoring Laporan",
      displayCode: "MON",
    },
    ...departmentSubjects,
  ];
}

function serializeVisibilitySubject(subject: VisibilitySubject) {
  return {
    id: subject.id,
    name: subject.name,
    code: subject.key,
    displayCode: subject.displayCode,
    locked: subject.locked === true,
  };
}

function findVisibilitySubject(subjects: VisibilitySubject[], requestedSubject: string) {
  const requested = requestedSubject.trim().toLowerCase();
  return subjects.find((subject) =>
    [
      subject.key,
      subject.displayCode,
      subject.legacyDepartmentCode,
    ].some((value) => String(value ?? "").toLowerCase() === requested),
  );
}

function getVisibilitySubjectForUser(
  user: { role?: unknown; departmentCode?: string | null; departmentName?: string | null },
  subjects: VisibilitySubject[],
): VisibilitySubject | null {
  const role = String(user.role ?? "").trim().toLowerCase();
  const roleSubjectKey =
    role === "admin"
      ? "role:admin"
      : ["direktur", "director", "dir"].includes(role)
        ? "role:direktur"
        : ["monitoring_dummy", "monitoring", "monitor"].includes(role)
          ? "role:monitoring_dummy"
          : "";

  if (roleSubjectKey) {
    const roleSubject = subjects.find((subject) => subject.key === roleSubjectKey);
    if (roleSubject) return roleSubject;
  }

  const departmentCode = String(user.departmentCode ?? "").trim().toUpperCase();
  if (!departmentCode) return null;

  return subjects.find((subject) => subject.key === `DEPT:${departmentCode}`) ?? {
    id: 0,
    key: `DEPT:${departmentCode}`,
    name: String(user.departmentName ?? departmentCode),
    displayCode: departmentCode,
    legacyDepartmentCode: departmentCode,
  };
}

function getEffectiveVisibility(
  subject: VisibilitySubject,
  featureKey: string,
  savedByKey: Map<string, boolean>,
) {
  if (subject.locked) return true;

  const directSaved = savedByKey.get(`${subject.key}:${featureKey}`);
  if (directSaved !== undefined) return directSaved;

  if (subject.legacyDepartmentCode) {
    const legacySaved = savedByKey.get(`${subject.legacyDepartmentCode}:${featureKey}`);
    if (legacySaved !== undefined) return legacySaved;
  }

  return getDefaultSubjectVisibility(subject, featureKey);
}

function getDefaultSubjectVisibility(subject: VisibilitySubject, featureKey: string) {
  if (subject.locked) return true;

  const subjectDefaults = defaultSubjectVisibility[subject.key];
  if (subjectDefaults) return subjectDefaults.includes(featureKey);

  if (subject.key.startsWith("DEPT:")) {
    return defaultLoggedInFeatureVisibility.includes(featureKey);
  }

  if (subject.legacyDepartmentCode) {
    return getDefaultDepartmentVisibility(subject.legacyDepartmentCode, featureKey);
  }

  return false;
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function getKnownPlainPassword(email: string, storedPassword: string): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const knownUser = ptaaUsers.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!knownUser) {
    return null;
  }

  if (storedPassword === knownUser.password || storedPassword === hashPassword(knownUser.password)) {
    return knownUser.password;
  }

  return null;
}

async function resolveUserManagementDepartmentId(
  role: string,
  departmentId: unknown,
) {
  const requiredDepartmentCodeByRole: Record<string, string> = {
    direktur: "DIR",
    admin_marketing: "MKT",
    marketing_specialist: "MKT",
    monitoring_dummy: "ADM",
  };
  const requiredDepartmentCode = requiredDepartmentCodeByRole[role];

  if (requiredDepartmentCode) {
    const [requiredDepartment] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.code, requiredDepartmentCode))
      .limit(1);
    if (!requiredDepartment) {
      throw new Error(`Departemen wajib ${requiredDepartmentCode} belum tersedia`);
    }
    return requiredDepartment.id;
  }

  if (departmentId === undefined || departmentId === null || departmentId === "") {
    return null;
  }

  const parsedDepartmentId = Number(departmentId);
  if (!Number.isInteger(parsedDepartmentId) || parsedDepartmentId <= 0) {
    const error = new Error("Departemen tidak valid");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const [department] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, parsedDepartmentId))
    .limit(1);
  if (!department) {
    const error = new Error("Departemen tidak ditemukan");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  return parsedDepartmentId;
}

router.post("/users", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat membuat akun" });
    return;
  }

  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "").trim();
  const role = String(req.body?.role ?? "karyawan").toLowerCase();

  if (!name || !email || !password) {
    res.status(400).json({ error: "Nama, email, dan password wajib diisi" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Format email tidak valid" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password minimal 6 karakter" });
    return;
  }
  if (!allowedUserManagementRoles.has(role)) {
    res.status(400).json({ error: "Role tidak valid" });
    return;
  }

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(ilike(usersTable.email, email))
    .limit(1);
  if (existingUser) {
    res.status(409).json({ error: "Email sudah digunakan" });
    return;
  }

  try {
    const departmentId = await resolveUserManagementDepartmentId(
      role,
      req.body?.departmentId,
    );
    const [created] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        password,
        role,
        departmentId,
        isActive: req.body?.isActive !== false,
      })
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
        isActive: usersTable.isActive,
      });

    res.status(201).json(created);
  } catch (error) {
    const typedError = error as Error & { status?: number };
    res.status(typedError.status ?? 500).json({
      error: typedError.message || "Gagal membuat akun",
    });
  }
});

router.get("/users/:id/password", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat melihat password akun" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }

  const [targetUser] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      password: usersTable.password,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!targetUser) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  const knownPlainPassword = getKnownPlainPassword(targetUser.email, targetUser.password);
  if (knownPlainPassword) {
    res.json({
      userId: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      canView: true,
      password: knownPlainPassword,
      source: "default_seed",
    });
    return;
  }

  if (!SHA256_HEX_PATTERN.test(targetUser.password)) {
    res.json({
      userId: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      canView: true,
      password: targetUser.password,
      source: "stored_plaintext",
    });
    return;
  }

  res.json({
    userId: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    canView: false,
    password: null,
    source: "hashed",
    message:
      "Password akun ini sudah tersimpan sebagai hash, jadi password asli tidak bisa dilihat. Buat password baru jika user lupa password.",
  });
});

router.patch("/users/:id/password", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengubah password akun" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }

  const password = String(req.body?.password ?? "").trim();
  if (password.length < 6) {
    res.status(400).json({ error: "Password minimal 6 karakter" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ password })
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    });

  if (!updated) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  res.json({ success: true, user: updated });
});

router.patch("/users/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat mengubah user/role" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }
  const [existingUser] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existingUser) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  const { name, role, departmentId, isActive } = req.body ?? {};
  const existingRole = String(existingUser.role ?? "").toLowerCase();
  const requestedRole = role !== undefined ? String(role).toLowerCase() : undefined;
  if (existingRole === "admin" && requestedRole !== undefined && requestedRole !== "admin") {
    res.status(400).json({ error: "Permission Admin bersifat absolute dan tidak bisa dihapus" });
    return;
  }
  if (existingRole === "admin" && isActive === false) {
    res.status(400).json({ error: "Akun Admin tidak bisa di-hide atau dinonaktifkan" });
    return;
  }
  if (existingRole === "admin" && departmentId !== undefined) {
    res.status(400).json({ error: "Departemen akun Admin tidak bisa diubah" });
    return;
  }
  if (id === user.id && isActive === false) {
    res.status(400).json({ error: "Admin tidak dapat menonaktifkan akunnya sendiri" });
    return;
  }
  if (id === user.id && role !== undefined && String(role).toLowerCase() !== "admin") {
    res.status(400).json({ error: "Admin tidak dapat menghapus role Admin dari akunnya sendiri" });
    return;
  }
  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: "Nama user tidak boleh kosong" });
    return;
  }
  if (role !== undefined && !allowedUserManagementRoles.has(String(role).toLowerCase())) {
    res.status(400).json({ error: "Role tidak valid" });
    return;
  }

  const normalizedRole =
    role !== undefined ? String(role).toLowerCase() : existingUser.role;
  let normalizedDepartmentId: number | null | undefined;
  try {
    normalizedDepartmentId =
      departmentId === undefined
        ? undefined
        : await resolveUserManagementDepartmentId(normalizedRole, departmentId);
  } catch (error) {
    const typedError = error as Error & { status?: number };
    res.status(typedError.status ?? 500).json({ error: typedError.message });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(role !== undefined ? { role: String(role).toLowerCase() } : {}),
      ...(normalizedDepartmentId !== undefined
        ? { departmentId: normalizedDepartmentId }
        : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    })
    .where(eq(usersTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/users/:id", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat menghapus user" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID user tidak valid" });
    return;
  }
  if (id === user.id) {
    res.status(400).json({ error: "Admin tidak dapat menghapus akunnya sendiri" });
    return;
  }

  const [existingUser] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existingUser) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }
  if (String(existingUser.role).toLowerCase() === "admin") {
    res.status(400).json({ error: "Akun Admin bersifat absolute dan tidak bisa dihapus" });
    return;
  }

  const dependencyResult = await db.execute(sql`
    select
      (
        (select count(*) from daily_reports where user_id = ${id}) +
        (select count(*) from report_comments where user_id = ${id}) +
        (select count(*) from assigned_daily_tasks where assignee_user_id = ${id} or assigned_by_user_id = ${id}) +
        (select count(*) from projects_po where pic_user_id = ${id} or created_by_user_id = ${id} or closed_by_user_id = ${id}) +
        (select count(*) from po_change_logs where changed_by_user_id = ${id}) +
        (select count(*) from po_internal_comments where user_id = ${id}) +
        (select count(*) from daily_tasks where reviewed_by_user_id = ${id}) +
        (select count(*) from todo_tasks where created_by_user_id = ${id}) +
        (select count(*) from todo_task_assignees where user_id = ${id}) +
        (select count(*) from todo_task_comments where user_id = ${id}) +
        (select count(*) from attendance_mappings where user_id = ${id}) +
        (select count(*) from attendance_scans where user_id = ${id}) +
        (select count(*) from attendance_daily where user_id = ${id}) +
        (select count(*) from attendance_import_batches where uploaded_by = ${id}) +
        (select count(*) from attendance_notification_logs where user_id = ${id})
      )::int as blocking_count
  `);
  const dependencyRow =
    ((dependencyResult as { rows?: Array<{ blocking_count?: number | string }> }).rows?.[0]) ??
    ((dependencyResult as unknown as Array<{ blocking_count?: number | string }>)[0]);
  const blockingCount = Number(dependencyRow?.blocking_count ?? 0);

  if (blockingCount > 0) {
    res.status(409).json({
      error:
        "User ini punya histori laporan/tugas/PO/absensi, jadi tidak aman dihapus permanen. Nonaktifkan akun agar hilang dari flow aktif tanpa merusak histori.",
      blockingCount,
    });
    return;
  }

  await db.execute(sql`delete from sessions where user_id = ${id}`);
  await db.execute(sql`delete from notifications where user_id = ${id}`);
  await db.execute(sql`delete from device_tokens where user_id = ${id}`);
  await db.execute(sql`delete from daily_report_reminder_logs where user_id = ${id}`);
  await db.execute(sql`update daily_report_reminder_logs set sent_by = null where sent_by = ${id}`);
  await db.execute(sql`delete from name_change_requests where user_id = ${id}`);
  await db.execute(sql`update name_change_requests set reviewed_by_user_id = null where reviewed_by_user_id = ${id}`);

  const [deletedUser] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    });

  res.json({ deleted: true, user: deletedUser });
});

export default router;
