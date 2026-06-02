CREATE TABLE IF NOT EXISTS po_change_logs (
  id serial PRIMARY KEY,
  po_id integer REFERENCES projects_po(id) ON DELETE SET NULL,
  no_po text NOT NULL,
  action text NOT NULL,
  changes jsonb NOT NULL,
  changed_by_user_id integer REFERENCES users(id),
  changed_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS po_change_logs_po_id_idx ON po_change_logs(po_id);
CREATE INDEX IF NOT EXISTS po_change_logs_created_at_idx ON po_change_logs(created_at DESC);
