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
  // Google Ads conversion tracking. The sitewide AW- tag lives in each page
  // <head>. Put the conversion label from the event snippet here (the part
  // after the slash in send_to, e.g. "AbCdEfGhIjKlMnOp") so a successful
  // reservation fires the Request quote conversion. Leave blank until you
  // have that label from Google Ads.
  googleAdsId: "AW-18375543247",
  googleAdsConversionLabel: "QlvXCJ_a8uMcEM-TkrpE",
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

// Fires the Google Ads "Request quote" conversion after a successful
// reservation. No-ops until googleAdsConversionLabel is set in config above.
window.HerculesBooking.trackConversion = function (result) {
  var cfg = window.HerculesBooking.config;
  if (!cfg || !cfg.googleAdsId || !cfg.googleAdsConversionLabel) return;
  if (typeof gtag !== "function") return;
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
