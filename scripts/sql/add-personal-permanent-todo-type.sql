ALTER TABLE todo_tasks
  DROP CONSTRAINT IF EXISTS todo_tasks_type_check;

ALTER TABLE todo_tasks
  ADD CONSTRAINT todo_tasks_type_check
  CHECK (type IN ('personal', 'personal_permanent', 'team'));
