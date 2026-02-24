
-- Create a security definer function to get org members with their auth emails
CREATE OR REPLACE FUNCTION public.get_org_members(_organization_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  invited_email text,
  role text,
  accepted boolean,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    om.id,
    om.user_id,
    om.invited_email,
    om.role,
    om.accepted,
    CASE
      WHEN om.user_id IS NOT NULL THEN (SELECT au.email FROM auth.users au WHERE au.id = om.user_id)
      ELSE om.invited_email
    END AS email
  FROM public.organization_members om
  WHERE om.organization_id = _organization_id
    AND om.organization_id IN (SELECT public.user_org_ids(auth.uid()))
$$;
