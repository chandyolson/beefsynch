
-- Add is_custom and created_by columns to bulls_catalog
ALTER TABLE public.bulls_catalog
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

-- Allow org members to insert custom bulls
CREATE POLICY "Org members can insert custom bulls"
  ON public.bulls_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_custom = true
    AND created_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND accepted = true
    )
  );

-- Allow org members to update their custom bulls
CREATE POLICY "Org members can update custom bulls"
  ON public.bulls_catalog
  FOR UPDATE
  TO authenticated
  USING (
    is_custom = true
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND accepted = true
    )
  );

-- Allow org members to delete their custom bulls
CREATE POLICY "Org members can delete custom bulls"
  ON public.bulls_catalog
  FOR DELETE
  TO authenticated
  USING (
    is_custom = true
    AND organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND accepted = true
    )
  );
