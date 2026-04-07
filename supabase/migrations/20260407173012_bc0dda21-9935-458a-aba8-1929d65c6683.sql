
-- Allow admins (not just owners) to insert audit log entries
DROP POLICY IF EXISTS "audit_log_insert" ON public.receiving_report_audit_log;
CREATE POLICY "audit_log_insert" ON public.receiving_report_audit_log
  FOR INSERT TO public
  WITH CHECK (
    organization_id IN (
      SELECT organization_members.organization_id
      FROM organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

-- Allow owners and admins to delete confirmed shipments
CREATE POLICY "Org owners and admins can delete shipments" ON public.shipments
  FOR DELETE TO public
  USING (
    organization_id IN (
      SELECT organization_members.organization_id
      FROM organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );
