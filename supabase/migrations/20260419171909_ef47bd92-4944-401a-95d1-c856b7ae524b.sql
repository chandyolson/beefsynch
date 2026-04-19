
-- Add session_id to project_billing_products to allow grouping products under sessions
ALTER TABLE public.project_billing_products
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.project_billing_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_billing_products_session_id
  ON public.project_billing_products(session_id);

-- Add session_type to project_billing_sessions for differentiating field/pickup/customer-administered
ALTER TABLE public.project_billing_sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'field_session';

-- Migrate any existing project_billing rows with legacy statuses to in_process,
-- then change the default and enforce the new status set via CHECK constraint.
UPDATE public.project_billing
SET status = CASE
  WHEN status IN ('draft', 'review') THEN 'in_process'
  WHEN status IN ('invoiced', 'paid') THEN 'invoiced_closed'
  ELSE status
END
WHERE status NOT IN ('in_process', 'work_complete', 'invoiced_closed');

ALTER TABLE public.project_billing
  ALTER COLUMN status SET DEFAULT 'in_process';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_billing_status_check'
  ) THEN
    ALTER TABLE public.project_billing DROP CONSTRAINT project_billing_status_check;
  END IF;
END $$;

ALTER TABLE public.project_billing
  ADD CONSTRAINT project_billing_status_check
  CHECK (status IN ('in_process', 'work_complete', 'invoiced_closed'));
