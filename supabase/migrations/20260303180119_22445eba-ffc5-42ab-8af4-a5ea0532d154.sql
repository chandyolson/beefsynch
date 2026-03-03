DROP POLICY IF EXISTS "Authenticated users can lookup org by invite_code" ON public.organizations;

CREATE POLICY "Members see own organizations" ON public.organizations FOR SELECT TO authenticated USING (
  id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND accepted = true
  )
);

CREATE OR REPLACE FUNCTION public.lookup_org_by_invite_code(_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.organizations WHERE invite_code = _code LIMIT 1;
$$;