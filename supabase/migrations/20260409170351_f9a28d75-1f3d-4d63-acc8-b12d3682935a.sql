
-- SECURITY DEFINER functions to export auth tables (service-role only access)
CREATE OR REPLACE FUNCTION public.export_auth_users()
RETURNS SETOF json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(u.*) FROM auth.users u;
$$;

CREATE OR REPLACE FUNCTION public.export_auth_identities()
RETURNS SETOF json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(i.*) FROM auth.identities i;
$$;

-- Restrict access: only service role can call these (no RLS bypass for regular users)
REVOKE EXECUTE ON FUNCTION public.export_auth_users() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_auth_identities() FROM anon, authenticated;
