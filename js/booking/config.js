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
  phoneDisplay: "1 (754) 354-2008",
  phoneTel: "+17543542008",
  arrivalWindows: [
    "8:00 AM – 10:00 AM",
    "10:00 AM – 12:00 PM",
    "12:00 PM – 2:00 PM",
    "2:00 PM – 4:00 PM"
  ],
  originRequiredState: "FL",
  originOutsideFlMessage:
    "Hercules Movers currently accepts online reservations for moves originating in Florida.",
  notifyEmail: "herculesmoversfl@gmail.com",
  termsUrl: "https://herculesmovingfl.com/terms.html",
  longDistanceMiles: 50,
  homeSizes: [
    { value: 0, label: "Studio" },
    { value: 1, label: "1 Bedroom" },
    { value: 2, label: "2 Bedrooms" },
    { value: 3, label: "3 Bedrooms" },
    { value: 4, label: "4+ Bedrooms" }
  ]
};
