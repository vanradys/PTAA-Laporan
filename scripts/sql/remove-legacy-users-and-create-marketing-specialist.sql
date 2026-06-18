BEGIN;

CREATE TABLE IF NOT EXISTS removed_user_archives (
  email text PRIMARY KEY,
  archived_at timestamptz NOT NULL DEFAULT NOW(),
  payload jsonb NOT NULL
);

INSERT INTO removed_user_archives (email, archived_at, payload)
SELECT
  lower(u.email),
  NOW(),
  jsonb_build_object(
    'user', to_jsonb(u),
    'daily_reports', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(r) ||
        jsonb_build_object(
          'tasks', COALESCE((
            SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
            FROM daily_tasks t
            WHERE t.report_id = r.id
          ), '[]'::jsonb),
          'comments', COALESCE((
            SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
            FROM report_comments c
            WHERE c.report_id = r.id
          ), '[]'::jsonb)
        )
        ORDER BY r.id
      )
      FROM daily_reports r
      WHERE r.user_id = u.id
    ), '[]'::jsonb),
    'authored_report_comments', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM report_comments c
      WHERE c.user_id = u.id
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id)
      FROM notifications n
      WHERE n.user_id = u.id
    ), '[]'::jsonb),
    'assigned_tasks', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
      FROM assigned_daily_tasks a
      WHERE a.assignee_user_id = u.id OR a.assigned_by_user_id = u.id
    ), '[]'::jsonb),
    'po_references', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
      FROM projects_po p
      WHERE
        p.pic_user_id = u.id
        OR p.created_by_user_id = u.id
        OR p.closed_by_user_id = u.id
    ), '[]'::jsonb),
    'po_change_logs', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM po_change_logs l
      WHERE l.changed_by_user_id = u.id
    ), '[]'::jsonb),
    'po_internal_comments', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM po_internal_comments c
      WHERE c.user_id = u.id
    ), '[]'::jsonb),
    'task_reviews', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
      FROM daily_tasks t
      WHERE t.reviewed_by_user_id = u.id
    ), '[]'::jsonb)
  )
FROM users u
WHERE lower(u.email) IN (
  'admin@ptaa.com',
  'eko@perusahaan.com',
  'budi@perusahaan.com'
)
ON CONFLICT (email) DO UPDATE SET
  archived_at = EXCLUDED.archived_at,
  payload = EXCLUDED.payload;

CREATE TEMP TABLE users_to_remove ON COMMIT DROP AS
SELECT id
FROM users
WHERE lower(email) IN (
  'admin@ptaa.com',
  'eko@perusahaan.com',
  'budi@perusahaan.com'
);

DELETE FROM sessions
WHERE user_id IN (SELECT id FROM users_to_remove);

DELETE FROM notifications
WHERE user_id IN (SELECT id FROM users_to_remove);

DELETE FROM report_comments
WHERE user_id IN (SELECT id FROM users_to_remove);

DELETE FROM daily_reports
WHERE user_id IN (SELECT id FROM users_to_remove);

DELETE FROM daily_report_reminder_logs
WHERE user_id IN (SELECT id FROM users_to_remove);

UPDATE daily_report_reminder_logs
SET sent_by = NULL
WHERE sent_by IN (SELECT id FROM users_to_remove);

UPDATE daily_tasks
SET reviewed_by_user_id = NULL
WHERE reviewed_by_user_id IN (SELECT id FROM users_to_remove);

UPDATE projects_po
SET pic_user_id = NULL
WHERE pic_user_id IN (SELECT id FROM users_to_remove);

UPDATE projects_po
SET created_by_user_id = NULL
WHERE created_by_user_id IN (SELECT id FROM users_to_remove);

UPDATE projects_po
SET closed_by_user_id = NULL
WHERE closed_by_user_id IN (SELECT id FROM users_to_remove);

UPDATE po_change_logs
SET changed_by_user_id = NULL
WHERE changed_by_user_id IN (SELECT id FROM users_to_remove);

UPDATE po_internal_comments
SET user_id = NULL
WHERE user_id IN (SELECT id FROM users_to_remove);

DELETE FROM users
WHERE id IN (SELECT id FROM users_to_remove);

INSERT INTO departments (name, code)
VALUES ('Marketing Specialist', 'MKS')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

UPDATE users
SET
  name = 'Marketing Specialist',
  password = 'efaf8493e4c74b58d9452c2e6c594a4c9fb1873411ade62f0f196f33d5a76d6d',
  role = 'marketing_specialist',
  department_id = departments.id,
  is_active = true,
  updated_at = NOW()
FROM departments
WHERE
  lower(users.email) = 'mkt.specialist@adiyasa.com'
  AND departments.code = 'MKS';

COMMIT;
