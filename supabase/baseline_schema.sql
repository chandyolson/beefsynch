-- =============================================================================
-- BASELINE MIGRATION: Complete DDL for all BeefSynch public-schema tables
-- =============================================================================
-- This migration captures the full schema as it exists in production.
-- It uses CREATE TABLE IF NOT EXISTS so it is safe to run on the live DB
-- (existing tables will be skipped) and also works as a fresh-install script.
-- =============================================================================

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_billing_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_shipments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id AND accepted = true;
$$;

CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _organization_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT role FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _organization_id AND accepted = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_org_members(_organization_id uuid)
RETURNS TABLE(id uuid, user_id uuid, invited_email text, role text, accepted boolean, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT om.id, om.user_id, om.invited_email, om.role, om.accepted,
    CASE WHEN om.user_id IS NOT NULL THEN (SELECT au.email FROM auth.users au WHERE au.id = om.user_id)
         ELSE om.invited_email END AS email
  FROM public.organization_members om
  WHERE om.organization_id = _organization_id
    AND om.organization_id IN (SELECT public.user_org_ids(auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.lookup_invite_by_token(_token uuid)
RETURNS TABLE(token uuid, organization_id uuid, invited_email text, accepted boolean, expires_at timestamptz, org_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pi.token, pi.organization_id, pi.invited_email, pi.accepted, pi.expires_at, o.name as org_name
  FROM public.pending_invites pi
  JOIN public.organizations o ON o.id = pi.organization_id
  WHERE pi.token = _token AND pi.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.lookup_org_by_invite_code(_code text)
RETURNS TABLE(id uuid, name text, invite_code text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT o.id, o.name, o.invite_code FROM organizations o WHERE o.invite_code = _code;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_org_invite(_token uuid, _user_id uuid, _user_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_invite record;
BEGIN
  SELECT pi.token, pi.organization_id, pi.invited_email, pi.accepted, o.name as org_name
  INTO v_invite FROM pending_invites pi JOIN organizations o ON o.id = pi.organization_id
  WHERE pi.token = _token AND pi.expires_at > now() LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_token'); END IF;
  IF v_invite.invited_email IS NOT NULL AND lower(v_invite.invited_email) != lower(_user_email) THEN
    RETURN jsonb_build_object('error', 'email_mismatch', 'invited_email', v_invite.invited_email);
  END IF;
  UPDATE pending_invites SET accepted = true WHERE token = _token;
  DELETE FROM organization_members WHERE organization_id = v_invite.organization_id AND accepted = false
    AND (lower(invited_email) = lower(_user_email) OR user_id = _user_id);
  INSERT INTO organization_members (user_id, organization_id, role, accepted, invited_email)
  SELECT _user_id, v_invite.organization_id, 'member', true, lower(_user_email)
  WHERE NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = _user_id AND organization_id = v_invite.organization_id AND accepted = true);
  INSERT INTO profiles (user_id, has_completed_onboarding) VALUES (_user_id, true)
  ON CONFLICT (user_id) DO UPDATE SET has_completed_onboarding = true;
  RETURN jsonb_build_object('success', true, 'org_name', v_invite.org_name, 'organization_id', v_invite.organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_anonymous_projects()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM public.projects WHERE user_id IN (
    SELECT id FROM auth.users WHERE is_anonymous = true AND created_at < now() - interval '48 hours'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.export_auth_users()
RETURNS SETOF json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT row_to_json(u.*) FROM auth.users u;
$$;

CREATE OR REPLACE FUNCTION public.export_auth_identities()
RETURNS SETOF json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT row_to_json(i.*) FROM auth.identities i;
$$;

REVOKE EXECUTE ON FUNCTION public.export_auth_users() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_auth_identities() FROM anon, authenticated;


-- ─── 1. ORGANIZATIONS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  invite_code text DEFAULT substr(md5((random())::text), 1, 8),
  google_calendar_id text,
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_invite_code_key ON public.organizations (invite_code);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Authenticated users can create organizations') THEN
    CREATE POLICY "Authenticated users can create organizations" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Members see own organizations') THEN
    CREATE POLICY "Members see own organizations" ON public.organizations FOR SELECT TO authenticated
      USING (id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Owners can update their organization') THEN
    CREATE POLICY "Owners can update their organization" ON public.organizations FOR UPDATE TO authenticated
      USING (get_org_role(auth.uid(), id) = 'owner') WITH CHECK (get_org_role(auth.uid(), id) = 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='Owners can delete their organization') THEN
    CREATE POLICY "Owners can delete their organization" ON public.organizations FOR DELETE TO authenticated
      USING (get_org_role(auth.uid(), id) = 'owner');
  END IF;
END $$;


-- ─── 2. ORGANIZATION_MEMBERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  accepted boolean DEFAULT false,
  invited_email text,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamp without time zone DEFAULT now()
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_organization_id_user_id_key ON public.organization_members (organization_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique_invited_email ON public.organization_members (organization_id, invited_email) WHERE invited_email IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='Members see their org members') THEN
    CREATE POLICY "Members see their org members" ON public.organization_members FOR SELECT TO authenticated
      USING (organization_id IN (SELECT user_org_ids(auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='Users can insert own membership') THEN
    CREATE POLICY "Users can insert own membership" ON public.organization_members FOR INSERT
      WITH CHECK ((auth.uid() = user_id) AND ((EXISTS (SELECT 1 FROM organizations WHERE id = organization_members.organization_id AND created_by = auth.uid())) OR (EXISTS (SELECT 1 FROM pending_invites WHERE organization_id = organization_members.organization_id AND invited_email = (auth.jwt() ->> 'email') AND accepted = false))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='Owners and admins can update members') THEN
    CREATE POLICY "Owners and admins can update members" ON public.organization_members FOR UPDATE TO authenticated
      USING (get_org_role(auth.uid(), organization_id) = ANY(ARRAY['owner','admin']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='Users can accept their own invite') THEN
    CREATE POLICY "Users can accept their own invite" ON public.organization_members FOR UPDATE TO authenticated
      USING (invited_email = (auth.jwt() ->> 'email') AND accepted = false)
      WITH CHECK (invited_email = (auth.jwt() ->> 'email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='Owners and admins can delete members') THEN
    CREATE POLICY "Owners and admins can delete members" ON public.organization_members FOR DELETE TO authenticated
      USING (get_org_role(auth.uid(), organization_id) = ANY(ARRAY['owner','admin']));
  END IF;
END $$;


-- ─── 3. PENDING_INVITES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_email text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  accepted boolean DEFAULT false,
  expires_at timestamp without time zone DEFAULT (now() + interval '7 days'),
  created_at timestamp without time zone DEFAULT now()
);
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS pending_invites_token_key ON public.pending_invites (token);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pending_invites' AND policyname='Org admins can insert invites') THEN
    CREATE POLICY "Org admins can insert invites" ON public.pending_invites FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']) AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pending_invites' AND policyname='Org admins see own org invites') THEN
    CREATE POLICY "Org admins see own org invites" ON public.pending_invites FOR SELECT TO authenticated
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']) AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pending_invites' AND policyname='Org admins can update invites') THEN
    CREATE POLICY "Org admins can update invites" ON public.pending_invites FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']) AND om.accepted = true));
  END IF;
END $$;


-- ─── 4. CUSTOMERS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_org_name ON public.customers (organization_id, name);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Org members can view customers') THEN
    CREATE POLICY "Org members can view customers" ON public.customers FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Org admins can insert customers') THEN
    CREATE POLICY "Org admins can insert customers" ON public.customers FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Org admins can update customers') THEN
    CREATE POLICY "Org admins can update customers" ON public.customers FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='Org admins can delete customers') THEN
    CREATE POLICY "Org admins can delete customers" ON public.customers FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
END $$;


-- ─── 5. SEMEN_COMPANIES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semen_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.semen_companies ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS semen_companies_organization_id_name_key ON public.semen_companies (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_semen_companies_org ON public.semen_companies (organization_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='semen_companies' AND policyname='Org members can view semen companies') THEN
    CREATE POLICY "Org members can view semen companies" ON public.semen_companies FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='semen_companies' AND policyname='Org members can insert semen companies') THEN
    CREATE POLICY "Org members can insert semen companies" ON public.semen_companies FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='semen_companies' AND policyname='Org members can update semen companies') THEN
    CREATE POLICY "Org members can update semen companies" ON public.semen_companies FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='semen_companies' AND policyname='Org members can delete semen companies') THEN
    CREATE POLICY "Org members can delete semen companies" ON public.semen_companies FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
END $$;


-- ─── 6. TANKS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tanks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tank_number text NOT NULL,
  tank_name text,
  tank_type text NOT NULL DEFAULT 'storage',
  status text NOT NULL DEFAULT 'wet',
  model text,
  serial_number text,
  eid text,
  description text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tanks_org ON public.tanks (organization_id);
CREATE INDEX IF NOT EXISTS idx_tanks_number ON public.tanks (tank_number);
CREATE INDEX IF NOT EXISTS idx_tanks_status ON public.tanks (status);
CREATE INDEX IF NOT EXISTS idx_tanks_type ON public.tanks (tank_type);
CREATE INDEX IF NOT EXISTS idx_tanks_customer ON public.tanks (customer_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tanks' AND policyname='Org members can view tanks') THEN
    CREATE POLICY "Org members can view tanks" ON public.tanks FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tanks' AND policyname='Org members can insert tanks') THEN
    CREATE POLICY "Org members can insert tanks" ON public.tanks FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tanks' AND policyname='Org members can update tanks') THEN
    CREATE POLICY "Org members can update tanks" ON public.tanks FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tanks' AND policyname='Org members can delete tanks') THEN
    CREATE POLICY "Org members can delete tanks" ON public.tanks FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 7. TANK_INVENTORY ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  bull_catalog_id uuid REFERENCES bulls_catalog(id) ON DELETE SET NULL,
  bull_code text,
  custom_bull_name text,
  canister text NOT NULL,
  sub_canister text,
  units integer NOT NULL DEFAULT 0,
  item_type text NOT NULL DEFAULT 'semen',
  owner text,
  storage_type text DEFAULT 'customer',
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  notes text,
  inventoried_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inventoried_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_inventory ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_inventory_org ON public.tank_inventory (organization_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_tank ON public.tank_inventory (tank_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_bull ON public.tank_inventory (bull_catalog_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_customer ON public.tank_inventory (customer_id);
CREATE INDEX IF NOT EXISTS idx_tank_inventory_storage ON public.tank_inventory (storage_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_inventory' AND policyname='Org members can view tank inventory') THEN
    CREATE POLICY "Org members can view tank inventory" ON public.tank_inventory FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_inventory' AND policyname='Org members can insert tank inventory') THEN
    CREATE POLICY "Org members can insert tank inventory" ON public.tank_inventory FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_inventory' AND policyname='Org members can update tank inventory') THEN
    CREATE POLICY "Org members can update tank inventory" ON public.tank_inventory FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_inventory' AND policyname='Org members can delete tank inventory') THEN
    CREATE POLICY "Org members can delete tank inventory" ON public.tank_inventory FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 8. TANK_FILLS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_fills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  fill_date date NOT NULL,
  fill_type text,
  filled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_fills ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_fills_tank ON public.tank_fills (tank_id);
CREATE INDEX IF NOT EXISTS idx_tank_fills_date ON public.tank_fills (fill_date);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_fills' AND policyname='Org members can view tank fills') THEN
    CREATE POLICY "Org members can view tank fills" ON public.tank_fills FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_fills' AND policyname='Org members can insert tank fills') THEN
    CREATE POLICY "Org members can insert tank fills" ON public.tank_fills FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 9. TANK_MOVEMENTS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  movement_date date NOT NULL,
  movement_type text NOT NULL,
  tank_status_after text NOT NULL DEFAULT 'wet',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_movements_tank ON public.tank_movements (tank_id);
CREATE INDEX IF NOT EXISTS idx_tank_movements_date ON public.tank_movements (movement_date);
CREATE INDEX IF NOT EXISTS idx_tank_movements_type ON public.tank_movements (movement_type);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_movements' AND policyname='Org members can view tank movements') THEN
    CREATE POLICY "Org members can view tank movements" ON public.tank_movements FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_movements' AND policyname='Org members can insert tank movements') THEN
    CREATE POLICY "Org members can insert tank movements" ON public.tank_movements FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 10. SHIPMENTS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  semen_order_id uuid REFERENCES semen_orders(id) ON DELETE SET NULL,
  semen_company_id uuid REFERENCES semen_companies(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  received_from text,
  received_by text,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft',
  document_path text,
  notes text,
  reconciliation_snapshot jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_shipments_org ON public.shipments (organization_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments (semen_order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_company ON public.shipments (semen_company_id);
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON public.shipments (customer_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shipments' AND policyname='Org members can view shipments') THEN
    CREATE POLICY "Org members can view shipments" ON public.shipments FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shipments' AND policyname='Org members can insert shipments') THEN
    CREATE POLICY "Org members can insert shipments" ON public.shipments FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shipments' AND policyname='Org members can update shipments') THEN
    CREATE POLICY "Org members can update shipments" ON public.shipments FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shipments' AND policyname='Org owners and admins can delete shipments') THEN
    CREATE POLICY "Org owners and admins can delete shipments" ON public.shipments FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
END $$;


-- ─── 11. INVENTORY_TRANSACTIONS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  units_change integer NOT NULL,
  bull_catalog_id uuid REFERENCES bulls_catalog(id) ON DELETE SET NULL,
  bull_code text,
  custom_bull_name text,
  inventory_item_id uuid REFERENCES tank_inventory(id) ON DELETE SET NULL,
  shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES semen_orders(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inventory_tx_org ON public.inventory_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_tank ON public.inventory_transactions (tank_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_date ON public.inventory_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_type ON public.inventory_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_project ON public.inventory_transactions (project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_order ON public.inventory_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_customer ON public.inventory_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_shipment ON public.inventory_transactions (shipment_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_transactions' AND policyname='Org members can view inventory transactions') THEN
    CREATE POLICY "Org members can view inventory transactions" ON public.inventory_transactions FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_transactions' AND policyname='Org members can insert inventory transactions') THEN
    CREATE POLICY "Org members can insert inventory transactions" ON public.inventory_transactions FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 12. BULL_FAVORITES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bull_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  bull_catalog_id uuid REFERENCES bulls_catalog(id) ON DELETE CASCADE,
  created_at timestamp without time zone DEFAULT now()
);
ALTER TABLE public.bull_favorites ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS bull_favorites_user_id_bull_catalog_id_key ON public.bull_favorites (user_id, bull_catalog_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bull_favorites' AND policyname='Users manage own favorites') THEN
    CREATE POLICY "Users manage own favorites" ON public.bull_favorites FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;


-- ─── 13. BILLING_PRODUCTS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_category text NOT NULL,
  drug_name text,
  doses_per_unit integer,
  unit_label text,
  qbo_item_name text,
  default_price numeric DEFAULT 0,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.billing_products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_products_org ON public.billing_products (organization_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='billing_products' AND policyname='Users can view billing products for their org') THEN
    CREATE POLICY "Users can view billing products for their org" ON public.billing_products FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='billing_products' AND policyname='Admins can manage billing products') THEN
    CREATE POLICY "Admins can manage billing products" ON public.billing_products FOR ALL
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
END $$;


-- ─── 14. PROJECT_CONTACTS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_date date NOT NULL DEFAULT CURRENT_DATE,
  contacted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_project_contacts_org ON public.project_contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_project ON public.project_contacts (project_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_contacts' AND policyname='Org members can view project contacts') THEN
    CREATE POLICY "Org members can view project contacts" ON public.project_contacts FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_contacts' AND policyname='Org members can insert project contacts') THEN
    CREATE POLICY "Org members can insert project contacts" ON public.project_contacts FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_contacts' AND policyname='Org members can update project contacts') THEN
    CREATE POLICY "Org members can update project contacts" ON public.project_contacts FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_contacts' AND policyname='Org members can delete project contacts') THEN
    CREATE POLICY "Org members can delete project contacts" ON public.project_contacts FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
END $$;


-- ─── 15. PROJECT_BILLING ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_billing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  catl_invoice_number text,
  select_sires_invoice_number text,
  detection_type text,
  mass_breed_head integer,
  notes text,
  qbo_invoice_id text,
  qbo_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_billing ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS project_billing_project_id_key ON public.project_billing (project_id);
CREATE INDEX IF NOT EXISTS idx_project_billing_org ON public.project_billing (organization_id);
CREATE INDEX IF NOT EXISTS idx_project_billing_project ON public.project_billing (project_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing' AND policyname='Users can view billing for their org') THEN
    CREATE POLICY "Users can view billing for their org" ON public.project_billing FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing' AND policyname='Users can manage billing for their org') THEN
    CREATE POLICY "Users can manage billing for their org" ON public.project_billing FOR ALL
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','member'])));
  END IF;
END $$;


-- ─── 16. PROJECT_BILLING_LABOR ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_billing_labor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES project_billing(id) ON DELETE CASCADE,
  description text NOT NULL,
  labor_dates text,
  amount numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_billing_labor ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_labor_billing ON public.project_billing_labor (billing_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_labor' AND policyname='Users can view billing labor for their org') THEN
    CREATE POLICY "Users can view billing labor for their org" ON public.project_billing_labor FOR SELECT
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_labor' AND policyname='Users can manage billing labor for their org') THEN
    CREATE POLICY "Users can manage billing labor for their org" ON public.project_billing_labor FOR ALL
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
END $$;


-- ─── 17. PROJECT_BILLING_PRODUCTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_billing_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES project_billing(id) ON DELETE CASCADE,
  billing_product_id uuid REFERENCES billing_products(id),
  product_name text NOT NULL,
  product_category text,
  protocol_event_label text,
  event_date date,
  doses integer NOT NULL DEFAULT 0,
  doses_per_unit integer,
  unit_label text,
  units_calculated numeric,
  units_billed numeric,
  units_returned numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_billing_products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_products_billing ON public.project_billing_products (billing_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_products' AND policyname='Users can view billing products for their org') THEN
    CREATE POLICY "Users can view billing products for their org" ON public.project_billing_products FOR SELECT
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_products' AND policyname='Users can manage billing products for their org') THEN
    CREATE POLICY "Users can manage billing products for their org" ON public.project_billing_products FOR ALL
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
END $$;


-- ─── 18. PROJECT_BILLING_SEMEN ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_billing_semen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES project_billing(id) ON DELETE CASCADE,
  bull_catalog_id uuid REFERENCES bulls_catalog(id),
  bull_name text NOT NULL,
  bull_code text,
  units_packed integer DEFAULT 0,
  units_blown integer DEFAULT 0,
  units_returned integer DEFAULT 0,
  units_billable integer DEFAULT 0,
  unit_price numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_billing_semen ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_semen_billing ON public.project_billing_semen (billing_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_semen' AND policyname='Users can view billing semen for their org') THEN
    CREATE POLICY "Users can view billing semen for their org" ON public.project_billing_semen FOR SELECT
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_semen' AND policyname='Users can manage billing semen for their org') THEN
    CREATE POLICY "Users can manage billing semen for their org" ON public.project_billing_semen FOR ALL
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
END $$;


-- ─── 19. PROJECT_BILLING_SESSIONS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_billing_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_id uuid NOT NULL REFERENCES project_billing(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  session_label text,
  time_of_day text,
  head_count integer,
  crew text,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_billing_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_billing_sessions_billing ON public.project_billing_sessions (billing_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_sessions' AND policyname='Users can view billing sessions for their org') THEN
    CREATE POLICY "Users can view billing sessions for their org" ON public.project_billing_sessions FOR SELECT
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_billing_sessions' AND policyname='Users can manage billing sessions for their org') THEN
    CREATE POLICY "Users can manage billing sessions for their org" ON public.project_billing_sessions FOR ALL
      USING (billing_id IN (SELECT pb.id FROM project_billing pb WHERE pb.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())));
  END IF;
END $$;


-- ─── 20. TANK_PACKS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  pack_type text NOT NULL DEFAULT 'project',
  status text NOT NULL DEFAULT 'in_field',
  packed_at timestamptz NOT NULL DEFAULT now(),
  packed_by uuid,
  unpacked_at timestamptz,
  unpacked_by uuid,
  destination_name text,
  destination_address text,
  shipping_carrier text,
  tracking_number text,
  tank_return_expected boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_packs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_packs_org ON public.tank_packs (organization_id);
CREATE INDEX IF NOT EXISTS idx_tank_packs_field_tank ON public.tank_packs (field_tank_id);
CREATE INDEX IF NOT EXISTS idx_tank_packs_status ON public.tank_packs (status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_packs' AND policyname='Org members can view tank packs') THEN
    CREATE POLICY "Org members can view tank packs" ON public.tank_packs FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_packs' AND policyname='Org members can insert tank packs') THEN
    CREATE POLICY "Org members can insert tank packs" ON public.tank_packs FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_packs' AND policyname='Org members can update tank packs') THEN
    CREATE POLICY "Org members can update tank packs" ON public.tank_packs FOR UPDATE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_packs' AND policyname='Org members can delete tank packs') THEN
    CREATE POLICY "Org members can delete tank packs" ON public.tank_packs FOR DELETE
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 21. TANK_PACK_LINES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_pack_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tank_pack_id uuid NOT NULL REFERENCES tank_packs(id) ON DELETE CASCADE,
  source_tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  bull_catalog_id uuid REFERENCES bulls_catalog(id),
  bull_name text NOT NULL,
  bull_code text,
  units integer NOT NULL,
  source_canister text,
  field_canister text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_pack_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_pack_lines_pack ON public.tank_pack_lines (tank_pack_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_lines_source ON public.tank_pack_lines (source_tank_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_lines' AND policyname='Org members can view tank pack lines') THEN
    CREATE POLICY "Org members can view tank pack lines" ON public.tank_pack_lines FOR SELECT
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_lines' AND policyname='Org members can insert tank pack lines') THEN
    CREATE POLICY "Org members can insert tank pack lines" ON public.tank_pack_lines FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_lines' AND policyname='Org members can delete tank pack lines') THEN
    CREATE POLICY "Org members can delete tank pack lines" ON public.tank_pack_lines FOR DELETE
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 22. TANK_PACK_PROJECTS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_pack_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tank_pack_id uuid NOT NULL REFERENCES tank_packs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_pack_projects ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS tank_pack_projects_tank_pack_id_project_id_key ON public.tank_pack_projects (tank_pack_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_projects_pack ON public.tank_pack_projects (tank_pack_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_projects_project ON public.tank_pack_projects (project_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_projects' AND policyname='Org members can view tank pack projects') THEN
    CREATE POLICY "Org members can view tank pack projects" ON public.tank_pack_projects FOR SELECT
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_projects.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_projects' AND policyname='Org members can insert tank pack projects') THEN
    CREATE POLICY "Org members can insert tank pack projects" ON public.tank_pack_projects FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_projects.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_projects' AND policyname='Org members can delete tank pack projects') THEN
    CREATE POLICY "Org members can delete tank pack projects" ON public.tank_pack_projects FOR DELETE
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_projects.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 23. TANK_PACK_ORDERS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_pack_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tank_pack_id uuid NOT NULL REFERENCES tank_packs(id) ON DELETE CASCADE,
  semen_order_id uuid NOT NULL REFERENCES semen_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_pack_orders ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS tank_pack_orders_tank_pack_id_semen_order_id_key ON public.tank_pack_orders (tank_pack_id, semen_order_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_orders_pack_id ON public.tank_pack_orders (tank_pack_id);
CREATE INDEX IF NOT EXISTS idx_tank_pack_orders_order_id ON public.tank_pack_orders (semen_order_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_orders' AND policyname='Org members can view tank pack orders') THEN
    CREATE POLICY "Org members can view tank pack orders" ON public.tank_pack_orders FOR SELECT
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_orders.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_orders' AND policyname='Org members can insert tank pack orders') THEN
    CREATE POLICY "Org members can insert tank pack orders" ON public.tank_pack_orders FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_orders.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_pack_orders' AND policyname='Org members can delete tank pack orders') THEN
    CREATE POLICY "Org members can delete tank pack orders" ON public.tank_pack_orders FOR DELETE
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_pack_orders.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 24. TANK_UNPACK_LINES ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tank_unpack_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tank_pack_id uuid NOT NULL REFERENCES tank_packs(id) ON DELETE CASCADE,
  destination_tank_id uuid NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  bull_catalog_id uuid REFERENCES bulls_catalog(id),
  bull_name text NOT NULL,
  bull_code text,
  units_returned integer NOT NULL,
  destination_canister text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tank_unpack_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tank_unpack_lines_pack ON public.tank_unpack_lines (tank_pack_id);
CREATE INDEX IF NOT EXISTS idx_tank_unpack_lines_dest ON public.tank_unpack_lines (destination_tank_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_unpack_lines' AND policyname='Org members can view tank unpack lines') THEN
    CREATE POLICY "Org members can view tank unpack lines" ON public.tank_unpack_lines FOR SELECT
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_unpack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_unpack_lines' AND policyname='Org members can insert tank unpack lines') THEN
    CREATE POLICY "Org members can insert tank unpack lines" ON public.tank_unpack_lines FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_unpack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tank_unpack_lines' AND policyname='Org members can delete tank unpack lines') THEN
    CREATE POLICY "Org members can delete tank unpack lines" ON public.tank_unpack_lines FOR DELETE
      USING (EXISTS (SELECT 1 FROM tank_packs tp JOIN organization_members om ON om.organization_id = tp.organization_id WHERE tp.id = tank_unpack_lines.tank_pack_id AND om.user_id = auth.uid() AND om.accepted = true));
  END IF;
END $$;


-- ─── 25. GOOGLE_CALENDAR_EVENTS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.google_calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  protocol_event_id uuid NOT NULL REFERENCES protocol_events(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_events_user_id_protocol_event_id_key ON public.google_calendar_events (user_id, protocol_event_id);
CREATE INDEX IF NOT EXISTS idx_gcal_events_user_project ON public.google_calendar_events (user_id, project_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='google_calendar_events' AND policyname='Users view own google_calendar_events') THEN
    CREATE POLICY "Users view own google_calendar_events" ON public.google_calendar_events FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='google_calendar_events' AND policyname='Users insert own google_calendar_events') THEN
    CREATE POLICY "Users insert own google_calendar_events" ON public.google_calendar_events FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='google_calendar_events' AND policyname='Users update own google_calendar_events') THEN
    CREATE POLICY "Users update own google_calendar_events" ON public.google_calendar_events FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='google_calendar_events' AND policyname='Users delete own google_calendar_events') THEN
    CREATE POLICY "Users delete own google_calendar_events" ON public.google_calendar_events FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;


-- ─── 26. RECEIVING_REPORT_AUDIT_LOG ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.receiving_report_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  edited_by uuid NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  edited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receiving_report_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS receiving_report_audit_log_shipment_idx ON public.receiving_report_audit_log (shipment_id);
CREATE INDEX IF NOT EXISTS receiving_report_audit_log_org_idx ON public.receiving_report_audit_log (organization_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='receiving_report_audit_log' AND policyname='audit_log_select') THEN
    CREATE POLICY "audit_log_select" ON public.receiving_report_audit_log FOR SELECT
      USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='receiving_report_audit_log' AND policyname='audit_log_insert') THEN
    CREATE POLICY "audit_log_insert" ON public.receiving_report_audit_log FOR INSERT
      WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin'])));
  END IF;
END $$;


-- ─── TRIGGERS ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_billing_updated') THEN
    CREATE TRIGGER trg_billing_updated BEFORE UPDATE ON public.project_billing
    FOR EACH ROW EXECUTE FUNCTION update_billing_timestamp();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'shipments_updated_at') THEN
    CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION update_shipments_updated_at();
  END IF;
END $$;


-- ─── STORAGE BUCKETS ────────────────────────────────────────────────────────
-- NOTE: On a fresh Supabase project you must create these buckets.
-- Uncomment and run if needed:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('shipment-documents', 'shipment-documents', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true) ON CONFLICT DO NOTHING;
