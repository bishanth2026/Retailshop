import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
if (!cfg.url || cfg.url.includes("YOUR-PROJECT")) {
  console.warn("Supabase is not configured yet — edit js/config.js with your project URL and anon key.");
}

export const supabase = createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
