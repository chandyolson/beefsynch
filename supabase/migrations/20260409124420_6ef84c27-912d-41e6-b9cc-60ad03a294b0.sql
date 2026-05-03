
CREATE TABLE IF NOT EXISTS public.tank_pack_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_pack_id uuid NOT NULL REFERENCES public.tank_packs(id) ON DELETE CASCADE,
  semen_order_id uuid NOT NULL REFERENCES public.semen_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tank_pack_id, semen_order_id)
);

CREATE INDEX IF NOT EXISTS idx_tank_pack_orders_pack_id ON public.tank_pack_orders(tank_pack_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_orders_order_id ON public.tank_pack_orders(semen_order_id);

ALTER TABLE public.tank_pack_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read tank_pack_orders"
  ON public.tank_pack_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tank_packs tp
      JOIN public.organization_members om ON om.organization_id = tp.organization_id
      WHERE tp.id = tank_pack_orders.tank_pack_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members can insert tank_pack_orders"
  ON public.tank_pack_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tank_packs tp
      JOIN public.organization_members om ON om.organization_id = tp.organization_id
      WHERE tp.id = tank_pack_orders.tank_pack_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members can delete tank_pack_orders"
  ON public.tank_pack_orders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tank_packs tp
      JOIN public.organization_members om ON om.organization_id = tp.organization_id
      WHERE tp.id = tank_pack_orders.tank_pack_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );
