-- ============================================================
-- PROJECTS: Replace permissive policies with user_id-scoped ones
-- ============================================================
DROP POLICY IF EXISTS "Allow public read on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public insert on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public update on projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public delete on projects" ON public.projects;

CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- PROJECT_BULLS: Ownership via project join
-- ============================================================
DROP POLICY IF EXISTS "Allow public read on project_bulls" ON public.project_bulls;
DROP POLICY IF EXISTS "Allow public insert on project_bulls" ON public.project_bulls;
DROP POLICY IF EXISTS "Allow public update on project_bulls" ON public.project_bulls;
DROP POLICY IF EXISTS "Allow public delete on project_bulls" ON public.project_bulls;

CREATE POLICY "Users can view bulls for their projects"
  ON public.project_bulls FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_bulls.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert bulls for their projects"
  ON public.project_bulls FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_bulls.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update bulls for their projects"
  ON public.project_bulls FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_bulls.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete bulls for their projects"
  ON public.project_bulls FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_bulls.project_id
      AND projects.user_id = auth.uid()
  ));

-- ============================================================
-- PROTOCOL_EVENTS: Ownership via project join
-- ============================================================
DROP POLICY IF EXISTS "Allow public read on protocol_events" ON public.protocol_events;
DROP POLICY IF EXISTS "Allow public insert on protocol_events" ON public.protocol_events;
DROP POLICY IF EXISTS "Allow public update on protocol_events" ON public.protocol_events;
DROP POLICY IF EXISTS "Allow public delete on protocol_events" ON public.protocol_events;

CREATE POLICY "Users can view events for their projects"
  ON public.protocol_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = protocol_events.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert events for their projects"
  ON public.protocol_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = protocol_events.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can update events for their projects"
  ON public.protocol_events FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = protocol_events.project_id
      AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete events for their projects"
  ON public.protocol_events FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = protocol_events.project_id
      AND projects.user_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';