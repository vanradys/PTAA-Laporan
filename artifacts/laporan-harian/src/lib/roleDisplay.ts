export function getRoleDisplayName(
  role?: string | null,
  departmentCode?: string | null,
  departmentName?: string | null,
) {
  const normalizedRole = String(role ?? "").toLowerCase();
  const normalizedDepartmentCode = String(departmentCode ?? "").toUpperCase();
  const normalizedDepartmentName = String(departmentName ?? "").toLowerCase();

  if (normalizedRole === "admin_marketing") return "Admin Marketing 2";
  if (
    normalizedRole === "marketing" ||
    (normalizedRole === "karyawan" &&
      (normalizedDepartmentCode === "MKT" ||
        normalizedDepartmentName.includes("marketing")))
  )
    return "Admin Marketing 1";
  if (["direktur", "director", "dir"].includes(normalizedRole))
    return "Direktur";
  if (normalizedRole === "admin") return "Admin";
  if (normalizedRole === "monitoring_dummy") return "Monitoring";
  if (normalizedRole === "karyawan") return "Karyawan";
  return role || "Admin";
}
