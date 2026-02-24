
-- Create a security definer function to check org role without recursive RLS
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE user_id = _user_id
    AND organization_id = _organization_id
    AND accepted = true
  LIMIT 1
$$;

-- Owners can update organization name
CREATE POLICY "Owners can update their organization"
ON public.organizations FOR UPDATE TO authenticated
USING (public.get_org_role(auth.uid(), id) = 'owner')
WITH CHECK (public.get_org_role(auth.uid(), id) = 'owner');

-- Owners can delete organizations
CREATE POLICY "Owners can delete their organization"
ON public.organizations FOR DELETE TO authenticated
USING (public.get_org_role(auth.uid(), id) = 'owner');

-- Owners and admins can update org members (change roles)
CREATE POLICY "Owners and admins can update members"
ON public.organization_members FOR UPDATE TO authenticated
USING (
  public.get_org_role(auth.uid(), organization_id) IN ('owner', 'admin')
);

-- Owners and admins can delete org members (remove)
CREATE POLICY "Owners and admins can delete members"
ON public.organization_members FOR DELETE TO authenticated
USING (
  public.get_org_role(auth.uid(), organization_id) IN ('owner', 'admin')
);
