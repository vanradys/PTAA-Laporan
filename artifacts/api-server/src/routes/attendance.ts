import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import {
  and,
  asc,
  attendanceDailyTable,
  attendanceHolidaysTable,
  attendanceImportBatchesTable,
  attendanceImportRowsTable,
  attendanceMappingsTable,
  attendanceNotificationLogsTable,
  attendanceScansTable,
  attendanceSettingsTable,
  companyHolidaysTable,
  db,
  desc,
  eq,
  gte,
  inArray,
  lte,
  notificationsTable,
  sql,
  usersTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const OFFICE_DEFAULTS = new Set(["rais", "hafidz diinul", "alya", "ita", "ines", "dikri"]);
const FULL_ACCESS_ROLES = new Set(["admin", "direktur", "director", "dir"]);
const ADMIN_ROLE = "admin";

type AuthUser = NonNullable<Awaited<ReturnType<typeof getUserFromToken>>>;
type ParsedRow = {
  rowNumber: number;
  rawData: Record<string, unknown>;
  machineName: string | null;
  scanDate: string | null;
  scanTime: string | null;
  department: string | null;
  position: string | null;
  office: string | null;
  verification: string | null;
  ioType: string | null;
  workcode: string | null;
  serialNumber: string | null;
  machine: string | null;
  isValid: boolean;
  validationErrors: string[];
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return normalize(value).toLowerCase().replace(/\s+/g, " ");
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = normalize(value);
  const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

function parseTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 19);
  }
  const text = normalize(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function addDays(iso: string, amount: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function isWeekend(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function timeHours(time: string) {
  const [hour, minute, second] = time.split(":").map(Number);
  return hour + minute / 60 + second / 3600;
}

function payrollPeriod(reference = new Date()) {
  const jakarta = new Date(reference.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const year = jakarta.getFullYear();
  const month = jakarta.getMonth();
  const day = jakarta.getDate();
  const start = day >= 21
    ? new Date(Date.UTC(year, month, 21))
    : new Date(Date.UTC(year, month - 1, 21));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 20));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function payrollPeriodForDate(iso: string) {
  const reference = new Date(`${iso}T12:00:00Z`);
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();
  const start = day >= 21
    ? new Date(Date.UTC(year, month, 21))
    : new Date(Date.UTC(year, month - 1, 21));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 20));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function periodFileLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${formatter.format(new Date(`${start}T00:00:00Z`))} - ${formatter.format(new Date(`${end}T00:00:00Z`))}`;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDate(value.split("-").reverse().join("-")) === value;
}

function requestedPeriod(req: any, res: any) {
  const fallback = payrollPeriod();
  const start = normalize(req.query.start) || fallback.start;
  const end = normalize(req.query.end) || fallback.end;
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    res.status(400).json({ error: "Rentang tanggal tidak valid" });
    return null;
  }
  const duration = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000;
  if (duration > 370) {
    res.status(400).json({ error: "Rentang tanggal maksimal 370 hari" });
    return null;
  }
  return { start, end };
}

async function authenticate(req: any, res: any): Promise<AuthUser | null> {
  const token = req.cookies?.session_token;
  const user = token ? await getUserFromToken(token) : null;
  if (!user) res.status(401).json({ error: "Tidak terautentikasi" });
  return user;
}

function requireAdmin(user: AuthUser, res: any) {
  if (String(user.role).toLowerCase() !== ADMIN_ROLE) {
    res.status(403).json({ error: "Aksi ini hanya dapat dilakukan Admin" });
    return false;
  }
  return true;
}

function parseWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: false });
  if (workbook.SheetNames.length > 20) throw new Error("File memiliki terlalu banyak sheet");
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const cellAddresses = Object.keys(sheet).filter((key) => !key.startsWith("!"));
    if (cellAddresses.length > 100_000) throw new Error(`Sheet ${sheetName} memiliki terlalu banyak sel`);
    let maxRow = 0;
    let maxColumn = 0;
    for (const address of cellAddresses) {
      const decoded = XLSX.utils.decode_cell(address);
      maxRow = Math.max(maxRow, decoded.r);
      maxColumn = Math.max(maxColumn, decoded.c);
    }
    if (maxRow >= 20_000 || maxColumn >= 50) {
      throw new Error(`Dimensi data pada sheet ${sheetName} terlalu besar`);
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
      range: { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } },
    });
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes("nama") && headers.includes("tanggal") && headers.includes("jam");
    });
    if (headerIndex < 0) continue;

    const headers = rows[headerIndex].map(normalize);
    const index = new Map(headers.map((header, column) => [normalizeHeader(header), column]));
    const get = (row: unknown[], ...names: string[]) => {
      const name = names.find((candidate) => index.has(candidate));
      return name ? row[index.get(name)!] : "";
    };
    const parsedRows: ParsedRow[] = rows
      .slice(headerIndex + 1)
      .filter((row) => row.some((value) => normalize(value)))
      .map((row, offset) => {
        const rawData = Object.fromEntries(headers.map((header, column) => [header || `Kolom ${column + 1}`, row[column] ?? ""]));
        const machineName = normalize(get(row, "nama")) || null;
        const rawDate = get(row, "tanggal");
        const rawTime = get(row, "jam");
        const scanDate = parseDate(rawDate);
        const scanTime = parseTime(rawTime);
        const errors: string[] = [];
        if (!machineName) errors.push("Nama kosong");
        if (!normalize(rawDate)) errors.push("Tanggal kosong");
        else if (!scanDate) errors.push("Format tanggal tidak valid");
        if (!normalize(rawTime)) errors.push("Jam kosong");
        else if (!scanTime) errors.push("Format jam tidak valid");
        return {
          rowNumber: headerIndex + offset + 2,
          rawData,
          machineName,
          scanDate,
          scanTime,
          department: normalize(get(row, "departemen")) || null,
          position: normalize(get(row, "jabatan")) || null,
          office: normalize(get(row, "kantor")) || null,
          verification: normalize(get(row, "verifikasi")) || null,
          ioType: normalize(get(row, "i/o", "io")) || null,
          workcode: normalize(get(row, "workcode")) || null,
          serialNumber: normalize(get(row, "sn")) || null,
          machine: normalize(get(row, "mesin")) || null,
          isValid: errors.length === 0,
          validationErrors: errors,
        };
      });
    return { sheetName, rows: parsedRows };
  }
  throw new Error("Tidak ada sheet dengan kolom Nama, Tanggal, dan Jam");
}

async function ensureAutomaticMappings(names: string[]) {
  if (names.length === 0) return;
  const existing = await db.select().from(attendanceMappingsTable);
  const existingNames = new Set(existing.map((item) => item.machineName.toLowerCase()));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.isActive, true));
  const usersByName = new Map(users.map((user) => [user.name.trim().toLowerCase(), user]));
  for (const name of names) {
    if (existingNames.has(name.toLowerCase())) continue;
    const matchedUser = usersByName.get(name.toLowerCase());
    if (!matchedUser) continue;
    await db.insert(attendanceMappingsTable).values({
      machineName: name,
      displayName: matchedUser.name,
      userId: matchedUser.id,
      employeeType: OFFICE_DEFAULTS.has(name.toLowerCase()) ? "Office" : "Produksi",
    }).onConflictDoNothing();
  }
}

async function getSettings(executor: any = db) {
  await executor.insert(attendanceSettingsTable).values({ id: 1 }).onConflictDoNothing();
  return (await executor.select().from(attendanceSettingsTable).where(eq(attendanceSettingsTable.id, 1)).limit(1))[0];
}

function statusFromLate(totalLate: number, settings: { safeMax: number; warningMax: number }) {
  if (totalLate <= settings.safeMax) return "Safe";
  if (totalLate <= settings.warningMax) return "Warning";
  return "SP1";
}

async function notifyAttendanceStatus(
  rows: Array<{ userId: number | null; totalLate: number }>,
  periodStart: string,
  periodEnd: string,
  executor: any = db,
) {
  const settings = await getSettings(executor);
  for (const row of rows) {
    if (!row.userId) continue;
    const status = statusFromLate(row.totalLate, settings);
    const existing = await executor.select().from(attendanceNotificationLogsTable).where(and(
      eq(attendanceNotificationLogsTable.userId, row.userId),
      eq(attendanceNotificationLogsTable.periodStart, periodStart),
      eq(attendanceNotificationLogsTable.periodEnd, periodEnd),
    )).limit(1);
    const log = existing[0];
    if (status === "Safe") {
      if (log?.notificationId) {
        await executor.delete(notificationsTable).where(eq(notificationsTable.id, log.notificationId));
      }
      await executor.insert(attendanceNotificationLogsTable).values({
        userId: row.userId,
        periodStart,
        periodEnd,
        status,
        notificationId: null,
      }).onConflictDoUpdate({
        target: [
          attendanceNotificationLogsTable.userId,
          attendanceNotificationLogsTable.periodStart,
          attendanceNotificationLogsTable.periodEnd,
        ],
        set: { status, notificationId: null },
      });
      continue;
    }

    const title = status === "SP1" ? "SP1 Absensi" : "Peringatan Absensi";
    const message = status === "SP1"
      ? "Total keterlambatan Anda pada periode ini sudah mencapai status SP1."
      : "Total keterlambatan Anda pada periode ini sudah masuk status Warning.";
    let notificationId = log?.notificationId ?? null;
    if (notificationId) {
      const [updated] = await executor.update(notificationsTable).set({
        title,
        message,
        type: "attendance",
        isRead: false,
      }).where(eq(notificationsTable.id, notificationId)).returning({ id: notificationsTable.id });
      notificationId = updated?.id ?? null;
    }
    if (!notificationId) {
      const [notification] = await executor.insert(notificationsTable).values({
        userId: row.userId,
        title,
        message,
        type: "attendance",
      }).returning({ id: notificationsTable.id });
      notificationId = notification.id;
    }
    await executor.insert(attendanceNotificationLogsTable).values({
      userId: row.userId,
      periodStart,
      periodEnd,
      status,
      notificationId,
    }).onConflictDoUpdate({
      target: [
        attendanceNotificationLogsTable.userId,
        attendanceNotificationLogsTable.periodStart,
        attendanceNotificationLogsTable.periodEnd,
      ],
      set: { status, notificationId },
    });
  }
}

async function getHolidayDates(start: string, end: string, executor: any = db) {
  const settings = await getSettings(executor);
  const [existing, attendance] = await Promise.all([
    executor.select({ date: companyHolidaysTable.date })
      .from(companyHolidaysTable)
      .where(and(gte(companyHolidaysTable.date, start), lte(companyHolidaysTable.date, end))),
    executor.select({ date: attendanceHolidaysTable.date, source: attendanceHolidaysTable.source })
      .from(attendanceHolidaysTable)
      .where(and(gte(attendanceHolidaysTable.date, start), lte(attendanceHolidaysTable.date, end))),
  ]);
  return new Set<string>([
    ...existing.map((item: { date: string }) => item.date),
    ...attendance
      .filter((item: { source: string }) => settings.autoIndonesiaHoliday || item.source !== "Auto Indonesia Holiday")
      .map((item: { date: string }) => item.date),
  ]);
}

async function recalculateAttendanceDate(workDate: string) {
  const holidayDates = await getHolidayDates(workDate, workDate);
  const holiday = isWeekend(workDate) || holidayDates.has(workDate);
  const rows = await db.select().from(attendanceDailyTable).where(eq(attendanceDailyTable.workDate, workDate));
  const affectedBatches = new Set<number>();
  for (const row of rows) {
    affectedBatches.add(row.batchId);
    const clockIn = row.clockIn;
    const clockOut = row.clockOut;
    const overnight = Boolean(clockIn && clockOut && clockOut < clockIn);
    const late = !holiday && Boolean(clockIn && !overnight && clockIn.slice(0, 5) > "07:00");
    let overtimeProduction = 0;
    let overtimeOffice = 0;
    if (row.employeeType === "Produksi") {
      if (holiday && clockIn && clockOut) {
        let duration = timeHours(clockOut) - timeHours(clockIn);
        if (duration < 0) duration += 24;
        overtimeProduction = Math.max(0, duration) * 1.5;
      } else if (!holiday && clockIn && clockOut) {
        const adjustedOut = timeHours(clockOut) + (overnight ? 24 : 0);
        overtimeProduction = Math.max(0, adjustedOut - 17) * 1.5;
      }
    } else if (holiday && row.totalScans > 0) {
      overtimeOffice = 1;
    } else if (!holiday && clockIn && clockOut && timeHours(clockOut) + (overnight ? 24 : 0) > 18) {
      overtimeOffice = 1;
    }
    const noScan = row.totalScans === 0;
    await db.update(attendanceDailyTable).set({
      isHoliday: holiday,
      isLate: late,
      overtimeProduction: overtimeProduction.toFixed(2),
      overtimeOffice: overtimeOffice.toFixed(2),
      entryStatus: clockIn ? (late ? "Terlambat" : "Masuk") : "Tidak Ada Scan Masuk",
      exitStatus: clockOut ? "Pulang" : "Tidak Ada Scan Pulang",
      dailyStatus: noScan && !holiday ? "Tidak Absen" : holiday && row.totalScans > 0 ? "Lembur Hari Libur" : noScan ? "Libur" : "Hadir",
      notes: noScan && !holiday ? "Tidak ada data scan" : null,
    }).where(eq(attendanceDailyTable.id, row.id));
  }
  for (const batchId of affectedBatches) {
    const batch = (await db.select().from(attendanceImportBatchesTable).where(eq(attendanceImportBatchesTable.id, batchId)).limit(1))[0];
    if (!batch?.periodStart || !batch.periodEnd || batch.status !== "processed") continue;
    const daily = await db.select().from(attendanceDailyTable).where(eq(attendanceDailyTable.batchId, batchId));
    const totals = new Map<number, { userId: number | null; totalLate: number }>();
    for (const row of daily) {
      const current = totals.get(row.mappingId) ?? { userId: row.userId, totalLate: 0 };
      if (row.isLate) current.totalLate += 1;
      totals.set(row.mappingId, current);
    }
    await notifyAttendanceStatus([...totals.values()], batch.periodStart, batch.periodEnd);
  }
}

async function processBatch(batchId: number) {
  return db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(772026)`);
  const batch = (await tx.select().from(attendanceImportBatchesTable).where(eq(attendanceImportBatchesTable.id, batchId)).limit(1))[0];
  if (!batch) throw new Error("Batch import tidak ditemukan");
  if (batch.status === "processed") throw new Error("Batch ini sudah pernah diproses");
  const rows = await tx.select().from(attendanceImportRowsTable).where(eq(attendanceImportRowsTable.batchId, batchId)).orderBy(asc(attendanceImportRowsTable.rowNumber));
  const validRows = rows.filter((row) => row.isValid && row.machineName && row.scanDate && row.scanTime);
  if (validRows.length === 0) throw new Error("Tidak ada baris valid untuk diproses");
  const names = [...new Set(validRows.map((row) => row.machineName!))];
  const mappings = await tx.select().from(attendanceMappingsTable).where(inArray(attendanceMappingsTable.machineName, names));
  const mappingByName = new Map(mappings.filter((item) => item.isActive).map((item) => [item.machineName, item]));
  const unmapped = names.filter((name) => !mappingByName.has(name));
  if (unmapped.length > 0) {
    throw new Error(`Masih ada ${unmapped.length} nama belum mapping: ${unmapped.slice(0, 5).join(", ")}`);
  }
  const activeMappings = await tx.select().from(attendanceMappingsTable)
    .where(eq(attendanceMappingsTable.isActive, true));
  const dates = validRows.map((row) => row.scanDate!).sort();
  const periodStart = batch.periodStart ?? dates[0];
  const periodEnd = batch.periodEnd ?? dates.at(-1)!;

  const previousBatches = await tx.select({ id: attendanceImportBatchesTable.id })
    .from(attendanceImportBatchesTable)
    .where(and(
      eq(attendanceImportBatchesTable.periodStart, periodStart),
      eq(attendanceImportBatchesTable.periodEnd, periodEnd),
      eq(attendanceImportBatchesTable.status, "processed"),
    ));
  const previousIds = previousBatches.map((item) => item.id).filter((id) => id !== batchId);
  await tx.delete(attendanceDailyTable).where(eq(attendanceDailyTable.batchId, batchId));
  await tx.delete(attendanceScansTable).where(eq(attendanceScansTable.batchId, batchId));

  const entryKeys = new Set(validRows
    .filter((row) => row.ioType === "1")
    .map((row) => `${row.machineName}|${row.scanDate}`));
  const scanValues = validRows.map((row) => {
    const mapping = mappingByName.get(row.machineName!)!;
    const previousDate = addDays(row.scanDate!, -1);
    const earlyCheckout =
      row.ioType === "2" &&
      row.scanTime! < "12:00:00" &&
      entryKeys.has(`${row.machineName}|${previousDate}`);
    return {
      batchId,
      importRowId: row.id,
      mappingId: mapping.id,
      userId: mapping.userId,
      machineName: row.machineName!,
      displayName: mapping.displayName,
      employeeType: mapping.employeeType,
      department: row.department,
      scanDate: row.scanDate!,
      scanTime: row.scanTime!,
      workDate: earlyCheckout ? addDays(row.scanDate!, -1) : row.scanDate!,
      ioType: row.ioType,
    };
  });
  if (scanValues.length > 0) await tx.insert(attendanceScansTable).values(scanValues);

  const holidaySet = await getHolidayDates(periodStart, periodEnd, tx);
  const scansByPersonDate = new Map<string, typeof scanValues>();
  for (const scan of scanValues) {
    const key = `${scan.mappingId}|${scan.workDate}`;
    scansByPersonDate.set(key, [...(scansByPersonDate.get(key) ?? []), scan]);
  }
  const departments = new Map<number, string | null>();
  for (const scan of scanValues) if (!departments.has(scan.mappingId)) departments.set(scan.mappingId, scan.department);
  const dailyValues: Array<typeof attendanceDailyTable.$inferInsert> = [];
  for (const mapping of activeMappings) {
    for (const workDate of eachDate(periodStart, periodEnd)) {
      const scans = (scansByPersonDate.get(`${mapping.id}|${workDate}`) ?? []).sort((a, b) => a.scanTime.localeCompare(b.scanTime));
      const inScans = scans.filter((scan) => scan.ioType === "1");
      const outScans = scans.filter((scan) => scan.ioType === "2");
      let clockIn: string | null = inScans[0]?.scanTime ?? null;
      let clockOut: string | null = outScans.at(-1)?.scanTime ?? null;
      if (scans.length === 1) {
        clockIn = scans[0].scanTime < "16:00:00" ? scans[0].scanTime : null;
        clockOut = scans[0].scanTime >= "16:00:00" ? scans[0].scanTime : null;
      }
      if (!clockIn && !clockOut && scans.length >= 2) {
        clockIn = scans[0].scanTime;
        clockOut = scans.at(-1)!.scanTime;
      }
      const holiday = isWeekend(workDate) || holidaySet.has(workDate);
      const overnight = Boolean(clockIn && clockOut && clockOut < clockIn);
      const late = !holiday && Boolean(clockIn && !overnight && clockIn.slice(0, 5) > "07:00");
      let overtimeProduction = 0;
      let overtimeOffice = 0;
      if (mapping.employeeType === "Produksi") {
        if (holiday && clockIn && clockOut) {
          let duration = timeHours(clockOut) - timeHours(clockIn);
          if (duration < 0) duration += 24;
          overtimeProduction = Math.max(0, duration) * 1.5;
        } else if (!holiday && clockIn && clockOut) {
          const adjustedOut = timeHours(clockOut) + (overnight ? 24 : 0);
          overtimeProduction = Math.max(0, adjustedOut - 17) * 1.5;
        }
      } else if (holiday && scans.length > 0) {
        overtimeOffice = 1;
      } else if (!holiday && clockIn && clockOut && timeHours(clockOut) + (overnight ? 24 : 0) > 18) {
        overtimeOffice = 1;
      }
      const noScan = scans.length === 0;
      dailyValues.push({
        batchId,
        mappingId: mapping.id,
        userId: mapping.userId,
        machineName: mapping.machineName,
        displayName: mapping.displayName,
        employeeType: mapping.employeeType,
        department: departments.get(mapping.id) ?? null,
        workDate,
        clockIn,
        clockOut,
        totalScans: scans.length,
        isHoliday: holiday,
        isLate: late,
        overtimeProduction: overtimeProduction.toFixed(2),
        overtimeOffice: overtimeOffice.toFixed(2),
        entryStatus: clockIn ? (late ? "Terlambat" : "Masuk") : "Tidak Ada Scan Masuk",
        exitStatus: clockOut ? "Pulang" : "Tidak Ada Scan Pulang",
        dailyStatus: noScan && !holiday ? "Tidak Absen" : holiday && scans.length > 0 ? "Lembur Hari Libur" : noScan ? "Libur" : "Hadir",
        notes: noScan && !holiday ? "Tidak ada data scan" : null,
      });
    }
  }
  if (dailyValues.length > 0) await tx.insert(attendanceDailyTable).values(dailyValues);
  await tx.update(attendanceImportBatchesTable).set({
    status: "processed",
    periodStart,
    periodEnd,
    processedAt: new Date(),
  }).where(eq(attendanceImportBatchesTable.id, batchId));
  if (previousIds.length > 0) {
    await tx.update(attendanceImportBatchesTable).set({ status: "superseded" }).where(inArray(attendanceImportBatchesTable.id, previousIds));
    await tx.delete(attendanceDailyTable).where(inArray(attendanceDailyTable.batchId, previousIds));
    await tx.delete(attendanceScansTable).where(inArray(attendanceScansTable.batchId, previousIds));
  }

  const totals = new Map<number, { userId: number | null; totalLate: number }>();
  for (const row of dailyValues) {
    const current = totals.get(row.mappingId) ?? { userId: row.userId ?? null, totalLate: 0 };
    if (row.isLate) current.totalLate += 1;
    totals.set(row.mappingId, current);
  }
  await notifyAttendanceStatus([...totals.values()], periodStart, periodEnd, tx);
  return { periodStart, periodEnd, employees: activeMappings.length, scans: scanValues.length };
  });
}

router.post("/attendance/import/preview", upload.single("file"), async (req: any, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user || !requireAdmin(user, res)) return;
    if (!req.file) {
      res.status(400).json({ error: "Pilih file Excel atau CSV" });
      return;
    }
    const extension = req.file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!extension || ![".xls", ".xlsx", ".csv"].includes(extension)) {
      res.status(400).json({ error: "Format file harus .xls, .xlsx, atau .csv" });
      return;
    }
    const parsed = parseWorkbook(req.file.buffer);
    const valid = parsed.rows.filter((row) => row.isValid);
    const names = [...new Set(valid.map((row) => row.machineName!).filter(Boolean))];
    await ensureAutomaticMappings(names);
    const mappings = await db.select().from(attendanceMappingsTable).where(inArray(attendanceMappingsTable.machineName, names));
    const mappedSet = new Set(mappings.filter((item) => item.isActive).map((item) => item.machineName));
    const dates = valid.map((row) => row.scanDate!).filter(Boolean).sort();
    const firstPayroll = dates[0] ? payrollPeriodForDate(dates[0]) : null;
    const lastPayroll = dates.at(-1) ? payrollPeriodForDate(dates.at(-1)!) : null;
    if (firstPayroll && lastPayroll) {
      const duration = (new Date(`${lastPayroll.end}T00:00:00Z`).getTime() - new Date(`${firstPayroll.start}T00:00:00Z`).getTime()) / 86_400_000;
      if (duration > 370) throw new Error("Periode data maksimal 370 hari");
    }
    await db.update(attendanceImportBatchesTable).set({ status: "cancelled" }).where(and(
      eq(attendanceImportBatchesTable.uploadedBy, user.id),
      eq(attendanceImportBatchesTable.status, "preview"),
    ));
    const [batch] = await db.insert(attendanceImportBatchesTable).values({
      fileName: req.file.originalname,
      sheetName: parsed.sheetName,
      periodStart: firstPayroll?.start ?? null,
      periodEnd: lastPayroll?.end ?? null,
      totalRows: parsed.rows.length,
      validRows: valid.length,
      invalidRows: parsed.rows.length - valid.length,
      mappedNames: names.filter((name) => mappedSet.has(name)).length,
      unmappedNames: names.filter((name) => !mappedSet.has(name)).length,
      uploadedBy: user.id,
    }).returning();
    if (parsed.rows.length > 0) {
      await db.insert(attendanceImportRowsTable).values(parsed.rows.map((row) => ({
        batchId: batch.id,
        ...row,
      })));
    }
    res.json({
      batchId: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      mappedNames: names.filter((name) => mappedSet.has(name)),
      unmappedNames: names.filter((name) => !mappedSet.has(name)),
      invalidDetails: parsed.rows.filter((row) => !row.isValid).slice(0, 100).map((row) => ({
        rowNumber: row.rowNumber,
        errors: row.validationErrors,
      })),
      preview: parsed.rows.slice(0, 20),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Gagal membaca file" });
  }
});

router.post("/attendance/import/:batchId/cancel", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  await db.update(attendanceImportBatchesTable).set({ status: "cancelled" }).where(and(
    eq(attendanceImportBatchesTable.id, Number(req.params.batchId)),
    eq(attendanceImportBatchesTable.status, "preview"),
  ));
  res.json({ success: true });
});

router.post("/attendance/import/:batchId/process", async (req: any, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user || !requireAdmin(user, res)) return;
    res.json(await processBatch(Number(req.params.batchId)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Gagal memproses import" });
  }
});

router.get("/attendance/imports", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  if (!FULL_ACCESS_ROLES.has(String(user.role).toLowerCase())) {
    res.status(403).json({ error: "Akses ditolak" });
    return;
  }
  res.json(await db.select().from(attendanceImportBatchesTable).orderBy(desc(attendanceImportBatchesTable.createdAt)).limit(20));
});

router.get("/attendance/import/:batchId/preview", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const batchId = Number(req.params.batchId);
  if (!Number.isInteger(batchId)) {
    res.status(400).json({ error: "ID batch tidak valid" });
    return;
  }
  const batch = (await db.select().from(attendanceImportBatchesTable).where(and(
    eq(attendanceImportBatchesTable.id, batchId),
    eq(attendanceImportBatchesTable.status, "preview"),
  )).limit(1))[0];
  if (!batch) {
    res.status(404).json({ error: "Preview import tidak ditemukan" });
    return;
  }
  const rows = await db.select().from(attendanceImportRowsTable)
    .where(eq(attendanceImportRowsTable.batchId, batchId))
    .orderBy(asc(attendanceImportRowsTable.rowNumber));
  const names = [...new Set(rows.filter((row) => row.isValid && row.machineName).map((row) => row.machineName!))];
  const mappings = names.length
    ? await db.select().from(attendanceMappingsTable).where(and(
      inArray(attendanceMappingsTable.machineName, names),
      eq(attendanceMappingsTable.isActive, true),
    ))
    : [];
  const mappedSet = new Set(mappings.map((item) => item.machineName));
  res.json({
    batchId: batch.id,
    fileName: batch.fileName,
    sheetName: batch.sheetName,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    mappedNames: names.filter((name) => mappedSet.has(name)),
    unmappedNames: names.filter((name) => !mappedSet.has(name)),
    invalidDetails: rows.filter((row) => !row.isValid).slice(0, 100).map((row) => ({
      rowNumber: row.rowNumber,
      errors: row.validationErrors,
    })),
    preview: rows.slice(0, 20),
  });
});

router.get("/attendance/mappings", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  if (!FULL_ACCESS_ROLES.has(String(user.role).toLowerCase())) {
    res.status(403).json({ error: "Akses ditolak" });
    return;
  }
  const mappings = await db.select({
    id: attendanceMappingsTable.id,
    machineName: attendanceMappingsTable.machineName,
    displayName: attendanceMappingsTable.displayName,
    userId: attendanceMappingsTable.userId,
    employeeType: attendanceMappingsTable.employeeType,
    isActive: attendanceMappingsTable.isActive,
    userName: usersTable.name,
  }).from(attendanceMappingsTable).leftJoin(usersTable, eq(attendanceMappingsTable.userId, usersTable.id)).orderBy(asc(attendanceMappingsTable.machineName));
  const pendingNames = await db.selectDistinct({ machineName: attendanceImportRowsTable.machineName })
    .from(attendanceImportRowsTable)
    .innerJoin(attendanceImportBatchesTable, eq(attendanceImportRowsTable.batchId, attendanceImportBatchesTable.id))
    .leftJoin(attendanceMappingsTable, and(
      eq(attendanceImportRowsTable.machineName, attendanceMappingsTable.machineName),
      eq(attendanceMappingsTable.isActive, true),
    ))
    .where(and(
      eq(attendanceImportRowsTable.isValid, true),
      eq(attendanceImportBatchesTable.status, "preview"),
      sql`${attendanceMappingsTable.id} is null`,
    ));
  res.json({ mappings, pendingNames: pendingNames.map((item) => item.machineName).filter(Boolean) });
});

router.get("/attendance/users", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  res.json(await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.isActive, true)).orderBy(asc(usersTable.name)));
});

router.post("/attendance/mappings", async (req: any, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user || !requireAdmin(user, res)) return;
    const machineName = normalize(req.body.machineName);
    const displayName = normalize(req.body.displayName) || machineName;
    const employeeType = req.body.employeeType === "Office" ? "Office" : "Produksi";
    const userId = req.body.userId ? Number(req.body.userId) : null;
    if (!machineName) {
      res.status(400).json({ error: "Nama di mesin wajib diisi" });
      return;
    }
    const [mapping] = await db.insert(attendanceMappingsTable).values({
      machineName,
      displayName,
      employeeType,
      userId,
      isActive: req.body.isActive !== false,
    }).onConflictDoUpdate({
      target: attendanceMappingsTable.machineName,
      set: { displayName, employeeType, userId, isActive: req.body.isActive !== false, updatedAt: new Date() },
    }).returning();
    res.json(mapping);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Gagal menyimpan mapping" });
  }
});

router.patch("/attendance/mappings/:id", async (req: any, res) => {
  try {
    const user = await authenticate(req, res);
    if (!user || !requireAdmin(user, res)) return;
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.displayName !== undefined) changes.displayName = normalize(req.body.displayName);
    if (req.body.employeeType !== undefined) changes.employeeType = req.body.employeeType === "Office" ? "Office" : "Produksi";
    if (req.body.userId !== undefined) changes.userId = req.body.userId ? Number(req.body.userId) : null;
    if (req.body.isActive !== undefined) changes.isActive = Boolean(req.body.isActive);
    const [mapping] = await db.update(attendanceMappingsTable).set(changes).where(eq(attendanceMappingsTable.id, Number(req.params.id))).returning();
    res.json(mapping);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Gagal memperbarui mapping" });
  }
});

router.delete("/attendance/mappings/:id", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  await db.update(attendanceMappingsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(attendanceMappingsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.get("/attendance/holidays", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  const period = requestedPeriod(req, res);
  if (!period) return;
  const { start, end } = period;
  const settings = await getSettings();
  const [attendance, existing] = await Promise.all([
    db.select().from(attendanceHolidaysTable)
      .where(and(gte(attendanceHolidaysTable.date, start), lte(attendanceHolidaysTable.date, end)))
      .orderBy(asc(attendanceHolidaysTable.date)),
    db.select({ date: companyHolidaysTable.date, name: companyHolidaysTable.name })
      .from(companyHolidaysTable)
      .where(and(gte(companyHolidaysTable.date, start), lte(companyHolidaysTable.date, end)))
      .orderBy(asc(companyHolidaysTable.date)),
  ]);
  const attendanceDates = new Set(attendance.map((item) => item.date));
  res.json([
    ...attendance.filter((item) => settings.autoIndonesiaHoliday || item.source !== "Auto Indonesia Holiday").map((item) => ({ ...item, editable: true })),
    ...existing.filter((item) => !attendanceDates.has(item.date)).map((item, index) => ({
      id: -(index + 1),
      date: item.date,
      name: item.name,
      holidayType: "Libur Nasional",
      source: "Data Libur Existing",
      editable: false,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date)));
});

router.post("/attendance/holidays", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const date = normalize(req.body.date);
  const name = normalize(req.body.name);
  if (!isIsoDate(date) || !name) {
    res.status(400).json({ error: "Tanggal dan keterangan libur wajib valid" });
    return;
  }
  const [holiday] = await db.insert(attendanceHolidaysTable).values({
    date,
    name,
    holidayType: normalize(req.body.holidayType) || "Lainnya",
    source: normalize(req.body.source) || "Manual",
  }).onConflictDoUpdate({
    target: attendanceHolidaysTable.date,
    set: {
      name: normalize(req.body.name),
      holidayType: normalize(req.body.holidayType) || "Lainnya",
      source: normalize(req.body.source) || "Manual",
      updatedAt: new Date(),
    },
  }).returning();
  await recalculateAttendanceDate(holiday.date);
  res.json(holiday);
});

router.patch("/attendance/holidays/:id", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const previous = (await db.select().from(attendanceHolidaysTable).where(eq(attendanceHolidaysTable.id, Number(req.params.id))).limit(1))[0];
  if (!previous) {
    res.status(404).json({ error: "Tanggal libur tidak ditemukan" });
    return;
  }
  const date = normalize(req.body.date);
  const name = normalize(req.body.name);
  if (!isIsoDate(date) || !name) {
    res.status(400).json({ error: "Tanggal dan keterangan libur wajib valid" });
    return;
  }
  const [holiday] = await db.update(attendanceHolidaysTable).set({
    date,
    name,
    holidayType: normalize(req.body.holidayType) || "Lainnya",
    source: normalize(req.body.source) || "Manual",
    updatedAt: new Date(),
  }).where(eq(attendanceHolidaysTable.id, Number(req.params.id))).returning();
  if (previous?.date && previous.date !== holiday.date) await recalculateAttendanceDate(previous.date);
  await recalculateAttendanceDate(holiday.date);
  res.json(holiday);
});

router.delete("/attendance/holidays/:id", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const previous = (await db.select().from(attendanceHolidaysTable).where(eq(attendanceHolidaysTable.id, Number(req.params.id))).limit(1))[0];
  await db.delete(attendanceHolidaysTable).where(eq(attendanceHolidaysTable.id, Number(req.params.id)));
  if (previous?.date) await recalculateAttendanceDate(previous.date);
  res.json({ success: true });
});

router.get("/attendance/settings", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  res.json(await getSettings());
});

router.patch("/attendance/settings", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const requestedSafeMax = Number(req.body.safeMax ?? 2);
  const requestedWarningMax = Number(req.body.warningMax ?? 4);
  if (!Number.isInteger(requestedSafeMax) || !Number.isInteger(requestedWarningMax)) {
    res.status(400).json({ error: "Threshold harus berupa bilangan bulat" });
    return;
  }
  const safeMax = Math.max(0, requestedSafeMax);
  const warningMax = Math.max(safeMax + 1, requestedWarningMax);
  const [settings] = await db.update(attendanceSettingsTable).set({
    safeMax,
    warningMax,
    autoIndonesiaHoliday: Boolean(req.body.autoIndonesiaHoliday),
    updatedAt: new Date(),
  }).where(eq(attendanceSettingsTable.id, 1)).returning();
  const automaticDates = await db.select({ date: attendanceHolidaysTable.date })
    .from(attendanceHolidaysTable)
    .where(eq(attendanceHolidaysTable.source, "Auto Indonesia Holiday"));
  for (const item of automaticDates) await recalculateAttendanceDate(item.date);
  const processedBatches = await db.select().from(attendanceImportBatchesTable)
    .where(eq(attendanceImportBatchesTable.status, "processed"));
  for (const batch of processedBatches) {
    if (!batch.periodStart || !batch.periodEnd) continue;
    const daily = await db.select().from(attendanceDailyTable).where(eq(attendanceDailyTable.batchId, batch.id));
    const totals = new Map<number, { userId: number | null; totalLate: number }>();
    for (const row of daily) {
      const current = totals.get(row.mappingId) ?? { userId: row.userId, totalLate: 0 };
      if (row.isLate) current.totalLate += 1;
      totals.set(row.mappingId, current);
    }
    await notifyAttendanceStatus([...totals.values()], batch.periodStart, batch.periodEnd);
  }
  res.json(settings);
});

router.post("/attendance/holidays/sync-indonesia", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user || !requireAdmin(user, res)) return;
  const years = Array.isArray(req.body.years) ? req.body.years.map(Number) : [new Date().getFullYear()];
  let imported = 0;
  const failures: number[] = [];
  const importedDates = new Set<string>();
  for (const year of years) {
    try {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(String(response.status));
      const holidays = await response.json() as Array<{ date: string; localName: string; name: string }>;
      for (const holiday of holidays) {
        await db.insert(attendanceHolidaysTable).values({
          date: holiday.date,
          name: holiday.localName || holiday.name,
          holidayType: "Libur Nasional",
          source: "Auto Indonesia Holiday",
        }).onConflictDoNothing();
        imported += 1;
        importedDates.add(holiday.date);
      }
    } catch {
      failures.push(year);
    }
  }
  for (const date of importedDates) await recalculateAttendanceDate(date);
  res.json({ imported, failures, message: failures.length ? "Sebagian sinkronisasi gagal; data manual tetap dapat digunakan." : "Sinkronisasi selesai." });
});

async function loadAttendance(start: string, end: string, user: AuthUser) {
  const fullAccess = FULL_ACCESS_ROLES.has(String(user.role).toLowerCase());
  const condition = fullAccess
    ? and(gte(attendanceDailyTable.workDate, start), lte(attendanceDailyTable.workDate, end))
    : and(gte(attendanceDailyTable.workDate, start), lte(attendanceDailyTable.workDate, end), eq(attendanceDailyTable.userId, user.id));
  const rows = await db.select().from(attendanceDailyTable)
    .innerJoin(attendanceImportBatchesTable, eq(attendanceDailyTable.batchId, attendanceImportBatchesTable.id))
    .where(and(condition, eq(attendanceImportBatchesTable.status, "processed")))
    .orderBy(desc(attendanceImportBatchesTable.id), asc(attendanceDailyTable.workDate));
  const deduped = new Map<string, typeof attendanceDailyTable.$inferSelect>();
  for (const joined of rows) {
    const row = joined.attendance_daily;
    const key = `${row.mappingId}|${row.workDate}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return [...deduped.values()];
}

function summarize(rows: Awaited<ReturnType<typeof loadAttendance>>, settings: { safeMax: number; warningMax: number }) {
  const people = new Map<number, {
    mappingId: number;
    userId: number | null;
    name: string;
    machineName: string;
    employeeType: string;
    department: string | null;
    totalLate: number;
    overtimeProduction: number;
    overtimeOffice: number;
    scanDays: number;
  }>();
  for (const row of rows) {
    const person = people.get(row.mappingId) ?? {
      mappingId: row.mappingId,
      userId: row.userId,
      name: row.displayName,
      machineName: row.machineName,
      employeeType: row.employeeType,
      department: row.department,
      totalLate: 0,
      overtimeProduction: 0,
      overtimeOffice: 0,
      scanDays: 0,
    };
    if (row.isLate) person.totalLate += 1;
    person.overtimeProduction += Number(row.overtimeProduction);
    person.overtimeOffice += Number(row.overtimeOffice);
    if (row.totalScans > 0) person.scanDays += 1;
    people.set(row.mappingId, person);
  }
  return [...people.values()].map((person) => ({
    ...person,
    overtimeProduction: Number(person.overtimeProduction.toFixed(2)),
    overtimeOffice: Number(person.overtimeOffice.toFixed(2)),
    status: statusFromLate(person.totalLate, settings),
  })).sort((a, b) => a.name.localeCompare(b.name, "id"));
}

router.get("/attendance/summary", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  const period = requestedPeriod(req, res);
  if (!period) return;
  const { start, end } = period;
  const settings = await getSettings();
  const rows = await loadAttendance(start, end, user);
  let employees = summarize(rows, settings);
  const search = normalize(req.query.search).toLowerCase();
  if (search) employees = employees.filter((item) => item.name.toLowerCase().includes(search));
  if (req.query.department) employees = employees.filter((item) => item.department === req.query.department);
  if (req.query.employeeType) employees = employees.filter((item) => item.employeeType === req.query.employeeType);
  if (req.query.status) employees = employees.filter((item) => item.status === req.query.status);
  if (req.query.onlyWithScans === "true") employees = employees.filter((item) => item.scanDays > 0);
  const fullAccess = FULL_ACCESS_ROLES.has(String(user.role).toLowerCase());
  const mappings = fullAccess ? await db.select().from(attendanceMappingsTable) : [];
  const pendingNames = fullAccess
    ? await db.selectDistinct({ machineName: attendanceImportRowsTable.machineName })
      .from(attendanceImportRowsTable)
      .innerJoin(attendanceImportBatchesTable, eq(attendanceImportRowsTable.batchId, attendanceImportBatchesTable.id))
      .leftJoin(attendanceMappingsTable, and(
        eq(attendanceImportRowsTable.machineName, attendanceMappingsTable.machineName),
        eq(attendanceMappingsTable.isActive, true),
      ))
      .where(and(
        eq(attendanceImportRowsTable.isValid, true),
        eq(attendanceImportBatchesTable.status, "preview"),
        sql`${attendanceMappingsTable.id} is null`,
      ))
    : [];
  res.json({
    periodStart: start,
    periodEnd: end,
    employees,
    departments: [...new Set(employees.map((item) => item.department).filter(Boolean))],
    summary: {
      totalEmployees: employees.length,
      totalLate: employees.reduce((sum, item) => sum + item.totalLate, 0),
      totalOvertimeProduction: employees.reduce((sum, item) => sum + item.overtimeProduction, 0),
      totalOvertimeOffice: employees.reduce((sum, item) => sum + item.overtimeOffice, 0),
      warning: employees.filter((item) => item.status === "Warning").length,
      sp1: employees.filter((item) => item.status === "SP1").length,
      unmapped: fullAccess ? pendingNames.length : 0,
      activeMappings: mappings.filter((item) => item.isActive).length,
    },
  });
});

router.get("/attendance/detail/:mappingId", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  const period = requestedPeriod(req, res);
  if (!period) return;
  const mappingId = Number(req.params.mappingId);
  if (!Number.isInteger(mappingId)) {
    res.status(400).json({ error: "ID mapping tidak valid" });
    return;
  }
  const { start, end } = period;
  const rows = (await loadAttendance(start, end, user)).filter((row) => row.mappingId === mappingId);
  if (rows.length === 0) {
    res.status(404).json({ error: "Detail absensi tidak ditemukan" });
    return;
  }
  const batchIds = [...new Set(rows.map((row) => row.batchId))];
  const rawScans = await db.select({
    id: attendanceScansTable.id,
    workDate: attendanceScansTable.workDate,
    scanDate: attendanceScansTable.scanDate,
    scanTime: attendanceScansTable.scanTime,
    ioType: attendanceScansTable.ioType,
  }).from(attendanceScansTable).where(and(
    eq(attendanceScansTable.mappingId, mappingId),
    inArray(attendanceScansTable.batchId, batchIds),
    gte(attendanceScansTable.workDate, start),
    lte(attendanceScansTable.workDate, end),
  )).orderBy(asc(attendanceScansTable.workDate), asc(attendanceScansTable.scanTime));
  const settings = await getSettings();
  res.json({ employee: summarize(rows, settings)[0], daily: rows, rawScans });
});

router.get("/attendance/export", async (req: any, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  const period = requestedPeriod(req, res);
  if (!period) return;
  const { start, end } = period;
  const rows = await loadAttendance(start, end, user);
  const employees = summarize(rows, await getSettings());
  const settings = await getSettings();
  const [attendanceHolidays, existingHolidays] = await Promise.all([
    db.select().from(attendanceHolidaysTable)
      .where(and(gte(attendanceHolidaysTable.date, start), lte(attendanceHolidaysTable.date, end)))
      .orderBy(asc(attendanceHolidaysTable.date)),
    db.select({ date: companyHolidaysTable.date, name: companyHolidaysTable.name })
      .from(companyHolidaysTable)
      .where(and(gte(companyHolidaysTable.date, start), lte(companyHolidaysTable.date, end)))
      .orderBy(asc(companyHolidaysTable.date)),
  ]);
  const attendanceHolidayDates = new Set(attendanceHolidays.map((item) => item.date));
  const holidays = [
    ...attendanceHolidays.filter((item) => settings.autoIndonesiaHoliday || item.source !== "Auto Indonesia Holiday"),
    ...existingHolidays.filter((item) => !attendanceHolidayDates.has(item.date)).map((item) => ({
      ...item,
      holidayType: "Libur Nasional",
      source: "Data Libur Existing",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Nama", "Tipe Karyawan", "Total Telat", "Total Lembur Produksi", "Total Lembur Office", "Status"],
    ...employees.map((item) => [
      item.name,
      item.employeeType,
      item.totalLate,
      item.overtimeProduction,
      item.overtimeOffice,
      item.status,
    ]),
  ]), "Rekap Absensi");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Tanggal Libur", "Keterangan", "Jenis", "Sumber"],
    ...holidays.map((item) => [item.date, item.name, item.holidayType, item.source]),
  ]), "Tanggal Libur");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Nama", "Tanggal", "Jam Masuk", "Jam Pulang", "Total Scan", "Status Masuk", "Status Pulang", "Status Harian", "Keterangan"],
    ...rows.map((item) => [
      item.displayName,
      item.workDate,
      item.clockIn ?? "",
      item.clockOut ?? "",
      item.totalScans,
      item.entryStatus,
      item.exitStatus,
      item.dailyStatus,
      item.notes ?? "",
    ]),
  ]), "Detail Harian");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `Rekap Absensi - ${periodFileLabel(start, end)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
});

export default router;
