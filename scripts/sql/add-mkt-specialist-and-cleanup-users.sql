-- Jalankan di PostgreSQL/Railway SQL editor setelah patch code.
-- Tujuan:
-- 1) Menambahkan user MKT Specialist sebagai karyawan wajib submit laporan.
-- 2) Menonaktifkan akun lama/demo yang tidak boleh muncul di dashboard/monitoring/reminder.

INSERT INTO departments (name, code)
VALUES ('Marketing', 'MKT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (name, email, password, role, department_id, is_active, created_at, updated_at)
SELECT
  'MKT Specialist',
  'mkt.specialist@adiyasa.com',
  'b3fb6c41e800b83decc6e243bb3f8ed11e08a6d84201ed7f722cf2523677417b',
  'karyawan',
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
