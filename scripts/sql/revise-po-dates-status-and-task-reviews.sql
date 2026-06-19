BEGIN;

ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS target_pengiriman text,
  ADD COLUMN IF NOT EXISTS aktual_pengiriman text;

UPDATE projects_po
SET
  target_pengiriman = COALESCE(NULLIF(target_pengiriman, ''), NULLIF(deadline, '')),
  aktual_pengiriman = COALESCE(NULLIF(aktual_pengiriman, ''), NULLIF(target_penyelesaian::text, ''))
WHERE
  NULLIF(target_pengiriman, '') IS NULL
  AND NULLIF(aktual_pengiriman, '') IS NULL;

UPDATE projects_po
SET status = CASE
  WHEN lower(status) IN ('delivery', 'pengiriman') THEN 'delivered'
  WHEN lower(status) IN ('project_finished', 'selesai') THEN 'project_invoiced'
  WHEN lower(status) IN ('close', 'closed', 'project_sudah_dibayar') THEN 'closed'
  ELSE status
END;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

UPDATE users SET name = 'Admin Marketing 1 PTAA' WHERE lower(email) = 'marketing@adiyasa.com';
UPDATE users SET name = 'Admin Marketing 2 PTAA' WHERE lower(email) = 'admarketing@adiyasa.com';
UPDATE users SET name = 'Admin Marketing 1 PTAA' WHERE lower(name) IN ('marketing', 'marketing ptaa');
UPDATE users SET name = 'Admin Marketing 2 PTAA' WHERE lower(name) IN ('admin marketing', 'admin marketing ptaa');
UPDATE users SET role = 'karyawan' WHERE lower(role) = 'marketing';
UPDATE users SET role = 'admin_marketing' WHERE lower(role) IN ('admin marketing', 'admin_marketing_2');
UPDATE departments SET name = 'Marketing' WHERE upper(code) = 'MKT';
UPDATE users
SET
  name = 'Marketing Specialist',
  password = 'efaf8493e4c74b58d9452c2e6c594a4c9fb1873411ade62f0f196f33d5a76d6d',
  role = 'marketing_specialist',
  department_id = departments.id
FROM departments
WHERE lower(users.email) = 'mkt.specialist@adiyasa.com'
  AND departments.code = 'MKT';
UPDATE users
SET department_id = departments.id
FROM departments
WHERE
  (lower(users.role) = 'direktur' AND departments.code = 'DIR')
  OR (lower(users.role) = 'admin_marketing' AND departments.code = 'MKT')
  OR (lower(users.role) = 'marketing_specialist' AND departments.code = 'MKT')
  OR (lower(users.role) = 'monitoring_dummy' AND departments.code = 'ADM');

COMMIT;
