(() => {
  const url = window.DAUR_SUPABASE_URL;
  const key = window.DAUR_SUPABASE_PUBLISHABLE_KEY;
  const createClient = window.supabase?.createClient;
  if (!url || !key || !createClient || url.includes("YOUR_PROJECT_REF") || key.includes("YOUR_SUPABASE")) {
    window.daurSupabase = null;
    return;
  }
  window.daurSupabase = createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
})();
