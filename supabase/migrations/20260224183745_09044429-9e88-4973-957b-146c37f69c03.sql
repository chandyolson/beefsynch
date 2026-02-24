
-- protocol_events: allow org members to read/insert/update/delete via project's org
CREATE POLICY "Org members view protocol_events" ON protocol_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = protocol_events.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members insert protocol_events" ON protocol_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = protocol_events.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members update protocol_events" ON protocol_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = protocol_events.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members delete protocol_events" ON protocol_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = protocol_events.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

-- project_bulls: allow org members to read/insert/update/delete via project's org
CREATE POLICY "Org members view project_bulls" ON project_bulls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_bulls.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members insert project_bulls" ON project_bulls
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_bulls.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members update project_bulls" ON project_bulls
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_bulls.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );

CREATE POLICY "Org members delete project_bulls" ON project_bulls
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE p.id = project_bulls.project_id
        AND om.user_id = auth.uid()
        AND om.accepted = true
    )
  );
