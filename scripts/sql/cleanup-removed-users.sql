-- Jalankan sekali untuk menyembunyikan akun demo/lama dari Dashboard, Monitoring, dan Reminder.
-- Data tidak dihapus permanen; hanya dinonaktifkan agar histori lama tetap aman.

UPDATE users
SET is_active = false, updated_at = NOW()
WHERE email IN (
  'admin@ptaa.com',
  'ahmad@perusahaan.com',
  'budi@perusahaan.com',
  'eko@perusahaan.com',
  'engineering3@adiyasa.com'
);
