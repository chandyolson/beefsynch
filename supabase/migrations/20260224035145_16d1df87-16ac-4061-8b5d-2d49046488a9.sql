
-- Allow anyone authenticated to look up an org by invite_code (needed for join flow)
CREATE POLICY "Authenticated users can lookup org by invite_code"
ON public.organizations FOR SELECT TO authenticated
USING (true);

-- Drop the old restrictive select policy since the new one covers it
DROP POLICY IF EXISTS "Members see their organization" ON public.organizations;
