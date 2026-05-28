export const REMOVED_USER_EMAILS = [
  "admin@ptaa.com",
  "ahmad@perusahaan.com",
  "budi@perusahaan.com",
  "eko@perusahaan.com",
  "engineering3@adiyasa.com",
  "mkspec@adiyasa.com",
  "hr@adiyasa.com",
] as const;

export const NON_REPORTING_ROLES = [
  "admin",
  "direktur",
  "director",
] as const;

export function normalizeUserEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isRemovedUserEmail(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeUserEmail(email);
  return REMOVED_USER_EMAILS.includes(normalizedEmail as typeof REMOVED_USER_EMAILS[number]);
}
