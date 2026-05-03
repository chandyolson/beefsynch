
CREATE TABLE public.project_billing_session_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES public.project_billing(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.project_billing_sessions(id) ON DELETE CASCADE,
  bull_catalog_id uuid REFERENCES public.bulls_catalog(id),
  bull_name text NOT NULL,
  bull_code text,
  canister text NOT NULL DEFAULT '1',
  start_units integer,
  end_units integer,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_billing_session_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view session inventory for their org"
ON public.project_billing_session_inventory
FOR SELECT
USING (billing_id IN (
  SELECT pb.id FROM project_billing pb
  WHERE pb.organization_id IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid()
  )
));

CREATE POLICY "Users can manage session inventory for their org"
ON public.project_billing_session_inventory
FOR ALL
USING (billing_id IN (
  SELECT pb.id FROM project_billing pb
  WHERE pb.organization_id IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  )
));

CREATE INDEX idx_billing_session_inventory_billing ON public.project_billing_session_inventory(billing_id);
CREATE INDEX idx_billing_session_inventory_session ON public.project_billing_session_inventory(session_id);
