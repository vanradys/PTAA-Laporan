ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS pic_project text,
  ADD COLUMN IF NOT EXISTS has_painting boolean NOT NULL DEFAULT false;

ALTER TABLE po_internal_comments
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS user_department text;

INSERT INTO users (name, email, password, role, department_id, is_active)
SELECT
  'Admin Marketing PTAA',
  'admarketing@adiyasa.com',
  '774305953ab4c84ee9c7b6d87300693b027c4c0d2fa52cfe41259d4c382c2d76',
  'admin_marketing',
  departments.id,
  true
FROM departments
WHERE departments.code = 'MKT'
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  department_id = EXCLUDED.department_id,
  is_active = true;
