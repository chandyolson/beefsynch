-- When a tank pack flips to status='unpacked', auto-promote any linked
-- project from "In Field" to "Ready to Bill" so it shows up on the
-- billable report. Earlier statuses (Tentative / Confirmed) and later
-- statuses (Invoiced) are left untouched.

CREATE OR REPLACE FUNCTION public.auto_transition_project_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'unpacked' AND OLD.status IS DISTINCT FROM 'unpacked' THEN
    UPDATE projects p
    SET status = 'Ready to Bill'
    FROM tank_pack_projects tpp
    WHERE tpp.tank_pack_id = NEW.id
      AND tpp.project_id = p.id
      AND p.status = 'In Field';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_transition_project_status ON public.tank_packs;

CREATE TRIGGER trg_auto_transition_project_status
  AFTER UPDATE ON public.tank_packs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_transition_project_status();

NOTIFY pgrst, 'reload schema';
