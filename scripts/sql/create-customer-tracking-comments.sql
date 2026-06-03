CREATE TABLE IF NOT EXISTS customer_tracking_comments (
  id SERIAL PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES projects_po(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_customer_tracking_comments_po_id
  ON customer_tracking_comments(po_id);

CREATE INDEX IF NOT EXISTS idx_customer_tracking_comments_created_at
  ON customer_tracking_comments(created_at DESC);
