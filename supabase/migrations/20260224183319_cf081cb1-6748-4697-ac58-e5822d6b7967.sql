
DROP POLICY IF EXISTS "Admins update projects" ON projects;
DROP POLICY IF EXISTS "Admins delete projects" ON projects;

CREATE POLICY "Org members update projects" ON projects
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND accepted = true
    )
  );

CREATE POLICY "Org members delete projects" ON projects
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND accepted = true
    )
  );
