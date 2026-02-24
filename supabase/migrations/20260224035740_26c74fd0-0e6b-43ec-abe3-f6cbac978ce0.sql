
-- Allow users to accept their own pending invite (match by email from JWT)
CREATE POLICY "Users can accept their own invite"
ON public.organization_members FOR UPDATE TO authenticated
USING (
  invited_email = (auth.jwt() ->> 'email')
  AND accepted = false
)
WITH CHECK (
  invited_email = (auth.jwt() ->> 'email')
);
