
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Ensure foreign keys have CASCADE delete
ALTER TABLE public.protocol_events
  DROP CONSTRAINT IF EXISTS protocol_events_project_id_fkey,
  ADD CONSTRAINT protocol_events_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.project_bulls
  DROP CONSTRAINT IF EXISTS project_bulls_project_id_fkey,
    ADD CONSTRAINT project_bulls_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Create security definer function to clean up old anonymous projects
CREATE OR REPLACE FUNCTION public.cleanup_anonymous_projects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.projects
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE is_anonymous = true
      AND created_at < now() - interval '48 hours'
  );
END;
$$;

-- Schedule nightly at 3:00 AM UTC
SELECT cron.schedule(
  'cleanup-anonymous-projects',
  '0 3 * * *',
  'SELECT public.cleanup_anonymous_projects()'
);
