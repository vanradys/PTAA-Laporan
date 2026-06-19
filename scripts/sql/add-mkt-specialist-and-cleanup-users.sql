-- Jalankan di PostgreSQL/Railway SQL editor setelah patch code.
-- Tujuan:
-- 1) Menambahkan user Marketing Specialist dengan role khusus di departemen Marketing.
-- 2) Menonaktifkan akun lama/demo yang tidak boleh muncul di dashboard/monitoring/reminder.

INSERT INTO departments (name, code)
VALUES ('Marketing', 'MKT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (name, email, password, role, department_id, is_active, created_at, updated_at)
SELECT
  'Marketing Specialist',
  'mkt.specialist@adiyasa.com',
  'efaf8493e4c74b58d9452c2e6c594a4c9fb1873411ade62f0f196f33d5a76d6d',
  'marketing_specialist',
  departments.id,
  true,
  NOW(),
  NOW()
FROM departments
WHERE departments.code = 'MKT'
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  department_id = EXCLUDED.department_id,
  is_active = true,
  updated_at = NOW();

UPDATE users
SET is_active = false, updated_at = NOW()
WHERE email IN (
  'admin@ptaa.com',
  'ahmad@perusahaan.com',
  'budi@perusahaan.com',
  'eko@perusahaan.com',
  'engineering3@adiyasa.com'
);
