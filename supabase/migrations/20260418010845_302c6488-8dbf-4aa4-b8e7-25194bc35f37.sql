ALTER TABLE public.project_billing
  ADD COLUMN IF NOT EXISTS inventory_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_finalized_by uuid,
  ADD COLUMN IF NOT EXISTS billing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_completed_by uuid;