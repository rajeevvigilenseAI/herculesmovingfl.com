export async function allowRate(supabase, req, prefix, maxHits = 8) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${prefix}:${ip}`;
  const { data } = await supabase.from("rate_limits").select("*").eq("key", key).maybeSingle();
  const now = Date.now();
  if (!data) {
    await supabase.from("rate_limits").insert({ key, hits: 1, window_start: new Date().toISOString() });
    return true;
  }
  const start = new Date(data.window_start).getTime();
  if (now - start > 10 * 60 * 1000) {
    await supabase.from("rate_limits").update({ hits: 1, window_start: new Date().toISOString() }).eq("key", key);
    return true;
  }
  if (data.hits >= maxHits) return false;
  await supabase.from("rate_limits").update({ hits: data.hits + 1 }).eq("key", key);
  return true;
}
