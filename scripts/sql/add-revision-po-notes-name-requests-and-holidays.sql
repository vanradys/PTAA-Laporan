BEGIN;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS revision_source_task_id integer,
  ADD COLUMN IF NOT EXISTS revision_work_task_id integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE daily_tasks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE daily_tasks
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

UPDATE daily_tasks
SET
  status = CASE lower(status)
    WHEN 'pending' THEN 'belum_mulai'
    WHEN 'proses' THEN 'input_data_proses'
    WHEN 'selesai' THEN 'delivered'
    ELSE status
  END,
  progress = CASE lower(status)
    WHEN 'pending' THEN 0
    WHEN 'belum_mulai' THEN 0
    WHEN 'menerima_permintaan' THEN 25
    WHEN 'inquiry' THEN 25
    WHEN 'proses' THEN 50
    WHEN 'input_data_proses' THEN 50
    WHEN 'review_approval' THEN 75
    WHEN 'selesai' THEN 100
    WHEN 'delivered' THEN 100
    ELSE progress
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_tasks_revision_source_task_id_fkey'
  ) THEN
    ALTER TABLE daily_tasks
      ADD CONSTRAINT daily_tasks_revision_source_task_id_fkey
      FOREIGN KEY (revision_source_task_id) REFERENCES daily_tasks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_tasks_revision_work_task_id_fkey'
  ) THEN
    ALTER TABLE daily_tasks
      ADD CONSTRAINT daily_tasks_revision_work_task_id_fkey
      FOREIGN KEY (revision_work_task_id) REFERENCES daily_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS daily_tasks_revision_source_unique
  ON daily_tasks (revision_source_task_id)
  WHERE revision_source_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS po_notes (
  id serial PRIMARY KEY,
  po_id integer NOT NULL REFERENCES projects_po(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO po_notes (po_id, user_id, user_name, note, created_at, updated_at)
SELECT
  po.id,
  po.created_by_user_id,
  COALESCE(u.name, 'Data Lama'),
  trim(po.catatan),
  po.created_at,
  po.created_at
FROM projects_po po
LEFT JOIN users u ON u.id = po.created_by_user_id
WHERE NULLIF(trim(po.catatan), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM po_notes n WHERE n.po_id = po.id
  );

CREATE TABLE IF NOT EXISTS name_change_requests (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_name text NOT NULL,
  requested_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS name_change_requests_one_pending_per_user
  ON name_change_requests (user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS company_holidays (
  date date PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_holidays (date, name) VALUES
  ('2026-01-01', 'Tahun Baru 2026 Masehi'),
  ('2026-01-16', 'Isra Mikraj Nabi Muhammad S.A.W.'),
  ('2026-02-16', 'Cuti Bersama Tahun Baru Imlek'),
  ('2026-02-17', 'Tahun Baru Imlek'),
  ('2026-03-18', 'Cuti Bersama Hari Suci Nyepi'),
  ('2026-03-19', 'Hari Suci Nyepi'),
  ('2026-03-20', 'Cuti Bersama Idul Fitri'),
  ('2026-03-21', 'Idul Fitri'),
  ('2026-03-22', 'Idul Fitri'),
  ('2026-03-23', 'Cuti Bersama Idul Fitri'),
  ('2026-03-24', 'Cuti Bersama Idul Fitri'),
  ('2026-04-03', 'Wafat Yesus Kristus'),
  ('2026-04-05', 'Kebangkitan Yesus Kristus'),
  ('2026-05-01', 'Hari Buruh Internasional'),
  ('2026-05-14', 'Kenaikan Yesus Kristus'),
  ('2026-05-15', 'Cuti Bersama Kenaikan Yesus Kristus'),
  ('2026-05-27', 'Idul Adha'),
  ('2026-05-28', 'Cuti Bersama Idul Adha'),
  ('2026-05-31', 'Hari Raya Waisak'),
  ('2026-06-01', 'Hari Lahir Pancasila'),
  ('2026-06-16', '1 Muharam Tahun Baru Islam'),
  ('2026-08-17', 'Proklamasi Kemerdekaan'),
  ('2026-08-25', 'Maulid Nabi Muhammad S.A.W.'),
  ('2026-12-24', 'Cuti Bersama Kelahiran Yesus Kristus'),
  ('2026-12-25', 'Kelahiran Yesus Kristus')
ON CONFLICT (date) DO UPDATE SET name = excluded.name;

COMMIT;
