BEGIN;

CREATE TABLE IF NOT EXISTS projects_po_progress_migration_backup (
  id integer PRIMARY KEY,
  no_po text NOT NULL,
  old_status text NOT NULL,
  old_progress integer NOT NULL,
  old_tracking_stages jsonb,
  old_has_painting boolean,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO projects_po_progress_migration_backup (
  id,
  no_po,
  old_status,
  old_progress,
  old_tracking_stages,
  old_has_painting
)
SELECT
  id,
  no_po,
  status,
  progress,
  tracking_stages,
  has_painting
FROM projects_po
ON CONFLICT (id) DO NOTHING;

WITH source AS (
  SELECT
    id,
    lower(coalesce(status, '')) AS old_status,
    coalesce(progress, 0) AS old_progress,
    coalesce(has_painting, false) AS uses_painting,
    CASE
      WHEN jsonb_typeof(tracking_stages) = 'array' THEN tracking_stages
      ELSE '[]'::jsonb
    END AS old_tracking_stages
  FROM projects_po
),
inferred AS (
  SELECT
    id,
    uses_painting,
    CASE
      WHEN old_status IN ('selesai', 'close', 'project_finished') OR old_progress >= 100 THEN 'project_finished'
      WHEN old_progress >= 90 THEN 'delivery'
      WHEN old_progress >= 80 THEN
        CASE
          WHEN uses_painting AND (old_tracking_stages ? 'painting') THEN 'painting'
          ELSE 'finishing_trial'
        END
      WHEN old_progress >= 60 THEN
        CASE
          WHEN old_tracking_stages ? 'qc' OR old_tracking_stages ? 'quality_control' THEN 'quality_control'
          ELSE 'production'
        END
      WHEN old_progress >= 40 THEN 'material_order'
      WHEN old_progress >= 20 THEN
        CASE
          WHEN old_tracking_stages ? 'approval_drawing' THEN 'approval_drawing'
          ELSE 'engineering'
        END
      WHEN old_tracking_stages ? 'delivery' OR old_tracking_stages ? 'pengiriman' THEN 'delivery'
      WHEN uses_painting AND (old_tracking_stages ? 'painting') THEN 'painting'
      WHEN old_tracking_stages ? 'finishing_trial' THEN 'finishing_trial'
      WHEN old_tracking_stages ? 'quality_control' OR old_tracking_stages ? 'qc' THEN 'quality_control'
      WHEN old_tracking_stages ? 'production' OR old_tracking_stages ? 'produksi' THEN 'production'
      WHEN old_tracking_stages ? 'material_order' OR old_tracking_stages ? 'procurement' THEN 'material_order'
      WHEN old_tracking_stages ? 'approval_drawing' THEN 'approval_drawing'
      WHEN old_tracking_stages ? 'engineering' THEN 'engineering'
      WHEN old_status = 'procurement' THEN 'material_order'
      WHEN old_status = 'produksi' THEN 'production'
      WHEN old_status = 'qc' THEN 'quality_control'
      WHEN old_status = 'pengiriman' THEN 'delivery'
      ELSE 'po_received'
    END AS new_status
  FROM source
),
normalized AS (
  SELECT
    id,
    new_status,
    CASE new_status
      WHEN 'project_finished' THEN 100
      WHEN 'delivery' THEN 90
      WHEN 'painting' THEN 80
      WHEN 'finishing_trial' THEN 80
      WHEN 'quality_control' THEN 60
      WHEN 'production' THEN 60
      WHEN 'material_order' THEN 40
      WHEN 'approval_drawing' THEN 20
      WHEN 'engineering' THEN 20
      ELSE 0
    END AS new_progress,
    CASE new_status
      WHEN 'project_finished' THEN
        CASE
          WHEN uses_painting THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial', 'painting', 'delivery', 'project_finished')
          ELSE jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial', 'delivery', 'project_finished')
        END
      WHEN 'delivery' THEN
        CASE
          WHEN uses_painting THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial', 'painting', 'delivery')
          ELSE jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial', 'delivery')
        END
      WHEN 'painting' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial', 'painting')
      WHEN 'finishing_trial' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control', 'finishing_trial')
      WHEN 'quality_control' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production', 'quality_control')
      WHEN 'production' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order', 'production')
      WHEN 'material_order' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing', 'material_order')
      WHEN 'approval_drawing' THEN jsonb_build_array('po_received', 'engineering', 'approval_drawing')
      WHEN 'engineering' THEN jsonb_build_array('po_received', 'engineering')
      ELSE jsonb_build_array('po_received')
    END AS new_tracking_stages
  FROM inferred
)
UPDATE projects_po AS po
SET
  status = normalized.new_status,
  progress = normalized.new_progress,
  tracking_stages = normalized.new_tracking_stages,
  updated_at = now()
FROM normalized
WHERE po.id = normalized.id;

COMMIT;
