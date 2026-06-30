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
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
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

ALTER TABLE todo_tasks
  ALTER COLUMN created_by_user_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'todo_tasks'::regclass
      AND conname = 'todo_tasks_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE todo_tasks DROP CONSTRAINT todo_tasks_created_by_user_id_fkey;
  END IF;
  ALTER TABLE todo_tasks
    ADD CONSTRAINT todo_tasks_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'todo_tasks'::regclass
      AND conname = 'todo_tasks_type_check'
  ) THEN
    ALTER TABLE todo_tasks
      ADD CONSTRAINT todo_tasks_type_check CHECK (type IN ('personal', 'personal_permanent', 'team'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'todo_tasks'::regclass
      AND conname = 'todo_tasks_priority_check'
  ) THEN
    ALTER TABLE todo_tasks
      ADD CONSTRAINT todo_tasks_priority_check CHECK (priority IN ('Rendah', 'Sedang', 'Urgent'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'todo_tasks'::regclass
      AND conname = 'todo_tasks_status_check'
  ) THEN
    ALTER TABLE todo_tasks
      ADD CONSTRAINT todo_tasks_status_check CHECK (status IN ('Belum Mulai', 'In Progress', 'Selesai'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'todo_tasks'::regclass
      AND conname = 'todo_tasks_date_check'
  ) THEN
    ALTER TABLE todo_tasks
      ADD CONSTRAINT todo_tasks_date_check CHECK (due_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS todo_task_assignees_user_id_idx ON todo_task_assignees(user_id);
CREATE INDEX IF NOT EXISTS todo_tasks_date_idx ON todo_tasks(start_date, due_date);
CREATE INDEX IF NOT EXISTS notifications_related_todo_id_idx ON notifications(related_todo_id);

COMMIT;
