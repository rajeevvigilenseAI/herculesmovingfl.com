# Hercules booking setup

The website stays on GitHub Pages. Quotes and reservations run on Supabase Edge Functions. Never put private keys in this repo or in `js/booking/config.js`.

Estimates work with no backend at all. The price table and distance tables live in `js/booking/quote-core.js`, which ships with the page, so a visitor sees hours and price instantly. Supabase is only needed to *save* a reservation and send the confirmation email/SMS.

Until Supabase is configured, reservations fall back to being emailed to the office. See [Email-only fallback](#email-only-fallback-before-supabase-is-live) below. **Activate that inbox before relying on it.**

## 1. Create a Supabase project

1. Create a project at https://supabase.com
2. Run the files in `supabase/migrations/` in order (`001_bookings.sql`, then `002…`, `003…`) in the SQL editor
3. Confirm RLS is enabled and there are **no** public insert/select policies on `bookings`

## 2. Deploy functions

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy estimate
supabase functions deploy book
```

Set secrets in the Supabase dashboard (or `supabase secrets set`):

- `GOOGLE_CALENDAR_ID`: optional
- `GOOGLE_SERVICE_ACCOUNT_JSON`: optional; calendar is not required for a successful booking
- `QUO_API_KEY`, `QUO_FROM`, optional `QUO_SMS_URL`
- `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`, `BOOKING_REPLY_TO`, `NOTIFY_EMAIL`, optional `TERMS_URL`
- `ALLOWED_ORIGINS`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to functions.

Driving distance used for pricing is calculated with a static formula (straight-line distance between known city/ZIP/state coordinates, scaled by a fixed road-distance factor). There is no external distance API call and no server-side Google Maps key. This keeps quotes fast and free of Routes API billing, at the cost of some precision versus real driving distance (see caveat below).

The Edge Functions import `js/booking/quote-core.js` (via `_shared/pricing.js` and `_shared/distance.js`) so the browser and the server can't drift apart. If a `supabase functions deploy` ever fails to bundle that file because it sits outside `supabase/`, copy it to `supabase/functions/_shared/quote-core.js` and point both wrappers at the copy.

## 3. Google Maps

Only the **browser key** is needed now (for address suggestions in the wizard, not for pricing). Enable:

- Maps JavaScript API
- Places API (New): the frontend uses the current `PlaceAutocompleteElement` widget, not the legacy Places API/`Autocomplete` class

Create the key:

- **Browser key**: API restriction to Maps JavaScript API + Places API (New); HTTP referrer restricted to `https://herculesmovingfl.com/*` and `https://www.herculesmovingfl.com/*`. Put this only in `js/booking/config.js` as `googleMapsBrowserKey`.

If suggestions stop appearing, open the page on the affected device and read the browser console. Google reports the specific cause there (`RefererNotAllowedMapError` for a missing referrer entry, `ApiNotActivatedMapError` for a disabled API, `BillingNotEnabledMapError` for billing). Every referrer the site is reached by needs its own entry, including a bare `herculesmovingfl.com/*` and any staging host. The estimate still works without suggestions because the fields accept typed city, ZIP, or full address text.

## 4. Public frontend config

Edit `js/booking/config.js`:

```js
supabaseUrl: "https://YOUR_PROJECT.supabase.co",
supabaseAnonKey: "YOUR_ANON_KEY",
googleMapsBrowserKey: "YOUR_BROWSER_KEY",
```

The anon key must **not** be able to read or write `bookings`.

## 5. Email and SMS

Confirmation email is sent with Resend. Set `BOOKING_REPLY_TO` to a monitored Hercules inbox. The email tells customers to reply for changes or cancellation. There is no customer cancel link.

Every new reservation is also emailed in full to `herculesmoversfl@gmail.com` (override with `NOTIFY_EMAIL` if needed). That message includes addresses, date, arrival window, estimate, contact info, and move details.

Customers must agree to the Terms and Conditions before reserving. The full contract is shown in the booking modal and on `terms.html`. The Privacy Policy is at `privacy.html` and covers website data, SMS/call consent, and advertising cookies. The long-distance fuel/service charge caveat appears at the top of the terms.

The date step uses a visual calendar. It does not check crew or Google Calendar availability. The customer simply chooses a date and an arrival window.

Quo/OpenPhone SMS is sent after insert. A Quo failure does not roll back the booking.

## 6. Google Calendar (optional)

Create a dedicated calendar. Share it with the service account email. Overlapping events are allowed. If Calendar fails, the reservation still stands.

## 7. Deploy the website

Push to GitHub. GitHub Pages will publish `book-move.html`.

## 8. Test

```bash
npm test
```

Manual:

- Origin Atlanta, GA is rejected
- Miami, FL → New York, NY is allowed
- Past dates rejected
- Estimate appears before contact
- Refresh after confirmation does not create a second booking
- Specialty piano sets `needs_review` but still reserves

## Florida-origin / nationwide-destination note

The same 8-hour / $990 lookup cap applies to every automated quote, including long interstate jobs such as Miami to New York. Those reservations are allowed. They are not automatically flagged unless the customer selects a specialty item. Review long-distance jobs manually after the confirmation email arrives.

## Distance accuracy note

Distance is a static straight-line estimate (city/ZIP-prefix/state coordinates × a road-distance factor), not a real routed driving distance. It's resolved in this order: known city name (within the given state) → ZIP prefix → state center-point, which is always available as a last resort so a quote is always produced. Accuracy is good for the ~200 Florida cities and major destination metros in `CITY_COORDS`; it's rougher for small towns that fall back to a state-level center point.

To improve a route that quotes badly, add the city and its coordinates to `CITY_COORDS` in `js/booking/quote-core.js`. One edit fixes both the widget and the server. If pricing complaints become frequent, revisit the Google Routes API (real driving distance, paid server key); the swap is isolated to `drivingDistanceMiles()`.

## Email-only fallback (before Supabase is live)

While `supabaseUrl` in `js/booking/config.js` is empty, `api.book()` routes reservations to `js/booking/fallback.js`, which POSTs them to FormSubmit and they arrive as an email at `herculesmoversfl@gmail.com`. No account or API key is needed.

**One-time activation, do this before trusting it:** submit one test reservation from the site using an email address you can read. FormSubmit emails `herculesmoversfl@gmail.com` asking you to confirm the address. Click that link. Until you do, nothing else is delivered, the customer sees "We couldn't send your request just now. Please call…", and the real reason is logged to the browser console.

Then submit a second test and confirm **both** inboxes received it: the office copy and the customer CC. Check the spam folder for the customer copy.

After confirming, FormSubmit emails you a random string you can use in place of the plain address, e.g. `https://formsubmit.co/ajax/a1b2c3…`. Putting that in `fallbackFormEndpoint` keeps the inbox address out of the page source. Submissions are also retained for 30 days in FormSubmit's archive as a safety net if an email is ever missed.

### What the email looks like

FormSubmit sends one message per submission, so that message is written as the **customer's confirmation** and CC'd to them (`_cc`), while still carrying every field the office needs. The customer sees a greeting, their reference, date, arrival window, both locations, home size, estimated time and price, an "About This Estimate" paragraph (including the over-50-mile surcharge note when it applies), any special-handling items, and instructions to reply or call to change or cancel.

`_replyto` is set to the **office** address, not the customer's. Customers are told to reply to change or cancel, so replies have to land at Hercules. Pointing Reply-To at the customer would send their cancellation to their own inbox. The office replies using the address shown in "Your Contact Details" or via Reply All.

Two caveats on how it looks: the message is sent by FormSubmit, so the From address is theirs rather than a Hercules domain, and it may land in spam the first time. Its layout is FormSubmit's `box` template: clean and readable, but not custom-branded HTML. Only a real sending service (Resend, via Supabase) fixes the From address and gives full control of the design.

### What this path does not do, by design

- No database row: nothing to look up later beyond the email and the 30-day archive
- No SMS
- No duplicate protection: a customer who submits twice generates two emails
- References look like `FL-260811-K7Q` rather than the database's sequential `FL17369`, so a request without a saved reservation behind it is obvious at a glance

Set `fallbackFormEndpoint: ""` to turn it off and show a "call us" message instead. Once `supabaseUrl` is set, the fallback is bypassed entirely. It is never used as a retry if Supabase itself errors, since a reservation sitting in an inbox but not in the database is worse than asking the customer to try again.

## Customer-selected distance range

The estimate form has an optional **Distance** dropdown (under 50, 50 to 100, 100 to 150, 150 to 250, 250 to 500, and 500+ miles). Leaving it on "Calculate for me" uses the coordinate math above. Picking a range overrides it, and the range's **midpoint** becomes the priced mileage: a customer choosing 100 to 150 is priced at 125 miles rather than the worst case.

The Edge Functions validate the chosen range against `DISTANCE_BANDS` and reject anything else, so a tampered request can't invent its own mileage. The choice is saved to `bookings.distance_band`, and the internal notification email says whether the mileage was customer-selected or derived from the locations.
