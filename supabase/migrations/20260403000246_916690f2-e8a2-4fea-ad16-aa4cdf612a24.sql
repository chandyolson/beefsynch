
-- Semen Orders table
CREATE TABLE public.semen_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  customer_name text NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  fulfillment_status text NOT NULL DEFAULT 'pending',
  billing_status text NOT NULL DEFAULT 'unbilled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.semen_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view semen_orders"
  ON public.semen_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_org_ids(auth.uid())));

CREATE POLICY "Org members can insert semen_orders"
  ON public.semen_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_org_ids(auth.uid())));

CREATE POLICY "Org members can update semen_orders"
  ON public.semen_orders FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_org_ids(auth.uid())));

CREATE POLICY "Org admins can delete semen_orders"
  ON public.semen_orders FOR DELETE TO authenticated
  USING (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner','admin']));

-- Semen Order Items table
CREATE TABLE public.semen_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semen_order_id uuid REFERENCES public.semen_orders(id) ON DELETE CASCADE NOT NULL,
  bull_catalog_id uuid REFERENCES public.bulls_catalog(id),
  custom_bull_name text,
  units integer NOT NULL DEFAULT 0
);

ALTER TABLE public.semen_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view semen_order_items"
  ON public.semen_order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.semen_orders so
    WHERE so.id = semen_order_items.semen_order_id
    AND so.organization_id IN (SELECT user_org_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert semen_order_items"
  ON public.semen_order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.semen_orders so
    WHERE so.id = semen_order_items.semen_order_id
    AND so.organization_id IN (SELECT user_org_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update semen_order_items"
  ON public.semen_order_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.semen_orders so
    WHERE so.id = semen_order_items.semen_order_id
    AND so.organization_id IN (SELECT user_org_ids(auth.uid()))
  ));

CREATE POLICY "Org members can delete semen_order_items"
  ON public.semen_order_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.semen_orders so
    WHERE so.id = semen_order_items.semen_order_id
    AND so.organization_id IN (SELECT user_org_ids(auth.uid()))
  ));
