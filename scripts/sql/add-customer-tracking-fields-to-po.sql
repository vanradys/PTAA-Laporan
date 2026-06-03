ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS tracking_stages JSONB,
  ADD COLUMN IF NOT EXISTS tracking_timeline JSONB;

UPDATE projects_po
SET
  tracking_stages = COALESCE(tracking_stages, '[]'::jsonb),
  tracking_timeline = COALESCE(tracking_timeline, '[]'::jsonb)
WHERE tracking_stages IS NULL
   OR tracking_timeline IS NULL;
