const DEFAULT_ORIGINS = [
  "https://herculesmovingfl.com",
  "https://www.herculesmovingfl.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

export function allowedOrigins() {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = allowedOrigins().includes(origin) ? origin : allowedOrigins()[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json"
    }
  });
}

export function isAllowedOrigin(req) {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  return allowedOrigins().includes(origin);
}

export function sanitizeText(value, max = 200) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function isValidUsPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return true;
  return digits.length === 10;
}

export function formatUsPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return `+1${ten}`;
}
