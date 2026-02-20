
-- 1. projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  protocol text NOT NULL,
  cattle_type text NOT NULL CHECK (cattle_type IN ('Heifers', 'Cows')),
  head_count integer NOT NULL DEFAULT 0,
  breeding_date date,
  breeding_time time,
  status text NOT NULL DEFAULT 'Tentative' CHECK (status IN ('Tentative', 'Confirmed', 'Complete')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (no auth required per user request)
CREATE POLICY "Allow public read on projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Allow public insert on projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on projects" ON public.projects FOR DELETE USING (true);

-- 2. protocol_events
CREATE TABLE public.protocol_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_date date NOT NULL,
  event_time time
);

ALTER TABLE public.protocol_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on protocol_events" ON public.protocol_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert on protocol_events" ON public.protocol_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on protocol_events" ON public.protocol_events FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on protocol_events" ON public.protocol_events FOR DELETE USING (true);

-- 3. bulls_catalog (public read-only)
CREATE TABLE public.bulls_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bull_name text NOT NULL,
  registration_number text NOT NULL,
  breed text NOT NULL,
  company text NOT NULL CHECK (company IN ('ABS', 'ST Genetics', 'Select Sires', 'Genex')),
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.bulls_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on bulls_catalog" ON public.bulls_catalog FOR SELECT USING (true);

-- 4. project_bulls
CREATE TABLE public.project_bulls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bull_catalog_id uuid REFERENCES public.bulls_catalog(id),
  custom_bull_name text,
  units integer NOT NULL DEFAULT 0
);

ALTER TABLE public.project_bulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on project_bulls" ON public.project_bulls FOR SELECT USING (true);
CREATE POLICY "Allow public insert on project_bulls" ON public.project_bulls FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on project_bulls" ON public.project_bulls FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on project_bulls" ON public.project_bulls FOR DELETE USING (true);
