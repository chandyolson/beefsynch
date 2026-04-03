
ALTER TABLE public.semen_orders
  ADD COLUMN customer_phone text,
  ADD COLUMN customer_email text,
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
