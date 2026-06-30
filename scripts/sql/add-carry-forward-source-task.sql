ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS carry_forward_source_task_id integer REFERENCES daily_tasks(id) ON DELETE SET NULL;
