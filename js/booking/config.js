window.HerculesBooking = window.HerculesBooking || {};

window.HerculesBooking.config = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Used only while supabaseUrl is empty: reservations are emailed to the
  // office through FormSubmit instead of being saved. The very first
  // submission triggers a one-time activation email to the address below:
  // click the link in it or nothing else will arrive. Set this to "" to turn
  // the fallback off and show a "call us" message instead.
  fallbackFormEndpoint: "https://formsubmit.co/ajax/herculesmoversfl@gmail.com",
  // Browser key for Maps JavaScript API + Places API (New). Restrict this
  // key to your site's HTTP referrers in Google Cloud Console. See
  // docs/BOOKING-SETUP.md.
  googleMapsBrowserKey: "AIzaSyDVC28Xnuve_hVObx1ycVAwZVs8I7IjDdo",
  // Google Ads conversion tracking is off (Local Services Ads track leads
  // inside Google). To turn it back on, add the AW- tag to each page <head>
  // and fill in the account ID and the conversion label from Google Ads.
  googleAdsId: "",
  googleAdsConversionLabel: "",
  phoneDisplay: "1 (754) 354-2008",
  phoneTel: "+17543542008",
  arrivalWindows: [
    "8:00 AM - 10:00 AM",
    "10:00 AM - 12:00 PM",
    "12:00 PM - 2:00 PM",
    "2:00 PM - 4:00 PM"
  ],
  originRequiredState: "FL",
  originOutsideFlMessage:
    "Hercules Movers currently accepts online reservations for moves originating in Florida.",
  notifyEmail: "herculesmoversfl@gmail.com",
  termsUrl: "https://herculesmovingfl.com/terms.html",
  privacyUrl: "https://herculesmovingfl.com/privacy.html",
  moverRegistrationNo: "IM150012",
  usdotNumber: "8486147",
  moverRegistrationPhrase:
    "Hercules Local Movers is registered with the State of Florida as a Mover. Registration No. IM150012.",
  longDistanceMiles: 50,
  homeSizes: [
    { value: 0, label: "Studio" },
    { value: 1, label: "1 Bedroom" },
    { value: 2, label: "2 Bedrooms" },
    { value: 3, label: "3 Bedrooms" },
    { value: 4, label: "4+ Bedrooms" }
  ]
};

// Remembers where a visitor came from (UTM tags / ad click IDs on the landing
// URL) for the rest of the visit, so the office email can say which ad or
// channel produced the lead.
window.HerculesBooking.leadSource = (function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
  var src = {};
  try {
    var params = new URLSearchParams(window.location.search);
    KEYS.forEach(function (k) {
      if (params.get(k)) src[k] = params.get(k);
    });
    if (Object.keys(src).length) {
      sessionStorage.setItem("hq_src", JSON.stringify(src));
    } else {
      src = JSON.parse(sessionStorage.getItem("hq_src") || "{}") || {};
    }
  } catch (e) {
    src = src || {};
  }
  return function () {
    return src;
  };
})();

// Fires the Meta Pixel "Lead" (on pages that load the pixel), the GA4
// generate_lead event and, when configured, the Google Ads "Request quote"
// conversion after a successful reservation. Each one no-ops when its tag
// isn't on the page.
window.HerculesBooking.trackConversion = function (result) {
  var cfg = window.HerculesBooking.config;
  var reference = result && result.reference ? String(result.reference) : undefined;
  var value = result && result.estimatedPrice != null ? Number(result.estimatedPrice) || 0 : undefined;
  if (typeof fbq === "function") {
    var leadData = { currency: "USD", content_name: "Move reservation" };
    if (value != null) leadData.value = value;
    // eventID lets Meta de-duplicate this against a future server-side event.
    fbq("track", "Lead", leadData, reference ? { eventID: reference } : undefined);
  }
  if (typeof gtag !== "function") return;
  var lead = { form_name: "booking", currency: "USD" };
  if (value != null) lead.value = value;
  if (reference) lead.transaction_id = reference;
  gtag("event", "generate_lead", lead);
  if (!cfg || !cfg.googleAdsId || !cfg.googleAdsConversionLabel) return;
  var payload = {
    send_to: cfg.googleAdsId + "/" + cfg.googleAdsConversionLabel,
    currency: "USD"
  };
  if (result && result.estimatedPrice != null) {
    payload.value = Number(result.estimatedPrice) || 0;
  }
  if (result && result.reference) {
    payload.transaction_id = String(result.reference);
  }
  gtag("event", "conversion", payload);
};
