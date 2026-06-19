BEGIN;

CREATE TABLE IF NOT EXISTS todo_tasks (
  id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'personal',
  start_date date NOT NULL,
  due_date date NOT NULL,
  priority text NOT NULL DEFAULT 'Sedang',
  status text NOT NULL DEFAULT 'Belum Mulai',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS todo_task_assignees (
  id serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS todo_task_checklist (
  id serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS todo_task_comments (
  id serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_todo_id integer;

CREATE INDEX IF NOT EXISTS todo_task_assignees_user_id_idx ON todo_task_assignees(user_id);
CREATE INDEX IF NOT EXISTS todo_tasks_date_idx ON todo_tasks(start_date, due_date);
CREATE INDEX IF NOT EXISTS notifications_related_todo_id_idx ON notifications(related_todo_id);

COMMIT;
