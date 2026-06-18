BEGIN;

ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS target_pengiriman text,
  ADD COLUMN IF NOT EXISTS aktual_pengiriman text;

UPDATE projects_po
SET
  target_pengiriman = COALESCE(NULLIF(target_pengiriman, ''), NULLIF(deadline, '')),
  aktual_pengiriman = COALESCE(NULLIF(aktual_pengiriman, ''), NULLIF(target_penyelesaian::text, ''))
WHERE target_pengiriman IS NULL OR aktual_pengiriman IS NULL;

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

UPDATE departments SET name = 'Admin Marketing 1' WHERE code = 'MKT';
UPDATE users SET name = 'Admin Marketing 1 PTAA' WHERE lower(email) = 'marketing@adiyasa.com';
UPDATE users SET name = 'Admin Marketing 2 PTAA' WHERE lower(email) = 'admarketing@adiyasa.com';

COMMIT;
