CREATE TABLE IF NOT EXISTS po_internal_comments (
  id SERIAL PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES projects_po(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_internal_comments_po_id
  ON po_internal_comments(po_id);

CREATE INDEX IF NOT EXISTS idx_po_internal_comments_created_at
  ON po_internal_comments(created_at DESC);
