
-- Fix: organization_members policies are all RESTRICTIVE, but PostgreSQL
-- requires at least one PERMISSIVE policy per operation. Recreate them as PERMISSIVE.

-- DROP existing restrictive policies
DROP POLICY IF EXISTS "Owners and admins can delete members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can insert own membership" ON public.organization_members;
DROP POLICY IF EXISTS "Users can accept their own invite" ON public.organization_members;
DROP POLICY IF EXISTS "Members see their org members" ON public.organization_members;

-- Recreate as PERMISSIVE
CREATE POLICY "Members see their org members"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT user_org_ids(auth.uid())));

CREATE POLICY "Users can insert own membership"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners and admins can update members"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY "Users can accept their own invite"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (invited_email = (auth.jwt() ->> 'email'::text) AND accepted = false)
  WITH CHECK (invited_email = (auth.jwt() ->> 'email'::text));

CREATE POLICY "Owners and admins can delete members"
  ON public.organization_members FOR DELETE
  TO authenticated
  USING (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::text, 'admin'::text]));
