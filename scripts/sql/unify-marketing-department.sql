BEGIN;

INSERT INTO departments (name, code)
VALUES ('Marketing', 'MKT')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

UPDATE users
SET department_id = marketing.id,
    updated_at = NOW()
FROM departments marketing
WHERE marketing.code = 'MKT'
  AND (
    lower(users.role) IN ('admin_marketing', 'marketing_specialist', 'marketing')
    OR lower(users.email) IN (
      'marketing@adiyasa.com',
      'admarketing@adiyasa.com',
      'mkt.specialist@adiyasa.com'
    )
    OR users.department_id IN (
      SELECT id FROM departments WHERE code = 'MKS'
    )
  );

UPDATE daily_reports
SET department_id = marketing.id
FROM departments marketing
WHERE marketing.code = 'MKT'
  AND daily_reports.department_id IN (
    SELECT id FROM departments WHERE code = 'MKS'
  );

UPDATE projects_po
SET department_id = marketing.id
FROM departments marketing
WHERE marketing.code = 'MKT'
  AND projects_po.department_id IN (
    SELECT id FROM departments WHERE code = 'MKS'
  );

DELETE FROM departments
WHERE code = 'MKS'
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE users.department_id = departments.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM daily_reports WHERE daily_reports.department_id = departments.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM projects_po WHERE projects_po.department_id = departments.id
  );

COMMIT;
