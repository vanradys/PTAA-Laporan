ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS completion_input_type text,
  ADD COLUMN IF NOT EXISTS completion_value text;

CREATE TABLE IF NOT EXISTS todo_checklist_history (
  id serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES todo_tasks(id) ON DELETE CASCADE,
  checklist_id integer REFERENCES todo_task_checklist(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_text text,
  next_text text,
  previous_completed integer,
  next_completed integer,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todo_checklist_history_task_id_idx
  ON todo_checklist_history(task_id);

CREATE TABLE IF NOT EXISTS website_tutorials (
  id serial PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  screenshot_data text,
  screenshot_mime_type text,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_manual_corrections (
  id serial PRIMARY KEY,
  mapping_id integer NOT NULL REFERENCES attendance_mappings(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  daily_status text NOT NULL,
  notes text,
  overtime_production numeric(10, 2),
  overtime_office numeric(10, 2),
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_manual_corrections_mapping_date_unique UNIQUE (mapping_id, work_date)
);

INSERT INTO website_tutorials (title, content, sort_order)
SELECT title, content, sort_order
FROM (VALUES
  ('Cara membuat laporan harian', '1. Buka menu Laporan Harian.\n2. Isi daftar tugas hari ini.\n3. Lengkapi persoalan yang dihadapi dan rencana besok.\n4. Simpan draf atau kirim laporan saat sudah selesai.', 10),
  ('Cara mengisi tugas', '1. Tekan Tambah Tugas.\n2. Isi nama tugas, project, tanggal tugas diberikan, tanggal tugas diselesaikan, status, dan job yang dikerjakan.\n3. Simpan perubahan sebelum mengirim laporan.', 20),
  ('Cara update progress', '1. Buka tugas pada Laporan Harian.\n2. Ubah status tugas.\n3. Progress akan mengikuti status yang dipilih secara otomatis.', 30),
  ('Cara menggunakan To Do List', '1. Buka menu To Do List.\n2. Buat tugas pribadi atau tugas tim.\n3. Tambahkan checklist, tag karyawan, komentar, dan ubah status sesuai kebutuhan.', 40),
  ('Cara membaca notifikasi', '1. Buka menu Notifikasi atau ikon lonceng.\n2. Baca daftar pemberitahuan terbaru.\n3. Buka detail jika notifikasi berhubungan dengan laporan, tugas, atau project.', 50),
  ('Cara monitoring PO', '1. Buka Jadwal Project.\n2. Gunakan filter periode, customer, progress, atau status.\n3. Buka detail PO untuk melihat informasi project.', 60),
  ('Cara absensi', '1. Buka menu Absensi.\n2. Admin/Finance dapat upload Excel Fingerspot dan mengelola tanggal libur.\n3. Karyawan dapat melihat status absensi masing-masing.', 70),
  ('Cara penggunaan fitur sesuai role', 'Admin dapat mengelola data dan panduan. Finance/Admin dapat mengelola absensi. Monitoring dapat melihat rekap. Karyawan mengisi laporan, To Do List, dan melihat notifikasi.', 80)
) AS seed(title, content, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM website_tutorials);
