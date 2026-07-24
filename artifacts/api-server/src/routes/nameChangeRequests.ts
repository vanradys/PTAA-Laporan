import { Router } from "express";
import {
  and,
  db,
  desc,
  eq,
  nameChangeRequestsTable,
  usersTable,
} from "@workspace/db";
import { getSessionTokenFromRequest, getUserFromToken } from "./auth";

const router = Router();

async function requireUser(req: any, res: any) {
  const token = getSessionTokenFromRequest(req);
  const user = token ? await getUserFromToken(token) : null;
  if (!user) res.status(401).json({ error: "Tidak terautentikasi" });
  return user;
}

router.get("/name-change-requests/mine", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const requests = await db
    .select()
    .from(nameChangeRequestsTable)
    .where(eq(nameChangeRequestsTable.userId, user.id))
    .orderBy(desc(nameChangeRequestsTable.createdAt))
    .limit(10);
  res.json(requests);
});

router.post("/name-change-requests", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const requestedName = String(req.body?.requestedName ?? "").trim();
  if (requestedName.length < 2 || requestedName.length > 100) {
    res.status(400).json({ error: "Nama harus terdiri dari 2 sampai 100 karakter" });
    return;
  }
  if (requestedName === user.name) {
    res.status(400).json({ error: "Nama baru sama dengan nama saat ini" });
    return;
  }

  const [pending] = await db
    .select({ id: nameChangeRequestsTable.id })
    .from(nameChangeRequestsTable)
    .where(and(
      eq(nameChangeRequestsTable.userId, user.id),
      eq(nameChangeRequestsTable.status, "pending"),
    ))
    .limit(1);
  if (pending) {
    res.status(400).json({ error: "Masih ada pengajuan perubahan nama yang menunggu Admin" });
    return;
  }

  const [created] = await db.insert(nameChangeRequestsTable).values({
    userId: user.id,
    currentName: user.name,
    requestedName,
  }).returning();
  res.status(201).json(created);
});

router.get("/name-change-requests", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat melihat pengajuan nama" });
    return;
  }

  const requests = await db
    .select()
    .from(nameChangeRequestsTable)
    .orderBy(desc(nameChangeRequestsTable.createdAt));
  res.json(requests);
});

router.patch("/name-change-requests/:id", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (String(user.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang dapat memproses pengajuan nama" });
    return;
  }

  const id = Number(req.params.id);
  const action = String(req.body?.action ?? "");
  if (!Number.isInteger(id) || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Permintaan tidak valid" });
    return;
  }

  const [request] = await db
    .select()
    .from(nameChangeRequestsTable)
    .where(eq(nameChangeRequestsTable.id, id))
    .limit(1);
  if (!request) {
    res.status(404).json({ error: "Pengajuan tidak ditemukan" });
    return;
  }
  if (request.status !== "pending") {
    res.status(400).json({ error: "Pengajuan ini sudah diproses" });
    return;
  }

  if (action === "approve") {
    await db.update(usersTable)
      .set({ name: request.requestedName })
      .where(eq(usersTable.id, request.userId));
  }

  const [updated] = await db.update(nameChangeRequestsTable).set({
    status: action === "approve" ? "approved" : "rejected",
    reviewedByUserId: user.id,
    reviewedByName: user.name,
    reviewedAt: new Date(),
  }).where(eq(nameChangeRequestsTable.id, id)).returning();
  res.json(updated);
});

export default router;
