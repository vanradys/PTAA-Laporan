CREATE TABLE IF NOT EXISTS assigned_daily_tasks (
  id serial PRIMARY KEY,
  assignee_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_name text NOT NULL,
  assigned_by_role text NOT NULL,
  title text NOT NULL,
  project text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_task_id integer REFERENCES daily_tasks(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assigned_daily_tasks_assignee_status_idx
  ON assigned_daily_tasks (assignee_user_id, status, created_at DESC);
