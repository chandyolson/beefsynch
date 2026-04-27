
-- WS10: Quantity override with audit trail on billing line tables
-- Adds override columns + CHECK constraints + creates finalize_billing_inventory RPC

-- 1. project_billing_semen: full override pattern
ALTER TABLE public.project_billing_semen
  ADD COLUMN override_quantity numeric,
  ADD COLUMN override_reason text,
  ADD COLUMN overridden_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN overridden_at timestamptz;

ALTER TABLE public.project_billing_semen
  ADD CONSTRAINT semen_override_requires_reason CHECK (
    override_quantity IS NULL
    OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
  );

-- 2. project_billing_products: units_billed IS the override; we only add audit columns + reason
ALTER TABLE public.project_billing_products
  ADD COLUMN override_reason text,
  ADD COLUMN overridden_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN overridden_at timestamptz;

-- Constraint: when units_billed differs from units_calculated AND units_calculated is set, require reason.
-- We treat "no override" as units_billed equals units_calculated OR units_calculated IS NULL (initial state).
ALTER TABLE public.project_billing_products
  ADD CONSTRAINT product_override_requires_reason CHECK (
    units_calculated IS NULL
    OR units_billed IS NULL
    OR units_billed = units_calculated
    OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
  );

-- 3. project_billing_labor: full pattern
ALTER TABLE public.project_billing_labor
  ADD COLUMN override_quantity numeric,
  ADD COLUMN override_reason text,
  ADD COLUMN overridden_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN overridden_at timestamptz;

ALTER TABLE public.project_billing_labor
  ADD CONSTRAINT labor_override_requires_reason CHECK (
    override_quantity IS NULL
    OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
  );

-- 4. project_billing_session_inventory: full pattern
ALTER TABLE public.project_billing_session_inventory
  ADD COLUMN override_quantity numeric,
  ADD COLUMN override_reason text,
  ADD COLUMN overridden_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN overridden_at timestamptz;

ALTER TABLE public.project_billing_session_inventory
  ADD CONSTRAINT session_inv_override_requires_reason CHECK (
    override_quantity IS NULL
    OR (override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
  );

-- 5. finalize_billing_inventory RPC
-- Consumes inventory based on each semen line's effective consumption:
--   COALESCE(override_quantity, units_packed - units_returned - units_blown)
-- Writes one inventory_transactions row per bull (transaction_type='consumed', units_change negative).
-- Idempotent: if billing.inventory_finalized_at is already set, returns without re-consuming.
-- Tolerates 0 semen lines (returns ok with units_consumed=0).

CREATE OR REPLACE FUNCTION public.finalize_billing_inventory(_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := (_input->>'organization_id')::uuid;
  v_billing_id uuid := (_input->>'billing_id')::uuid;
  v_project_id uuid;
  v_user_id uuid := auth.uid();
  v_already_finalized timestamptz;
  v_bulls_processed integer := 0;
  v_units_consumed integer := 0;
  v_line record;
  v_effective integer;
BEGIN
  IF v_org_id IS NULL OR v_billing_id IS NULL THEN
    RAISE EXCEPTION 'organization_id and billing_id required';
  END IF;

  -- Authorization: caller must be an accepted member of the org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_user_id AND organization_id = v_org_id AND accepted = true
  ) THEN
    RAISE EXCEPTION 'not a member of organization';
  END IF;

  -- Lookup billing record + idempotency check
  SELECT project_id, inventory_finalized_at
    INTO v_project_id, v_already_finalized
  FROM public.project_billing
  WHERE id = v_billing_id AND organization_id = v_org_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'billing record not found';
  END IF;

  IF v_already_finalized IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'bulls_processed', 0,
      'units_consumed', 0,
      'already_finalized', true
    );
  END IF;

  -- Iterate semen lines for this billing sheet
  FOR v_line IN
    SELECT
      id,
      bull_catalog_id,
      bull_name,
      bull_code,
      override_quantity,
      units_packed,
      units_returned,
      units_blown
    FROM public.project_billing_semen
    WHERE billing_id = v_billing_id
  LOOP
    -- Effective consumption: override wins, else packed - returned - blown
    IF v_line.override_quantity IS NOT NULL THEN
      v_effective := GREATEST(0, v_line.override_quantity::integer);
    ELSE
      v_effective := GREATEST(
        0,
        COALESCE(v_line.units_packed, 0)
          - COALESCE(v_line.units_returned, 0)
          - COALESCE(v_line.units_blown, 0)
      );
    END IF;

    IF v_effective > 0 THEN
      INSERT INTO public.inventory_transactions (
        organization_id,
        transaction_type,
        bull_catalog_id,
        custom_bull_name,
        bull_code,
        units_change,
        project_id,
        reason,
        notes,
        performed_by,
        tank_id
      )
      SELECT
        v_org_id,
        'consumed',
        v_line.bull_catalog_id,
        CASE WHEN v_line.bull_catalog_id IS NULL THEN v_line.bull_name ELSE NULL END,
        v_line.bull_code,
        -v_effective,
        v_project_id,
        'billing_finalized',
        CASE
          WHEN v_line.override_quantity IS NOT NULL
            THEN 'Finalized via billing sheet ' || v_billing_id::text || ' (override applied)'
          ELSE 'Finalized via billing sheet ' || v_billing_id::text
        END,
        v_user_id,
        -- tank_id is NOT NULL on inventory_transactions; use a sentinel from project context if available, else any org tank
        (SELECT id FROM public.tanks WHERE organization_id = v_org_id ORDER BY created_at LIMIT 1);

      v_bulls_processed := v_bulls_processed + 1;
      v_units_consumed := v_units_consumed + v_effective;
    END IF;
  END LOOP;

  -- Mark billing as finalized
  UPDATE public.project_billing
  SET inventory_finalized_at = now(),
      inventory_finalized_by = v_user_id,
      updated_at = now()
  WHERE id = v_billing_id;

  RETURN jsonb_build_object(
    'ok', true,
    'bulls_processed', v_bulls_processed,
    'units_consumed', v_units_consumed,
    'already_finalized', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_billing_inventory(jsonb) TO authenticated;
