ALTER TABLE projects_po
  ADD COLUMN IF NOT EXISTS qty text;

ALTER TABLE projects_po
  ALTER COLUMN deadline TYPE text USING deadline::text;
