BEGIN;

ALTER TABLE todo_tasks
  ADD COLUMN IF NOT EXISTS due_time text;

ALTER TABLE todo_tasks
  DROP CONSTRAINT IF EXISTS todo_tasks_due_time_check;

ALTER TABLE todo_tasks
  ADD CONSTRAINT todo_tasks_due_time_check
  CHECK (due_time IS NULL OR due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

COMMIT;
