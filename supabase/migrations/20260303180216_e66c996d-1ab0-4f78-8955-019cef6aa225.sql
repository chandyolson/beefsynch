DROP POLICY IF EXISTS "Anyone can look up invite by token" ON public.pending_invites;

CREATE POLICY "Org admins see own org invites" ON public.pending_invites FOR SELECT TO authenticated USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND accepted = true
  )
);

CREATE OR REPLACE FUNCTION public.lookup_invite_by_token(_token uuid)
RETURNS TABLE(
  token uuid,
  organization_id uuid,
  invited_email text,
  accepted boolean,
  expires_at timestamptz,
  org_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pi.token, pi.organization_id, pi.invited_email, pi.accepted, pi.expires_at, o.name as org_name
  FROM public.pending_invites pi
  JOIN public.organizations o ON o.id = pi.organization_id
  WHERE pi.token = _token AND pi.accepted = false AND pi.expires_at > now()
  LIMIT 1;
$$;