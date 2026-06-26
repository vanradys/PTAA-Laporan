import { Router } from "express";
import {
  db,
  eq,
  sql,
  websiteTutorialsTable,
} from "@workspace/db";
import { getUserFromToken } from "./auth";
import { canEditByPermission } from "../services/editPermissions";

const router = Router();

const DEFAULT_TUTORIALS = [
  ["Cara membuat laporan harian", "1. Buka menu Laporan Harian.\n2. Isi daftar tugas hari ini.\n3. Lengkapi persoalan yang dihadapi dan rencana besok.\n4. Simpan draf atau kirim laporan saat sudah selesai."],
  ["Cara mengisi tugas", "1. Tekan Tambah Tugas.\n2. Isi nama tugas, project, tanggal tugas diberikan, tanggal tugas diselesaikan, status, dan job yang dikerjakan.\n3. Simpan perubahan sebelum mengirim laporan."],
  ["Cara update progress", "1. Buka tugas pada Laporan Harian.\n2. Ubah status tugas.\n3. Progress mengikuti status yang dipilih secara otomatis."],
  ["Cara menggunakan To Do List", "1. Buka menu To Do List.\n2. Buat tugas pribadi atau tugas tim.\n3. Tambahkan checklist, tag karyawan, komentar, dan ubah status sesuai kebutuhan."],
  ["Cara membaca notifikasi", "1. Buka menu Notifikasi atau ikon lonceng.\n2. Baca daftar pemberitahuan terbaru.\n3. Buka detail jika notifikasi berhubungan dengan laporan, tugas, atau project."],
  ["Cara monitoring PO", "1. Buka Jadwal Project.\n2. Gunakan filter periode, customer, progress, atau status.\n3. Buka detail PO untuk melihat informasi project."],
  ["Cara absensi", "1. Buka menu Absensi.\n2. Admin/Finance dapat upload Excel Fingerspot dan mengelola tanggal libur.\n3. Karyawan dapat melihat status absensi masing-masing."],
  ["Cara penggunaan fitur sesuai role", "Admin dapat mengelola data dan panduan. Finance/Admin dapat mengelola absensi. Monitoring dapat melihat rekap. Karyawan mengisi laporan, To Do List, dan melihat notifikasi."],
] as const;

async function authenticate(req: any, res: any) {
  const token = req.cookies?.session_token;
  const user = token ? await getUserFromToken(token) : null;
  if (!user) res.status(401).json({ error: "Tidak terautentikasi" });
  return user;
}

async function seedTutorialsIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websiteTutorialsTable);
  if (count > 0) return;
  await db.insert(websiteTutorialsTable).values(
    DEFAULT_TUTORIALS.map(([title, content], index) => ({
      title,
      content,
      sortOrder: (index + 1) * 10,
    })),
  );
}

function buildTutorial(item: typeof websiteTutorialsTable.$inferSelect) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    sortOrder: item.sortOrder,
    screenshotData: null,
    screenshotMimeType: item.screenshotMimeType ?? null,
    screenshotUrl: item.screenshotData ? `/api/tutorials/${item.id}/screenshot` : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/tutorials", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  await seedTutorialsIfEmpty();
  const items = await db.select().from(websiteTutorialsTable)
    .orderBy(websiteTutorialsTable.sortOrder, websiteTutorialsTable.id);
  res.json(items.map(buildTutorial));
});

router.get("/tutorials/:id/screenshot", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  const [item] = await db.select({
    screenshotData: websiteTutorialsTable.screenshotData,
    screenshotMimeType: websiteTutorialsTable.screenshotMimeType,
  }).from(websiteTutorialsTable)
    .where(eq(websiteTutorialsTable.id, Number(req.params.id)))
    .limit(1);
  if (!item?.screenshotData) { res.status(404).json({ error: "Screenshot tidak ditemukan" }); return; }

  const match = item.screenshotData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) { res.status(422).json({ error: "Format screenshot tidak valid" }); return; }

  const mimeType = item.screenshotMimeType || match[1] || "image/jpeg";
  const buffer = Buffer.from(match[2], "base64");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buffer);
});

router.post("/tutorials", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  if (!(await canEditByPermission(user, "tutorial_manage"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menambah panduan" });
    return;
  }
  const title = String(req.body?.title ?? "").trim();
  const content = String(req.body?.content ?? "").trim();
  const sortOrder = Number(req.body?.sortOrder ?? 0);
  if (!title || !content) { res.status(400).json({ error: "Judul dan konten wajib diisi" }); return; }
  const [created] = await db.insert(websiteTutorialsTable).values({
    title,
    content,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    screenshotData: req.body?.screenshotData || null,
    screenshotMimeType: req.body?.screenshotMimeType || null,
    updatedByUserId: user.id,
  }).returning();
  res.status(201).json(buildTutorial(created));
});

router.patch("/tutorials/:id", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  if (!(await canEditByPermission(user, "tutorial_manage"))) {
    res.status(403).json({ error: "Tidak punya izin untuk mengedit panduan" });
    return;
  }
  const id = Number(req.params.id);
  const updates: Partial<typeof websiteTutorialsTable.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: new Date(),
  };
  if (req.body?.title !== undefined) updates.title = String(req.body.title).trim();
  if (req.body?.content !== undefined) updates.content = String(req.body.content).trim();
  if (req.body?.sortOrder !== undefined) {
    const sortOrder = Number(req.body.sortOrder);
    updates.sortOrder = Number.isFinite(sortOrder) ? sortOrder : 0;
  }
  if (req.body?.screenshotData !== undefined) updates.screenshotData = req.body.screenshotData || null;
  if (req.body?.screenshotMimeType !== undefined) updates.screenshotMimeType = req.body.screenshotMimeType || null;
  if (updates.title === "" || updates.content === "") {
    res.status(400).json({ error: "Judul dan konten tidak boleh kosong" });
    return;
  }
  const [updated] = await db.update(websiteTutorialsTable).set(updates)
    .where(eq(websiteTutorialsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Panduan tidak ditemukan" }); return; }
  res.json(buildTutorial(updated));
});

router.delete("/tutorials/:id", async (req, res) => {
  const user = await authenticate(req, res);
  if (!user) return;
  if (!(await canEditByPermission(user, "tutorial_manage"))) {
    res.status(403).json({ error: "Tidak punya izin untuk menghapus panduan" });
    return;
  }
  const [deleted] = await db.delete(websiteTutorialsTable)
    .where(eq(websiteTutorialsTable.id, Number(req.params.id))).returning();
  if (!deleted) { res.status(404).json({ error: "Panduan tidak ditemukan" }); return; }
  res.json({ success: true });
});

export default router;
