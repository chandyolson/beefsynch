
-- 1. semen_orders: add customer_id, drop free-text customer columns
ALTER TABLE public.semen_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

ALTER TABLE public.semen_orders
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS customer_phone;

-- 2. shipments: drop received_from, change received_by to uuid
ALTER TABLE public.shipments
  DROP COLUMN IF EXISTS received_from;

-- Change received_by from text to uuid (drop and re-add)
ALTER TABLE public.shipments
  DROP COLUMN IF EXISTS received_by;

ALTER TABLE public.shipments
  ADD COLUMN received_by uuid REFERENCES public.organization_members(id);

-- 3. inventory_transactions: add tank_pack_id
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS tank_pack_id uuid REFERENCES public.tank_packs(id);
