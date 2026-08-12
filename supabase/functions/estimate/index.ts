import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { calculateEstimate } from "../_shared/pricing.js";
import { validateServiceArea } from "../_shared/serviceArea.js";
import { drivingDistanceMiles } from "../_shared/distance.js";
import { corsHeaders, json, isAllowedOrigin, sanitizeText } from "../_shared/http.js";
import { allowRate } from "../_shared/rateLimit.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }
  if (!isAllowedOrigin(req)) {
    return json(req, { error: "Forbidden" }, 403);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false } }
  );

  try {
    if (!(await allowRate(supabase, req, "estimate", 20))) {
      return json(req, { error: "Too many requests. Please try again shortly." }, 429);
    }

    const body = await req.json();
    const origin = readAddress(body.origin, "origin");
    const destination = readAddress(body.destination, "destination");
    validateServiceArea(origin.state, destination.state);
    // A customer-selected range wins over the coordinate math, but only after
    // the shared module has validated it against the allowed ranges.
    const distanceBand = sanitizeText(body.distanceBand, 20);
    const miles = await drivingDistanceMiles(origin, destination, distanceBand);
    const quote = calculateEstimate(miles, body.homeSize);
    return json(req, {
      ...quote,
      distanceBand,
      origin,
      destination
    });
  } catch (err) {
    return json(req, { error: err.message || "Unable to calculate estimate" }, 400);
  }
});

function readAddress(raw, label) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Please enter an origin and destination.`);
  }
  const street = sanitizeText(raw.street, 160);
  const city = sanitizeText(raw.city, 80);
  const state = sanitizeText(raw.state, 2).toUpperCase();
  const zip = sanitizeText(raw.zip, 10);
  // A full street address is preferred but not required: a city + state
  // (or a ZIP) is enough to calculate a driving-distance estimate.
  if (!city && !zip) {
    throw new Error(`Please enter a city or ZIP for the ${label}.`);
  }
  if (!state) {
    throw new Error(`Please enter a state for the ${label}.`);
  }
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new Error(`Please enter a valid ${label} ZIP code.`);
  }
  return {
    street,
    unit: sanitizeText(raw.unit, 40),
    city,
    state,
    zip
  };
}
