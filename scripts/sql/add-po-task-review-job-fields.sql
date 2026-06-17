ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS job_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_evaluation text,
  ADD COLUMN IF NOT EXISTS accounting_comment text NOT NULL DEFAULT 'Info dari pak Mulyadi BAST akan di ttd apabila sudah di trial';

UPDATE projects_po
SET accounting_comment = 'Info dari pak Mulyadi BAST akan di ttd apabila sudah di trial'
WHERE accounting_comment IS NULL OR trim(accounting_comment) = '';

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS job_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS completed_date date;
