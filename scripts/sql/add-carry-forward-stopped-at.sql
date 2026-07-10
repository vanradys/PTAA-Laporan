ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS carry_forward_stopped_at timestamptz;
