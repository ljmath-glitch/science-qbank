-- Review-gate migration (additive only).
-- A full backup is mandatory before running this migration, and explicit user approval is required.
-- TODO: Confirm the project's RLS conventions before applying this migration; no RLS policy is defined here.
-- NOTE: active defaults to false, so every EXISTING row becomes inactive once this runs.
--       Safe until composer/wizard start filtering on active (spec step 8); run the legacy-data
--       migration template below BEFORE enabling that filter.
-- TODO: Confirm the project's anon privilege conventions before applying this migration; no GRANT is defined here.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS stem_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ans_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sol_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS img_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS orig jsonb,
  ADD COLUMN IF NOT EXISTS qa jsonb;

CREATE TABLE IF NOT EXISTS import_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_file text,
  pipeline_version text,
  processed_at timestamptz,
  question_count integer,
  passed_count integer,
  failed_count integer
);

CREATE TABLE IF NOT EXISTS question_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  who text,
  logged_at timestamptz DEFAULT now(),
  question_id text,
  field text,
  old_value jsonb,
  new_value jsonb
);

-- Legacy-data migration template: disabled by default.
-- DECISION (2026-11-23, user): legacy questions that fail the quality gate are KEPT and MARKED, not deactivated.
-- So ALL legacy rows stay active=true; failures only get stem/ans/img status 'blocked' (or 'pending') and a qa jsonb
-- with the failing rules, so composer/wizard can show a warning badge instead of hiding them.
-- Requires explicit user approval and a prior full backup before being enabled.
-- Replace <passed_ids> / <failed_ids> with the id lists produced by tools/qa/scan_old_db.py.
-- UPDATE questions SET active = true;
-- UPDATE questions
-- SET stem_status = 'approved', ans_status = 'approved', img_status = 'approved'
-- WHERE id IN (<passed_ids>);
-- UPDATE questions
-- SET qa = '{"gate":"v0.1","result":"fail"}'::jsonb   -- per-question rule list to be filled from the scan JSON
-- WHERE id IN (<failed_ids>);

-- Reverse statements (restore the pre-migration schema; run only with explicit user approval and a backup):
-- DROP TABLE IF EXISTS question_log;
-- DROP TABLE IF EXISTS import_batches;
-- ALTER TABLE questions
--   DROP COLUMN IF EXISTS qa,
--   DROP COLUMN IF EXISTS orig,
--   DROP COLUMN IF EXISTS batch_id,
--   DROP COLUMN IF EXISTS active,
--   DROP COLUMN IF EXISTS img_status,
--   DROP COLUMN IF EXISTS sol_status,
--   DROP COLUMN IF EXISTS ans_status,
--   DROP COLUMN IF EXISTS stem_status;
