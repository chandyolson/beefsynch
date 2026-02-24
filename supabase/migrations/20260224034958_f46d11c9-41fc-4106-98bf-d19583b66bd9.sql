
-- Add invite_code to organizations
ALTER TABLE public.organizations ADD COLUMN invite_code text UNIQUE DEFAULT substr(md5(random()::text), 1, 8);

-- Backfill existing rows
UPDATE public.organizations SET invite_code = substr(md5(random()::text), 1, 8) WHERE invite_code IS NULL;

-- Allow authenticated users to create organizations
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Allow authenticated users to insert themselves into organization_members
CREATE POLICY "Users can insert own membership"
ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
