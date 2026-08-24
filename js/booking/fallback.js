window.HerculesBooking = window.HerculesBooking || {};

/**
 * Reservation path for when Supabase isn't deployed yet: the booking is emailed
 * through a form-forwarding service so a request is never silently lost.
 *
 * FormSubmit sends one message per submission, so that single message is
 * written as the customer's confirmation and CC'd to them, while still carrying
 * every operational field the office needs. Reply-To is the office, because the
 * customer is told to reply to change or cancel, and pointing it at the customer
 * would send their cancellation to their own inbox.
 *
 * There is no database row and no SMS. Once Supabase is live, set
 * config.supabaseUrl and this file stops being used.
 */
(function () {
  "use strict";

  window.HerculesBooking.fallbackBook = function (payload) {
    var cfg = window.HerculesBooking.config;
    var endpoint = cfg && cfg.fallbackFormEndpoint;
    if (!endpoint) {
      return Promise.reject(
        new Error(
          "Online reservations aren't switched on yet. Please call Hercules Movers at " +
            ((cfg && cfg.phoneDisplay) || "1 (754) 354-2008") +
            " to lock in this estimate."
        )
      );
    }

    var reference = buildReference();
    var quote = safeQuote(payload);

    var fields = buildEmailFields(payload, quote, reference, cfg);
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(fields)
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (res.ok && !(data && data.success === "false")) {
              return buildFallbackResult(payload, quote, reference);
            }
            // Some providers reject AJAX but still accept classic form posts.
            // Retry once using a non-AJAX endpoint before showing failure.
            return postOpaqueForm(endpoint, fields)
              .then(function () {
                return buildFallbackResult(payload, quote, reference);
              })
              .catch(function () {
                console.error("Reservation email was not sent:", (data && data.message) || res.status);
                throw new Error(
                  "We couldn't send your request just now. Please call Hercules Movers at " +
                    ((cfg && cfg.phoneDisplay) || "1 (754) 354-2008") +
                    " and we'll reserve this for you."
                );
              });
          });
      })
      .catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error(
            "Unable to reach us over the internet. Please call Hercules Movers at " +
              ((cfg && cfg.phoneDisplay) || "1 (754) 354-2008") +
              "."
          );
        }
        throw err;
      });
  };

  function buildFallbackResult(payload, quote, reference) {
    return {
      viaFallback: true,
      reference: reference,
      moveDate: payload.moveDate,
      arrivalWindow: payload.arrivalWindow,
      estimatedHours: quote.estimatedHours,
      estimatedPrice: quote.estimatedPrice,
      needsReview: needsReview(payload.specialtyItems),
      status: "reserved"
    };
  }

  function postOpaqueForm(endpoint, fields) {
    var fallbackEndpoint = String(endpoint || "").replace("/ajax/", "/");
    var body = new URLSearchParams();
    Object.keys(fields || {}).forEach(function (key) {
      if (fields[key] != null) body.append(key, String(fields[key]));
    });
    return fetch(fallbackEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString()
    });
  }

  /**
   * FormSubmit renders whatever fields it is given, in order, as the email
   * body, so the field order and wording below *is* the email the customer
   * reads. Optional fields are omitted rather than sent as "not provided", so
   * a customer never receives a form with blanks in it.
   */
  function buildEmailFields(payload, quote, reference, cfg) {
    var phone = (cfg && cfg.phoneDisplay) || "1 (754) 354-2008";
    var office = (cfg && cfg.notifyEmail) || "herculesmoversfl@gmail.com";
    var firstName = trim(payload.firstName);
    var customerPhone = formatPhone(payload.phone);

    var fields = {
      _subject:
        "Your Hercules Movers move request: " + routeLabel(payload) + " (" + reference + ")",
      _template: "box",
      // The customer gets this same message as a copy.
      _cc: trim(payload.email),
      // Customers are told to reply to change or cancel, so replies must reach
      // the office rather than bouncing back to the customer.
      _replyto: office,
      // reCAPTCHA can't be presented over AJAX, so it has to be off here.
      _captcha: "false"
    };

    fields[firstName ? "Hi " + firstName : "Hello"] =
      "Thanks for choosing Hercules Movers. We have your move request and a member of our team " +
      "will call you" +
      (customerPhone ? " at " + customerPhone : "") +
      " shortly to confirm everything below and lock in your crew.";

    fields["Your Reference"] = reference;
    add(fields, "Move Date", niceDate(payload.moveDate));
    add(fields, "Arrival Window", trim(payload.arrivalWindow));
    add(fields, "Moving From", formatAddress(payload.origin));
    add(fields, "Moving To", formatAddress(payload.destination));
    add(fields, "Home Size", quote.homeSizeLabel);
    add(fields, "Estimated Time", quote.estimatedHours ? quote.estimatedHours + " hours" : "");
    add(fields, "Estimated Price", quote.estimatedPrice ? "$" + quote.estimatedPrice : "");
    add(fields, "About This Estimate", estimateNote(payload, quote));

    if (needsReview(payload.specialtyItems)) {
      fields["Special Handling"] =
        specialtyLabels(payload.specialtyItems) +
        ". Our team will review this personally before your move is finalized.";
    } else {
      add(fields, "Items To Note", specialtyLabels(payload.specialtyItems));
    }

    add(fields, "Pickup Property", trim(payload.originPropertyType));
    add(fields, "Pickup Access", trim(payload.originAccess));
    add(fields, "Delivery Property", trim(payload.destinationPropertyType));
    add(fields, "Delivery Access", trim(payload.destinationAccess));
    add(fields, "Your Notes", trim(payload.notes));

    fields["To Change Or Cancel"] =
      "Reply to this email or call us at " + phone + ". Please have reference " + reference + " handy.";

    fields["Your Contact Details"] =
      [trim(payload.firstName) + " " + trim(payload.lastName), customerPhone, trim(payload.email)]
        .filter(Boolean)
        .join(" · ");

    if (payload.acceptedTerms) {
      fields["Terms"] =
        "You accepted the Hercules Movers Terms and Conditions on " + niceTimestamp() + ".";
    }

    fields["Florida Registration"] =
      "Hercules Local Movers is registered with the State of Florida as a Mover. Registration No. IM150012. Fla. Mover Reg. No. IM150012. A written estimate and contract must be signed and dated by both you and Hercules Movers before any moving services are provided.";

    return fields;
  }

  function add(fields, label, value) {
    if (value) fields[label] = value;
  }

  function estimateNote(payload, quote) {
    if (!quote.distanceMiles) return "";
    var core = window.HerculesQuoteCore;
    var band = core && payload.distanceBand ? core.bandLabel(payload.distanceBand) : "";
    var note = "This is an estimate, not a final invoice.";
    if (band) note += " Distance range selected: " + band + ".";
    else note += " Based on about " + Math.round(quote.distanceMiles) + " miles between your two locations.";
    var cfg = window.HerculesBooking && window.HerculesBooking.config;
    var termsUrl = (cfg && cfg.termsUrl) || "https://herculesmovingfl.com/terms.html";
    var privacyUrl = (cfg && cfg.privacyUrl) || "https://herculesmovingfl.com/privacy.html";
    note +=
      " Hercules Local Movers is registered with the State of Florida as a Mover. Registration No. IM150012." +
      " Final charges are governed by our Terms and Conditions: " +
      termsUrl +
      ". Privacy Policy: " +
      privacyUrl +
      ".";
    if (Number(quote.estimatedHours) >= 8) {
      note +=
        " This quote covers the first 8 hours. If the move runs longer, additional time is billed hourly. " +
        "Please contact Hercules Movers for a full long-distance quote.";
    }
    return note;
  }

  function specialtyLabels(items) {
    var labels = {
      piano: "Piano",
      safe: "Safe",
      pool_table: "Pool table",
      oversized_furniture: "Oversized furniture",
      packing_needed: "Packing service",
      storage_stop: "Storage stop",
      additional_stop: "Additional stop",
      tv_over_75: 'TV over 75"',
      appliances: "Appliances",
      other_specialty: "Other special item"
    };
    return (items || [])
      .map(function (item) {
        return labels[item] || item;
      })
      .join(", ");
  }

  /**
   * Deliberately unlike the database's sequential FL17369 references so the
   * office can tell at a glance that a request came in without a saved
   * reservation behind it.
   */
  function buildReference() {
    var now = new Date();
    var stamp =
      String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate());
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var suffix = "";
    for (var i = 0; i < 3; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return "FL-" + stamp + "-" + suffix;
  }

  /** Recomputed here so the emailed price can't be edited by the client. */
  function safeQuote(payload) {
    var core = window.HerculesQuoteCore;
    if (!core) return {};
    try {
      return core.quote(
        payload.origin,
        payload.destination,
        payload.homeSize,
        payload.distanceBand
      );
    } catch (err) {
      return {};
    }
  }

  function needsReview(items) {
    var core = window.HerculesQuoteCore;
    return core ? core.shouldFlagNeedsReview(items) : false;
  }

  function routeLabel(payload) {
    return placeLabel(payload.origin) + " to " + placeLabel(payload.destination);
  }

  function placeLabel(addr) {
    addr = addr || {};
    return trim(addr.city) || trim(addr.zip) || trim(addr.state);
  }

  function formatAddress(addr) {
    addr = addr || {};
    var parts = [];
    if (addr.street) parts.push(trim(addr.street));
    if (addr.unit) parts.push("Unit " + trim(addr.unit));
    if (addr.city) parts.push(trim(addr.city));
    var tail = [trim(addr.state), trim(addr.zip)].filter(Boolean).join(" ");
    if (tail) parts.push(tail);
    return parts.join(", ");
  }

  function trim(value) {
    return String(value == null ? "" : value).trim();
  }

  function niceDate(ymd) {
    var parts = trim(ymd).split("-");
    if (parts.length !== 3) return trim(ymd);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
  }

  function niceTimestamp() {
    return new Date().toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }

  function formatPhone(value) {
    var digits = trim(value).replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    if (digits.length !== 10) return trim(value);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }
})();
