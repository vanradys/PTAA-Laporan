import { db, reportCommentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();

router.get("/reports/:id/comments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const comments = await db
    .select({
      id: reportCommentsTable.id,
      reportId: reportCommentsTable.reportId,
      userId: reportCommentsTable.userId,
      comment: reportCommentsTable.comment,
      createdAt: reportCommentsTable.createdAt,
      userName: usersTable.name,
      userRole: usersTable.role,
    })
    .from(reportCommentsTable)
    .leftJoin(usersTable, eq(reportCommentsTable.userId, usersTable.id))
    .where(eq(reportCommentsTable.reportId, id))
    .orderBy(reportCommentsTable.createdAt);

  res.json(comments.map(c => ({
    id: c.id, reportId: c.reportId, userId: c.userId,
    userName: c.userName ?? "", userRole: c.userRole ?? "",
    comment: c.comment, createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/reports/:id/comments", async (req, res) => {
  const token = req.cookies?.session_token;
  if (!token) { res.status(401).json({ error: "Tidak terautentikasi" }); return; }
  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Sesi tidak valid" }); return; }

  const id = parseInt(req.params.id);
  const { comment } = req.body;
  if (!comment) { res.status(400).json({ error: "Komentar tidak boleh kosong" }); return; }

  const [inserted] = await db.insert(reportCommentsTable).values({
    reportId: id,
    userId: user.id,
    comment,
  }).returning();

  res.status(201).json({
    id: inserted.id, reportId: inserted.reportId, userId: inserted.userId,
    userName: user.name, userRole: user.role,
    comment: inserted.comment, createdAt: inserted.createdAt.toISOString(),
  });
});

export default router;
