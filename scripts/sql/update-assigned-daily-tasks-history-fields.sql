ALTER TABLE assigned_daily_tasks
  ADD COLUMN IF NOT EXISTS assigned_by_department text,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS assigned_to_department text,
  ADD COLUMN IF NOT EXISTS response_note text;

UPDATE assigned_daily_tasks
SET status = 'rejected'
WHERE status = 'declined';

UPDATE assigned_daily_tasks AS assignment
SET
  assigned_to_name = COALESCE(assignment.assigned_to_name, assignee.name),
  assigned_to_department = COALESCE(assignment.assigned_to_department, assignee_department.name)
FROM users AS assignee
LEFT JOIN departments AS assignee_department ON assignee.department_id = assignee_department.id
WHERE assignment.assignee_user_id = assignee.id;

UPDATE assigned_daily_tasks AS assignment
SET assigned_by_department = COALESCE(assignment.assigned_by_department, assigner_department.name)
FROM users AS assigner
LEFT JOIN departments AS assigner_department ON assigner.department_id = assigner_department.id
WHERE assignment.assigned_by_user_id = assigner.id;

CREATE INDEX IF NOT EXISTS assigned_daily_tasks_assigner_created_idx
  ON assigned_daily_tasks (assigned_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assigned_daily_tasks_assignee_created_idx
  ON assigned_daily_tasks (assignee_user_id, created_at DESC);
