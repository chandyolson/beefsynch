ALTER TABLE public.semen_companies
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_own_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;