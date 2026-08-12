import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { calculateEstimate } from "../_shared/pricing.js";
import { assertSchedule } from "../_shared/scheduling.js";
import { validateServiceArea, shouldFlagNeedsReview } from "../_shared/serviceArea.js";
import { drivingDistanceMiles, bandLabel } from "../_shared/distance.js";
import {
  corsHeaders,
  json,
  isAllowedOrigin,
  sanitizeText,
  isValidEmail,
  isValidUsPhone,
  formatUsPhone
} from "../_shared/http.js";
import { allowRate } from "../_shared/rateLimit.js";

const PROPERTY_TYPES = new Set(["house", "apartment", "condo", "storage", "office", "other"]);
const ACCESS_TYPES = new Set(["ground_floor", "elevator", "stairs"]);
const SPECIALTY = new Set([
  "piano",
  "safe",
  "pool_table",
  "oversized_furniture",
  "tv_over_75",
  "packing_needed",
  "storage_stop",
  "additional_stop",
  "other_specialty"
]);

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
    if (!(await allowRate(supabase, req, "book", 8))) {
      return json(req, { error: "Too many requests. Please try again shortly." }, 429);
    }

    const body = await req.json();
    if (sanitizeText(body.website, 80)) {
      return json(req, { error: "Unable to complete reservation." }, 400);
    }

    const origin = readAddress(body.origin, "origin");
    const destination = readAddress(body.destination, "destination");
    validateServiceArea(origin.state, destination.state);
    assertSchedule(body.moveDate, body.arrivalWindow);

    const firstName = sanitizeText(body.firstName, 60);
    const lastName = sanitizeText(body.lastName, 60);
    const email = sanitizeText(body.email, 120).toLowerCase();
    const phone = formatUsPhone(body.phone);
    if (!firstName || !lastName) throw new Error("First and last name are required.");
    if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
    if (!isValidUsPhone(body.phone)) throw new Error("Please enter a valid US mobile phone number.");
    if (body.acceptedTerms !== true) throw new Error("Please agree to the Terms and Conditions to reserve.");

    const specialtyItems = Array.isArray(body.specialtyItems)
      ? body.specialtyItems.filter((item) => SPECIALTY.has(item))
      : [];
    const needsReview = shouldFlagNeedsReview(specialtyItems);

    // A customer-selected range wins over the coordinate math, so the price the
    // widget showed is the price this reservation is written with.
    const distanceBand = sanitizeText(body.distanceBand, 20);
    const miles = await drivingDistanceMiles(origin, destination, distanceBand);
    const quote = calculateEstimate(miles, body.homeSize);

    const idempotencyKey = sanitizeText(body.idempotencyKey, 80) || crypto.randomUUID();

    const existing = await supabase
      .from("bookings")
      .select("id, reference, move_date, arrival_window, estimated_hours, estimated_price, needs_review, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing.data) {
      return json(req, {
        alreadyCreated: true,
        id: existing.data.id,
        reference: existing.data.reference,
        moveDate: existing.data.move_date,
        arrivalWindow: existing.data.arrival_window,
        estimatedHours: existing.data.estimated_hours,
        estimatedPrice: existing.data.estimated_price,
        needsReview: existing.data.needs_review,
        status: existing.data.status
      });
    }

    const { data: refRow, error: refErr } = await supabase.rpc("next_booking_reference");
    if (refErr || !refRow) throw new Error("Unable to assign a reference number.");

    const insert = {
      reference: refRow,
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      origin_street: origin.street || null,
      origin_unit: origin.unit || null,
      origin_city: origin.city || null,
      origin_state: origin.state,
      origin_zip: origin.zip || null,
      destination_street: destination.street || null,
      destination_unit: destination.unit || null,
      destination_city: destination.city || null,
      destination_state: destination.state,
      destination_zip: destination.zip || null,
      distance_miles: quote.distanceMiles,
      distance_band: distanceBand || null,
      home_size: quote.homeSize,
      estimated_hours: quote.estimatedHours,
      estimated_price: quote.estimatedPrice,
      move_date: body.moveDate,
      arrival_window: body.arrivalWindow,
      origin_property_type: PROPERTY_TYPES.has(body.originPropertyType) ? body.originPropertyType : null,
      origin_access: ACCESS_TYPES.has(body.originAccess) ? body.originAccess : null,
      destination_property_type: PROPERTY_TYPES.has(body.destinationPropertyType) ? body.destinationPropertyType : null,
      destination_access: ACCESS_TYPES.has(body.destinationAccess) ? body.destinationAccess : null,
      specialty_items: specialtyItems,
      notes: sanitizeText(body.notes, 1000) || null,
      needs_review: needsReview,
      status: "reserved",
      idempotency_key: idempotencyKey
    };

    const { data: booking, error: insertErr } = await supabase
      .from("bookings")
      .insert(insert)
      .select("id, reference, move_date, arrival_window, estimated_hours, estimated_price, needs_review, status")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const again = await supabase
          .from("bookings")
          .select("id, reference, move_date, arrival_window, estimated_hours, estimated_price, needs_review, status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (again.data) {
          return json(req, { alreadyCreated: true, ...mapBooking(again.data) });
        }
      }
      console.error(insertErr);
      throw new Error("Unable to save your reservation. Please try again.");
    }

    const payload = {
      ...mapBooking(booking),
      firstName,
      lastName,
      phone,
      email,
      origin,
      destination,
      homeSizeLabel: quote.homeSizeLabel,
      distanceMiles: quote.distanceMiles,
      distanceBand: distanceBand,
      distanceBandLabel: distanceBand ? bandLabel(distanceBand) : "",
      notes: insert.notes,
      specialtyItems,
      originPropertyType: insert.origin_property_type,
      originAccess: insert.origin_access,
      destinationPropertyType: insert.destination_property_type,
      destinationAccess: insert.destination_access,
      acceptedTerms: true
    };

    await Promise.allSettled([
      sendCustomerEmail(payload),
      sendInternalEmail(payload),
      sendQuoSms(payload),
      createCalendarEvent(supabase, booking.id, payload)
    ]);

    return json(req, payload);
  } catch (err) {
    return json(req, { error: err.message || "Unable to complete reservation" }, 400);
  }
});

function mapBooking(row) {
  return {
    id: row.id,
    reference: row.reference,
    moveDate: row.move_date,
    arrivalWindow: row.arrival_window,
    estimatedHours: row.estimated_hours,
    estimatedPrice: row.estimated_price,
    needsReview: row.needs_review,
    status: row.status
  };
}

function readAddress(raw, label) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Please enter an origin and destination.`);
  }
  const street = sanitizeText(raw.street, 160);
  const city = sanitizeText(raw.city, 80);
  const state = sanitizeText(raw.state, 2).toUpperCase();
  const zip = sanitizeText(raw.zip, 10);
  // A full street address is preferred but not required: a city + state
  // (or a ZIP) is enough to reserve a move. Exact address can be confirmed
  // later if needed.
  if (!city && !zip) {
    throw new Error(`Please enter a city or ZIP for the ${label}.`);
  }
  if (!state) {
    throw new Error(`Please enter a state for the ${label}.`);
  }
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new Error(`Please enter a valid ${label} ZIP code.`);
  }
  return { street, unit: sanitizeText(raw.unit, 40), city, state, zip };
}

async function sendCustomerEmail(booking) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BOOKING_FROM_EMAIL");
  const replyTo = Deno.env.get("BOOKING_REPLY_TO") || from;
  const termsUrl = Deno.env.get("TERMS_URL") || "https://herculesmovingfl.com/terms.html";
  if (!key || !from) return;
  const dateLabel = formatNiceDate(booking.moveDate);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [booking.email],
      reply_to: replyTo,
      subject: `Your Hercules Movers reservation ${booking.reference}`,
      text: [
        `Hi ${booking.firstName},`,
        "",
        "Your move with Hercules Movers is reserved.",
        "",
        `Reference: ${booking.reference}`,
        `From: ${formatAddr(booking.origin)}`,
        `To: ${formatAddr(booking.destination)}`,
        `Move date: ${dateLabel}`,
        `Arrival window: ${booking.arrivalWindow}`,
        `Estimated time: ${booking.estimatedHours} hours`,
        `Estimated price: $${booking.estimatedPrice}`,
        `Phone: ${booking.phone}`,
        `Email: ${booking.email}`,
        booking.originPropertyType ? `Origin property: ${booking.originPropertyType}` : "",
        booking.originAccess ? `Origin access: ${booking.originAccess}` : "",
        booking.destinationPropertyType ? `Destination property: ${booking.destinationPropertyType}` : "",
        booking.destinationAccess ? `Destination access: ${booking.destinationAccess}` : "",
        booking.specialtyItems?.length ? `Move details: ${booking.specialtyItems.join(", ")}` : "",
        booking.notes ? `Notes: ${booking.notes}` : "",
        "",
        `Final charges are governed by our Terms and Conditions: ${termsUrl}`,
        "",
        "This is an estimate based on the information provided. Final charges may vary if the actual inventory, services required, access conditions, packing requirements, waiting time, or move details differ.",
        "",
        "Need to make a change or cancel your move? Simply reply to this email and our team will assist you.",
        "",
        "Hercules Movers",
        "1 (754) 354-2008"
      ].filter(Boolean).join("\n")
    })
  });
}

async function sendInternalEmail(booking) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BOOKING_FROM_EMAIL");
  const notify = Deno.env.get("NOTIFY_EMAIL") || "herculesmoversfl@gmail.com";
  const termsUrl = Deno.env.get("TERMS_URL") || "https://herculesmovingfl.com/terms.html";
  if (!key || !from) return;
  const dateLabel = formatNiceDate(booking.moveDate);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [notify],
      reply_to: booking.email,
      subject: `New reservation ${booking.reference}: ${booking.origin.city} to ${booking.destination.city}`,
      text: [
        "New Hercules Movers reservation",
        "",
        `Reference: ${booking.reference}`,
        `Status: reserved`,
        `Needs review: ${booking.needsReview ? "yes" : "no"}`,
        "",
        "CUSTOMER",
        `${booking.firstName} ${booking.lastName}`,
        `Phone: ${booking.phone}`,
        `Email: ${booking.email}`,
        "",
        "MOVE",
        `From: ${formatAddr(booking.origin)}`,
        `To: ${formatAddr(booking.destination)}`,
        booking.distanceBandLabel
          ? `Distance: ${booking.distanceMiles} miles (customer selected ${booking.distanceBandLabel})`
          : `Distance: ${booking.distanceMiles} miles (estimated from locations)`,
        `Home size: ${booking.homeSizeLabel}`,
        `Move date: ${dateLabel}`,
        `Arrival window: ${booking.arrivalWindow}`,
        `Estimated time: ${booking.estimatedHours} hours`,
        `Estimated price: $${booking.estimatedPrice}`,
        `Final charges are governed by Terms and Conditions: ${termsUrl}`,
        "",
        "MOVE DETAILS",
        booking.originPropertyType ? `Origin property: ${booking.originPropertyType}` : "Origin property: not provided",
        booking.originAccess ? `Origin access: ${booking.originAccess}` : "Origin access: not provided",
        booking.destinationPropertyType ? `Destination property: ${booking.destinationPropertyType}` : "Destination property: not provided",
        booking.destinationAccess ? `Destination access: ${booking.destinationAccess}` : "Destination access: not provided",
        booking.specialtyItems?.length ? `Specialty items: ${booking.specialtyItems.join(", ")}` : "Specialty items: none",
        booking.notes ? `Notes: ${booking.notes}` : "Notes: none",
        "",
        "Customer agreed to Terms and Conditions."
      ].filter(Boolean).join("\n")
    })
  });
}

async function sendQuoSms(booking) {
  const key = Deno.env.get("QUO_API_KEY");
  const from = Deno.env.get("QUO_FROM");
  if (!key || !from) return;
  const dateLabel = formatNiceDate(booking.moveDate);
  const body = `Hi ${booking.firstName}, your move with Hercules Movers has been reserved for ${dateLabel}. Your reference number is ${booking.reference}. We'll contact you if we need any additional details.`;
  const endpoint = Deno.env.get("QUO_SMS_URL") || "https://api.openphone.com/v1/messages";
  await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [booking.phone],
      content: body
    })
  });
}

async function createCalendarEvent(supabase, bookingId, booking) {
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
  const sa = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!calendarId || !sa) return;
  try {
    const token = await googleAccessToken(JSON.parse(sa));
    const start = `${booking.moveDate}T08:00:00`;
    const end = `${booking.moveDate}T18:00:00`;
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          summary: `Hercules Move: ${booking.firstName} ${booking.lastName}, ${booking.origin.city} to ${booking.destination.city}`,
          description: [
            `Reference: ${booking.reference}`,
            `Customer: ${booking.firstName} ${booking.lastName}`,
            `Phone: ${booking.phone}`,
            `Email: ${booking.email}`,
            `Origin: ${formatAddr(booking.origin)}`,
            `Destination: ${formatAddr(booking.destination)}`,
            `Distance: ${booking.distanceMiles} miles`,
            `Home Size: ${booking.homeSizeLabel}`,
            `Estimated Time: ${booking.estimatedHours} Hours`,
            `Estimate: $${booking.estimatedPrice}`,
            `Arrival Window: ${booking.arrivalWindow}`,
            `Status: Reserved`,
            `Needs review: ${booking.needsReview ? "yes" : "no"}`,
            `Specialty items: ${(booking.specialtyItems || []).join(", ")}`,
            `Notes: ${booking.notes || ""}`
          ].join("\n"),
          start: { dateTime: start, timeZone: "America/New_York" },
          end: { dateTime: end, timeZone: "America/New_York" }
        })
      }
    );
    if (!res.ok) {
      console.error("Calendar create failed", await res.text());
      return;
    }
    const event = await res.json();
    if (event.id) {
      await supabase.from("bookings").update({ google_event_id: event.id }).eq("id", bookingId);
    }
  } catch (err) {
    console.error("Calendar sync failed", err);
  }
}

async function googleAccessToken(serviceAccount) {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const payload = btoa(JSON.stringify(claim)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const key = await importPkcs8(serviceAccount.private_key);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const jwt = `${header}.${payload}.${arrayToB64Url(sig)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error("No Google access token");
  return tokenJson.access_token;
}

async function importPkcs8(pem) {
  const b64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function arrayToB64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function formatAddr(addr) {
  return [addr.street, addr.unit, `${addr.city}, ${addr.state} ${addr.zip}`].filter(Boolean).join(", ");
}

function formatNiceDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}
