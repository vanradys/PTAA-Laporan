export function getRoleDisplayName(
  role?: string | null,
  departmentCode?: string | null,
  departmentName?: string | null,
) {
  const normalizedRole = String(role ?? "").toLowerCase();
  if (normalizedRole === "marketing") return "Admin Marketing 1";
  if (normalizedRole === "admin_marketing") return "Admin Marketing 2";
  if (normalizedRole === "karyawan") {
    const code = String(departmentCode ?? "").toUpperCase();
    const name = String(departmentName ?? "").toLowerCase();
    if (code === "MKT" || name.includes("marketing")) return "Admin Marketing 1";
    return "Karyawan";
  }
  if (normalizedRole === "admin") return "Admin";
  if (["direktur", "director", "dir"].includes(normalizedRole)) return "Direktur";
  if (normalizedRole === "monitoring_dummy") return "Monitoring";
  return role || "Admin";
}
