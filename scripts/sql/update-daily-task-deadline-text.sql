ALTER TABLE daily_tasks
  ALTER COLUMN deadline TYPE text USING deadline::text;
