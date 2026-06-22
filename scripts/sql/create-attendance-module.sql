CREATE TABLE IF NOT EXISTS attendance_mappings (
  id SERIAL PRIMARY KEY,
  machine_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  user_id INTEGER UNIQUE REFERENCES users(id),
  employee_type TEXT NOT NULL DEFAULT 'Produksi',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_import_batches (
  id SERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'preview',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  mapped_names INTEGER NOT NULL DEFAULT 0,
  unmapped_names INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_import_rows (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES attendance_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  machine_name TEXT,
  scan_date DATE,
  scan_time TEXT,
  department TEXT,
  position TEXT,
  office TEXT,
  verification TEXT,
  io_type TEXT,
  workcode TEXT,
  serial_number TEXT,
  machine TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT FALSE,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS attendance_scans (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES attendance_import_batches(id) ON DELETE CASCADE,
  import_row_id INTEGER NOT NULL REFERENCES attendance_import_rows(id) ON DELETE CASCADE,
  mapping_id INTEGER NOT NULL REFERENCES attendance_mappings(id),
  user_id INTEGER REFERENCES users(id),
  machine_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  employee_type TEXT NOT NULL,
  department TEXT,
  scan_date DATE NOT NULL,
  scan_time TEXT NOT NULL,
  work_date DATE NOT NULL,
  io_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_daily (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES attendance_import_batches(id) ON DELETE CASCADE,
  mapping_id INTEGER NOT NULL REFERENCES attendance_mappings(id),
  user_id INTEGER REFERENCES users(id),
  machine_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  employee_type TEXT NOT NULL,
  department TEXT,
  work_date DATE NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  total_scans INTEGER NOT NULL DEFAULT 0,
  is_holiday BOOLEAN NOT NULL DEFAULT FALSE,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  overtime_production NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_office NUMERIC(10,2) NOT NULL DEFAULT 0,
  entry_status TEXT NOT NULL,
  exit_status TEXT NOT NULL,
  daily_status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  holiday_type TEXT NOT NULL DEFAULT 'Lainnya',
  source TEXT NOT NULL DEFAULT 'Manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  safe_max INTEGER NOT NULL DEFAULT 2,
  warning_max INTEGER NOT NULL DEFAULT 4,
  auto_indonesia_holiday BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_notification_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS attendance_rows_batch_idx ON attendance_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS attendance_scans_work_date_idx ON attendance_scans(work_date);
CREATE INDEX IF NOT EXISTS attendance_daily_work_date_idx ON attendance_daily(work_date);
CREATE INDEX IF NOT EXISTS attendance_daily_user_idx ON attendance_daily(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_scans_import_row_unique ON attendance_scans(import_row_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_daily_batch_mapping_date_unique
  ON attendance_daily(batch_id, mapping_id, work_date);

INSERT INTO attendance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE attendance_notification_logs
  ADD COLUMN IF NOT EXISTS notification_id INTEGER REFERENCES notifications(id) ON DELETE SET NULL;
