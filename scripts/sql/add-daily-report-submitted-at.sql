ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone;

UPDATE daily_reports
SET submitted_at = updated_at
WHERE submitted_at IS NULL
  AND status IN ('dikirim', 'direview', 'perlu_revisi');
