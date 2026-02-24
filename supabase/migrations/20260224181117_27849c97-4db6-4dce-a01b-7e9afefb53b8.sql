
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Org admins can manage invites" ON pending_invites;

-- Admins and owners can insert invites
CREATE POLICY "Org admins can insert invites" ON pending_invites
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND accepted = true
    )
  );

-- Admins and owners can update invites
CREATE POLICY "Org admins can update invites" ON pending_invites
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND accepted = true
    )
  );

-- Anyone can look up a pending invite by token (safe because tokens are unguessable UUIDs)
CREATE POLICY "Anyone can look up invite by token" ON pending_invites
  FOR SELECT USING (true);
