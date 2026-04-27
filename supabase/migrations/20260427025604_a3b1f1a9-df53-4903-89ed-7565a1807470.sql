
REVOKE EXECUTE ON FUNCTION public.finalize_billing_inventory(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_billing_inventory(jsonb) TO authenticated;
