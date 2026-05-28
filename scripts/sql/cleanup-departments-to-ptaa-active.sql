-- Jalankan hanya kalau ingin membersihkan master departments lama di database.
-- Departemen aktif PTAA:
-- DIR, GA, AAF, PUR, MKT, ENG
-- ADM adalah departemen internal tersembunyi untuk akun admin.
--
-- Script ini melepas referensi ke departemen lama sebelum menghapus row master-nya.

BEGIN;

INSERT INTO departments (name, code)
VALUES ('Admin', 'ADM')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

UPDATE users
SET department_id = NULL, updated_at = NOW()
WHERE department_id IN (
  SELECT id FROM departments
  WHERE code NOT IN ('ADM', 'DIR', 'GA', 'AAF', 'PUR', 'MKT', 'ENG')
);

UPDATE users
SET is_active = false, updated_at = NOW()
WHERE lower(email) = 'hr@adiyasa.com' OR lower(role) = 'hr';

UPDATE users
SET
  name = 'Admin PTAA',
  department_id = (SELECT id FROM departments WHERE code = 'ADM'),
  updated_at = NOW()
WHERE lower(email) = 'admin@adiyasa.com';

UPDATE daily_reports
SET department_id = NULL
WHERE department_id IN (
  SELECT id FROM departments
  WHERE code NOT IN ('ADM', 'DIR', 'GA', 'AAF', 'PUR', 'MKT', 'ENG')
);

UPDATE projects_po
SET department_id = NULL
WHERE department_id IN (
  SELECT id FROM departments
  WHERE code NOT IN ('ADM', 'DIR', 'GA', 'AAF', 'PUR', 'MKT', 'ENG')
);

DELETE FROM departments
WHERE code NOT IN ('ADM', 'DIR', 'GA', 'AAF', 'PUR', 'MKT', 'ENG');

COMMIT;
