
-- Create a security definer function to check if a user belongs to an org
CREATE OR REPLACE FUNCTION public.user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id AND accepted = true
$$;

-- Drop the recursive SELECT policy
DROP POLICY IF EXISTS "Members see their org members" ON public.organization_members;

-- Recreate it using the security definer function
CREATE POLICY "Members see their org members"
ON public.organization_members
FOR SELECT
USING (organization_id IN (SELECT public.user_org_ids(auth.uid())));
