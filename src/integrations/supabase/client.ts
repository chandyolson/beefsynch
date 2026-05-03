// Supabase client — URL and publishable key are hardcoded on purpose.
// Both values are public (the publishable key is designed to ship in the
// browser bundle). Source-controlling them keeps the deployed app pinned to
// the correct project, so a Lovable Cloud env-var change can't silently
// repoint production at a different (possibly dead) Supabase instance.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ktelduvdymplytoihtht.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VIPFry_-jBxtxVR5fQIZ0w_BwX-tAm7";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
