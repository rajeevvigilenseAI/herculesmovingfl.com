(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var cfg = window.HerculesBooking && window.HerculesBooking.config;
    var api = window.HerculesBooking && window.HerculesBooking.api;

    var stepQuote = document.getElementById("hq-step-quote");
    if (!stepQuote || !cfg || !api) return;

    var stepSchedule = document.getElementById("hq-step-schedule");
    var stepContact = document.getElementById("hq-step-contact");
    var stepDone = document.getElementById("hq-step-done");

    var termsBody = document.getElementById("terms-body");
    if (termsBody && window.HerculesBooking.termsHtml) {
      termsBody.innerHTML = window.HerculesBooking.termsHtml;
    }
    setTermsLinks();
    bindTermsModal();

    var core = window.HerculesQuoteCore;

    var dateInput = document.getElementById("hqMoveDate2");
    if (dateInput) dateInput.min = todayYmd();

    fillWindows();
    fillHomeSizes();
    fillDistanceBands();
    bindDistanceSync();

    if (cfg.googleMapsBrowserKey) {
      loadPlaces(cfg.googleMapsBrowserKey);
    }
    if (isMobileView()) {
      setTimeout(function () {
        var overlay = document.querySelector(".hero-quote-overlay");
        if (overlay) overlay.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }

    var pending = {
      origin: null,
      destination: null,
      homeSize: null,
      distanceBand: "",
      moveDate: "",
      arrivalWindow: ""
    };

    stepQuote.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError("hq-error-quote");

      var originRaw = val("hqOriginCity");
      var originState = val("hqOriginState").toUpperCase();
      var destRaw = val("hqDestCity");
      var destState = val("hqDestState").toUpperCase();
      var homeSize = val("hqHomeSize");

      if (!originRaw || !originState || !destRaw || !destState || homeSize === "") {
        fail("hq-error-quote", "Please complete every field to see your estimate.");
        return;
      }
      if (originState !== (cfg.originRequiredState || "FL")) {
        fail(
          "hq-error-quote",
          cfg.originOutsideFlMessage ||
            "Hercules Movers currently accepts online reservations for moves originating in Florida."
        );
        return;
      }
      if (!isUsState(destState)) {
        fail("hq-error-quote", "Destination must be a valid U.S. state.");
        return;
      }

      var origin = addressFromInput(originRaw, originState);
      var destination = addressFromInput(destRaw, destState);
      var band = val("hqDistanceBand");
      var btn = stepQuote.querySelector(".hq-submit");
      setBusy(btn, true, "Calculating...");

      getQuote({
        origin: origin,
        destination: destination,
        homeSize: Number(homeSize),
        distanceBand: band
      })
        .then(function (quote) {
          pending.origin = quote.origin || origin;
          pending.destination = quote.destination || destination;
          pending.homeSize = Number(homeSize);
          pending.distanceBand = band;
          renderEstimate(quote);
          showStep(stepSchedule);
        })
        .catch(function (err) {
          fail("hq-error-quote", err.message);
        })
        .then(function () {
          setBusy(btn, false, '<i class="fas fa-truck-moving"></i> Get My Free Estimate');
        });
    });

    /**
     * The price table and the distance tables are bundled with the page, so the
     * estimate is computed locally and instantly, with no backend needed to see a
     * number. The Edge Function recalculates it from the same shared module
     * when the reservation is written, so the backend stays authoritative.
     */
    function getQuote(payload) {
      if (core) {
        try {
          var quote = core.quote(
            payload.origin,
            payload.destination,
            payload.homeSize,
            payload.distanceBand
          );
          quote.origin = payload.origin;
          quote.destination = payload.destination;
          return Promise.resolve(quote);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      return api.estimate(payload);
    }

    onClick("hq-back-quote", function () {
      showStep(stepQuote);
    });

    onClick("hq-to-contact", function () {
      clearError("hq-error-schedule");
      var moveDate = val("hqMoveDate2");
      var win = document.querySelector('input[name="hqArrivalWindow"]:checked');
      if (!moveDate) {
        fail("hq-error-schedule", "Please choose a move date.");
        return;
      }
      if (moveDate < todayYmd()) {
        fail("hq-error-schedule", "Please choose a date that is not in the past.");
        return;
      }
      if (!win) {
        fail("hq-error-schedule", "Please choose an arrival window.");
        return;
      }
      pending.moveDate = moveDate;
      pending.arrivalWindow = win.value;
      showStep(stepContact);
    });

    onClick("hq-back-schedule", function () {
      showStep(stepSchedule);
    });

    onClick("hq-confirm", function (btn) {
      clearError("hq-error-contact");
      if (val("hqWebsite")) return; // honeypot: silently drop

      var firstName = val("hqFirstName");
      var lastName = val("hqLastName");
      var phone = val("hqPhone");
      var email = val("hqEmail");

      if (!firstName || !lastName) {
        fail("hq-error-contact", "First and last name are required.");
        return;
      }
      if (!isEmail(email)) {
        fail("hq-error-contact", "Please enter a valid email address.");
        return;
      }
      if (!isPhone(phone)) {
        fail("hq-error-contact", "Please enter a valid US mobile phone number.");
        return;
      }
      setBusy(btn, true, "Reserving...");

      api
        .book({
          idempotencyKey: uuid(),
          origin: pending.origin,
          destination: pending.destination,
          homeSize: pending.homeSize,
          distanceBand: pending.distanceBand,
          moveDate: pending.moveDate,
          arrivalWindow: pending.arrivalWindow,
          firstName: firstName,
          lastName: lastName,
          phone: phone,
          email: email,
          originPropertyType: "",
          originAccess: "",
          destinationPropertyType: "",
          destinationAccess: "",
          specialtyItems: [],
          notes: "",
          acceptedTerms: true,
          website: val("hqWebsite")
        })
        .then(function (result) {
          renderConfirmation(result);
          showStep(stepDone);
        })
        .catch(function (err) {
          fail("hq-error-contact", err.message);
        })
        .then(function () {
          setBusy(btn, false, '<i class="fas fa-check"></i> Confirm Appointment');
        });
    });

    function renderEstimate(quote) {
      var route = locLabel(quote.origin) + " \u2192 " + locLabel(quote.destination);
      // A selected range is shown as the range itself; inventing "about 600
      // miles" for an open-ended "500+ miles" choice would be misleading.
      var bandText = core && quote.distanceBand ? core.bandLabel(quote.distanceBand) : "";
      if (bandText) {
        route += " \u00b7 " + bandText;
      } else if (quote.distanceMiles) {
        route += " \u00b7 about " + Math.round(quote.distanceMiles) + " miles";
      }
      setText("hq-result-route", route);
      setText("hq-result-hours", quote.estimatedHours + " Hrs");
      setText("hq-result-price", "$" + quote.estimatedPrice);
      var capNote = document.getElementById("hq-cap-note");
      if (capNote) capNote.hidden = !(Number(quote.estimatedHours) >= 8);
    }

    function renderConfirmation(result) {
      setText("hq-confirm-ref", "Reference: " + result.reference);
      setText("hq-confirm-date", niceDate(result.moveDate));
      setText("hq-confirm-window", result.arrivalWindow);
      setText("hq-confirm-hours", result.estimatedHours + " Hrs");
      setText("hq-confirm-price", "$" + result.estimatedPrice);
      var reviewNote = document.getElementById("hq-confirm-review");
      if (reviewNote) reviewNote.hidden = !result.needsReview;

      // The fallback path emails the office but sends the customer nothing, so
      // promise a callback instead of an email that will never arrive.
      var emailNote = document.getElementById("hq-confirm-email");
      var callbackNote = document.getElementById("hq-confirm-callback");
      if (emailNote) emailNote.hidden = !!result.viaFallback;
      if (callbackNote) callbackNote.hidden = !result.viaFallback;
    }

    function fillHomeSizes() {
      var select = document.getElementById("hqHomeSize");
      if (!select || !core || select.options.length > 1) return;
      core.HOME_SIZE_ORDER.forEach(function (size) {
        var option = document.createElement("option");
        option.value = String(size);
        option.textContent = core.HOME_SIZE_LABELS[size];
        select.appendChild(option);
      });
    }

    function fillDistanceBands() {
      var select = document.getElementById("hqDistanceBand");
      if (!select || !core || select.options.length) return;
      core.DISTANCE_BANDS.forEach(function (band) {
        var option = document.createElement("option");
        option.value = band.key;
        option.textContent = band.label;
        select.appendChild(option);
      });
      var exact = document.createElement("option");
      exact.value = "";
      exact.textContent = "Calculate from my locations";
      select.appendChild(exact);
      select.value = core.DISTANCE_BANDS[0].key;

      // Once the customer picks a range themselves, stop correcting it.
      select.addEventListener("change", function () {
        select.dataset.userChosen = "1";
      });
    }

    function bindDistanceSync() {
      ["hqOriginCity", "hqOriginState", "hqDestCity", "hqDestState"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", syncDistanceBand);
        el.addEventListener("blur", syncDistanceBand);
      });
    }

    /**
     * Keeps the distance dropdown honest: the default is the local range, but
     * as soon as the two locations imply a longer trip the dropdown moves up to
     * match, so a Miami-to-Seattle move can't stay priced as a local one. A
     * customer who sets the range themselves is left alone.
     */
    function syncDistanceBand() {
      var select = document.getElementById("hqDistanceBand");
      if (!select || !core || select.dataset.userChosen) return;

      var originState = val("hqOriginState").toUpperCase();
      var destState = val("hqDestState").toUpperCase();
      var originRaw = val("hqOriginCity");
      var destRaw = val("hqDestCity");
      if (!originRaw || !originState || !destRaw || !destState) return;

      try {
        var miles = core.estimateMiles(
          addressFromInput(originRaw, originState),
          addressFromInput(destRaw, destState)
        );
        var band = core.bandForMiles(miles);
        if (band) select.value = band;
      } catch (err) {
        /* Not enough information to place the move yet; leave the default. */
      }
    }

    function fillWindows() {
      var wrap = document.getElementById("hq-window-grid");
      if (!wrap || !cfg.arrivalWindows || wrap.childElementCount) return;
      cfg.arrivalWindows.forEach(function (label, i) {
        var id = "hqWin" + i;
        wrap.insertAdjacentHTML(
          "beforeend",
          '<label><input type="radio" name="hqArrivalWindow" value="' +
            escapeHtml(label) +
            '" id="' +
            id +
            '"> ' +
            escapeHtml(label) +
            "</label>"
        );
      });
      wrap.addEventListener("change", function () {
        Array.prototype.forEach.call(wrap.querySelectorAll("label"), function (l) {
          var input = l.querySelector("input");
          l.classList.toggle("checked", !!(input && input.checked));
        });
      });
    }

    function showStep(target) {
      [stepQuote, stepSchedule, stepContact, stepDone].forEach(function (el) {
        if (el) el.classList.remove("active");
      });
      if (target) target.classList.add("active");
      var card = document.querySelector(".hero-quote-card");
      if (card) card.scrollTop = 0;
      if (isMobileView()) {
        var overlay = document.querySelector(".hero-quote-overlay");
        if (overlay) overlay.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    function bindTermsModal() {
      var modal = document.getElementById("terms-modal");
      if (!modal) return;
      Array.prototype.forEach.call(document.querySelectorAll("[data-open-terms]"), function (btn) {
        btn.addEventListener("click", function () {
          modal.hidden = false;
          document.body.style.overflow = "hidden";
        });
      });
      var closeBtn = document.getElementById("terms-close");
      if (closeBtn) closeBtn.addEventListener("click", closeModal);
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !modal.hidden) closeModal();
      });
      function closeModal() {
        modal.hidden = true;
        document.body.style.overflow = "";
      }
    }

    function setTermsLinks() {
      var termsUrl = (cfg && cfg.termsUrl) || "terms.html";
      Array.prototype.forEach.call(document.querySelectorAll(".terms-full-link a"), function (link) {
        link.href = termsUrl;
      });
    }

    function loadPlaces(key) {
      if (!window.HerculesBooking.ensureMaps) return;
      window.HerculesBooking.ensureMaps(key);
      google.maps
        .importLibrary("places")
        .then(function (lib) {
          if (isMobileView()) {
            // iOS privacy/content settings can block parts of the Places widget.
            // Prefer legacy autocomplete on phones; if unavailable, keep plain
            // text inputs so booking still works without Google suggestions.
            if (lib.Autocomplete) {
              attachLegacyAutocomplete(lib.Autocomplete, "hqOriginCity", "hqOriginState");
              attachLegacyAutocomplete(lib.Autocomplete, "hqDestCity", "hqDestState");
            }
            return;
          }
          attachPlaces(lib.PlaceAutocompleteElement, "hqOriginCity", "hqOriginState");
          attachPlaces(lib.PlaceAutocompleteElement, "hqDestCity", "hqDestState");
        })
        .catch(function (err) {
          console.error("Google Places failed to load", err);
        });
    }

    function attachLegacyAutocomplete(Autocomplete, inputId, stateInputId) {
      var input = document.getElementById(inputId);
      if (!input || input.dataset.placesBound) return;
      input.dataset.placesBound = "1";

      var ac = new Autocomplete(input, {
        componentRestrictions: { country: ["us"] },
        fields: ["address_components", "formatted_address"]
      });
      ac.addListener("place_changed", function () {
        var place = ac.getPlace();
        if (!place || !place.address_components) return;
        applyLegacyPlace(place, input, stateInputId);
      });
      input.addEventListener("input", syncDistanceBand);
    }

    function attachPlaces(PlaceAutocompleteElement, inputId, stateInputId) {
      var input = document.getElementById(inputId);
      if (!input || input.dataset.placesBound) return;
      input.dataset.placesBound = "1";

      var widget = new PlaceAutocompleteElement({ includedRegionCodes: ["us"] });
      widget.classList.add("hq-place-autocomplete");
      // The widget can't be given a starting value, so a prefilled default
      // (Miami) is shown as its placeholder, so leaving the field untouched still
      // submits that default, which is what the placeholder now advertises.
      if (input.value) widget.placeholder = input.value;
      else if (input.placeholder) widget.placeholder = input.placeholder;

      input.insertAdjacentElement("afterend", widget);
      input.classList.add("hq-field-fallback");

      widget.addEventListener("gmp-select", function (evt) {
        applyPlace(evt, input, stateInputId);
      });

      // Typing without picking a suggestion still has to count: mirror the
      // text into the hidden input so a stale default can't be submitted.
      widget.addEventListener("input", function (evt) {
        var inner = evt.composedPath ? evt.composedPath()[0] : null;
        if (!inner || typeof inner.value !== "string") return;
        input.value = inner.value;
        syncDistanceBand();
      });
    }

    function applyPlace(evt, input, stateInputId) {
      var prediction = evt && evt.placePrediction;
      if (!prediction) return;
      var place = prediction.toPlace();
      place
        .fetchFields({ fields: ["addressComponents", "formattedAddress"] })
        .then(function () {
          var components = place.addressComponents || [];
          var city = "";
          var state = "";
          var hasStreet = false;
          components.forEach(function (c) {
            var types = c.types || [];
            if (types.indexOf("locality") >= 0) city = c.longText;
            if (!city && types.indexOf("sublocality") >= 0) city = c.longText;
            if (!city && types.indexOf("postal_town") >= 0) city = c.longText;
            if (types.indexOf("administrative_area_level_1") >= 0) state = c.shortText;
            if (types.indexOf("street_number") >= 0 || types.indexOf("route") >= 0) hasStreet = true;
          });
          input.value = hasStreet ? place.formattedAddress || city || input.value : city || place.formattedAddress || input.value;
          if (state) {
            var stateInput = document.getElementById(stateInputId);
            if (stateInput) stateInput.value = state;
          }
          syncDistanceBand();
        })
        .catch(function (err) {
          console.error("Unable to read selected place", err);
        });
    }

    function applyLegacyPlace(place, input, stateInputId) {
      var components = place.address_components || [];
      var city = "";
      var state = "";
      var hasStreet = false;
      components.forEach(function (c) {
        var types = c.types || [];
        if (types.indexOf("locality") >= 0) city = c.long_name;
        if (!city && types.indexOf("sublocality") >= 0) city = c.long_name;
        if (!city && types.indexOf("postal_town") >= 0) city = c.long_name;
        if (types.indexOf("administrative_area_level_1") >= 0) state = c.short_name;
        if (types.indexOf("street_number") >= 0 || types.indexOf("route") >= 0) hasStreet = true;
      });
      input.value = hasStreet
        ? place.formatted_address || city || input.value
        : city || place.formatted_address || input.value;
      if (state) {
        var stateInput = document.getElementById(stateInputId);
        if (stateInput) stateInput.value = state;
      }
      syncDistanceBand();
    }
  });

  function locLabel(addr) {
    addr = addr || {};
    if (addr.city) return addr.city + ", " + addr.state;
    if (addr.zip) return addr.zip + ", " + addr.state;
    return addr.state || "";
  }

  /**
   * One field accepts "Miami", "33131", "Miami, FL 33131, USA" or a full
   * Google Places address, so split whatever arrived into street/city/ZIP.
   */
  function addressFromInput(raw, state) {
    var text = String(raw || "").trim();
    var zipMatch = /\b(\d{5})(?:-\d{4})?\b/.exec(text);
    var zip = zipMatch ? zipMatch[1] : "";

    var segments = [];
    text.split(",").forEach(function (part) {
      var piece = part.trim();
      if (!piece) return;
      if (/^(usa|us|united states)$/i.test(piece)) return;
      if (/^\d{5}(-\d{4})?$/.test(piece)) return;
      if (/^[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(piece)) return;
      if (/^[A-Za-z]{2}$/.test(piece) && piece.toUpperCase() === state) return;
      segments.push(piece);
    });

    var street = "";
    var city = "";
    if (segments.length > 1) {
      street = segments.slice(0, segments.length - 1).join(", ");
      city = segments[segments.length - 1];
    } else if (segments.length === 1) {
      city = segments[0];
    }
    if (!street && /^\d+\s/.test(city)) {
      street = city;
      city = "";
    }

    return { street: street, unit: "", city: city, state: state, zip: zip };
  }

  function onClick(id, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function () { handler(el); });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function fail(boxId, msg) {
    var box = document.getElementById(boxId);
    if (box) {
      box.textContent = msg;
      box.classList.add("show");
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearError(boxId) {
    var box = document.getElementById(boxId);
    if (box) {
      box.textContent = "";
      box.classList.remove("show");
    }
  }

  function setBusy(btn, busy, html) {
    if (!btn) return;
    btn.disabled = busy;
    btn.innerHTML = html;
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function todayYmd() {
    var ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return ny.getFullYear() + "-" + pad(ny.getMonth() + 1) + "-" + pad(ny.getDate());
  }

  function niceDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
  }

  function isPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    return d.length === 10 || (d.length === 11 && d.charAt(0) === "1");
  }

  function isUsState(st) {
    return (
      "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC"
        .split(" ")
        .indexOf(st) >= 0
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function isMobileView() {
    return window.matchMedia && window.matchMedia("(max-width: 1024px)").matches;
  }
})();
