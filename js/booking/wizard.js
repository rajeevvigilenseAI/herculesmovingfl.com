(function () {
  var cfg = window.HerculesBooking.config;
  var api = window.HerculesBooking.api;
  var core = window.HerculesQuoteCore;
  var state = loadState() || defaultState();
  var current = state.step || 0;
  var steps = ["from", "to", "home", "date", "estimate", "window", "contact", "details", "review", "confirm"];
  var progressMap = {
    from: "Move",
    to: "Move",
    home: "Home",
    date: "Estimate",
    estimate: "Estimate",
    window: "Schedule",
    contact: "Contact",
    details: "Contact",
    review: "Confirm",
    confirm: "Confirm"
  };

  var calView = monthFromYmd(state.moveDate) || monthFromYmd(todayYmd());

  document.addEventListener("DOMContentLoaded", function () {
    if (window.HerculesBooking.termsHtml && qs("#terms-body")) {
      qs("#terms-body").innerHTML = window.HerculesBooking.termsHtml;
    }
    setTermsLinks();
    fillWindows();
    fillDistanceBands();
    bind();
    if (state.confirmation) {
      showConfirmation(state.confirmation);
      goTo("confirm");
    } else {
      restoreFields();
      goTo(steps[current] || "from");
    }
    if (cfg.googleMapsBrowserKey) {
      loadPlaces();
    }
  });

  function defaultState() {
    return {
      step: 0,
      origin: {},
      destination: {},
      homeSize: null,
      distanceBand: "",
      moveDate: "",
      quote: null,
      arrivalWindow: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      originPropertyType: "",
      originAccess: "",
      destinationPropertyType: "",
      destinationAccess: "",
      specialtyItems: [],
      notes: "",
      idempotencyKey: uuid()
    };
  }

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem("herculesBooking") || "null");
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    sessionStorage.setItem("herculesBooking", JSON.stringify(state));
  }

  function bind() {
    qsa("[data-next]").forEach(function (btn) {
      btn.addEventListener("click", function () { next(); });
    });
    qsa("[data-back]").forEach(function (btn) {
      btn.addEventListener("click", function () { back(); });
    });
    qs("#book-reserve").addEventListener("click", reserve);
    qsa("input[name=homeSize]").forEach(function (el) {
      el.addEventListener("change", function () {
        state.homeSize = Number(el.value);
        saveState();
      });
    });
    qs("#cal-prev").addEventListener("click", function () {
      calView = shiftMonth(calView, -1);
      renderCalendar();
    });
    qs("#cal-next").addEventListener("click", function () {
      calView = shiftMonth(calView, 1);
      renderCalendar();
    });
    qsa("[data-open-terms]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        openTerms();
      });
    });
    qs("#terms-close").addEventListener("click", closeTerms);
    qs("#terms-modal").addEventListener("click", function (e) {
      if (e.target.id === "terms-modal") closeTerms();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeTerms();
    });
  }

  function fillWindows() {
    var wrap = qs("#window-options");
    cfg.arrivalWindows.forEach(function (label, i) {
      var id = "win-" + i;
      wrap.insertAdjacentHTML("beforeend",
        '<label><input type="radio" name="arrivalWindow" value="' + escapeHtml(label) + '" id="' + id + '"> ' + escapeHtml(label) + "</label>");
    });
  }

  function next() {
    clearError();
    if (!validateCurrent()) return;
    collectCurrent();
    if (steps[current] === "date") {
      requestEstimate();
      return;
    }
    current += 1;
    state.step = current;
    saveState();
    goTo(steps[current]);
    if (steps[current] === "review") renderReview();
  }

  function back() {
    clearError();
    collectCurrent();
    if (current > 0) current -= 1;
    state.step = current;
    saveState();
    goTo(steps[current]);
  }

  function goTo(id) {
    qsa(".book-step").forEach(function (el) { el.classList.remove("active"); });
    var panel = qs("#step-" + id);
    if (panel) panel.classList.add("active");
    current = steps.indexOf(id);
    updateProgress(id);
    if (id === "date") renderCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateProgress(id) {
    var activeLabel = progressMap[id];
    qsa(".book-progress span").forEach(function (el) {
      el.classList.remove("active", "done");
      if (el.getAttribute("data-progress") === activeLabel) el.classList.add("active");
    });
  }

  function validateCurrent() {
    var id = steps[current];
    if (id === "from") return validateAddress("origin", true);
    if (id === "to") return validateAddress("destination", false);
    if (id === "home") {
      var selected = qs("input[name=homeSize]:checked");
      if (!selected) return fail("Please choose your home size.");
      return true;
    }
    if (id === "date") {
      var date = qs("#moveDate").value;
      if (!date) return fail("Please choose a move date.");
      var today = new Date();
      var ny = new Date(today.toLocaleString("en-US", { timeZone: "America/New_York" }));
      var ymd = ny.getFullYear() + "-" + pad(ny.getMonth() + 1) + "-" + pad(ny.getDate());
      if (date < ymd) return fail("Please choose a date that is not in the past.");
      return true;
    }
    if (id === "window") {
      if (!qs("input[name=arrivalWindow]:checked")) return fail("Please choose an arrival window.");
      return true;
    }
    if (id === "contact") {
      if (!qs("#firstName").value.trim() || !qs("#lastName").value.trim()) return fail("First and last name are required.");
      if (!isEmail(qs("#email").value)) return fail("Please enter a valid email address.");
      if (!isPhone(qs("#phone").value)) return fail("Please enter a valid US mobile phone number.");
      return true;
    }
    if (id === "review") {
      if (!qs("#confirmAccurate").checked) return fail("Please confirm that the information provided is accurate.");
      return true;
    }
    return true;
  }

  function validateAddress(which, requireFl) {
    var street = qs("#" + which + "Street").value.trim();
    var city = qs("#" + which + "City").value.trim();
    var st = qs("#" + which + "State").value.trim().toUpperCase();
    var zip = qs("#" + which + "Zip").value.trim();
    if (!street || !city || !st || !zip) return fail("Please enter a complete address.");
    if (!/^\d{5}(-\d{4})?$/.test(zip)) return fail("Please enter a valid ZIP code.");
    if (requireFl && st !== "FL") return fail(cfg.originOutsideFlMessage);
    if (!requireFl && !isUsState(st)) return fail("Destination must be a valid U.S. address.");
    return true;
  }

  function collectCurrent() {
    state.origin = readAddress("origin");
    state.destination = readAddress("destination");
    var home = qs("input[name=homeSize]:checked");
    if (home) state.homeSize = Number(home.value);
    state.distanceBand = val("#distanceBand");
    state.moveDate = qs("#moveDate").value;
    var win = qs("input[name=arrivalWindow]:checked");
    if (win) state.arrivalWindow = win.value;
    state.firstName = qs("#firstName").value.trim();
    state.lastName = qs("#lastName").value.trim();
    state.phone = qs("#phone").value.trim();
    state.email = qs("#email").value.trim();
    state.originPropertyType = val("#originPropertyType");
    state.originAccess = val("#originAccess");
    state.destinationPropertyType = val("#destinationPropertyType");
    state.destinationAccess = val("#destinationAccess");
    state.specialtyItems = qsa("input[name=specialty]:checked").map(function (el) { return el.value; });
    state.notes = qs("#notes").value.trim();
    saveState();
  }

  function readAddress(which) {
    return {
      street: qs("#" + which + "Street").value.trim(),
      unit: qs("#" + which + "Unit").value.trim(),
      city: qs("#" + which + "City").value.trim(),
      state: qs("#" + which + "State").value.trim().toUpperCase(),
      zip: qs("#" + which + "Zip").value.trim()
    };
  }

  function restoreFields() {
    setAddr("origin", state.origin);
    setAddr("destination", state.destination);
    if (state.homeSize !== null && state.homeSize !== undefined) {
      var home = qs('input[name=homeSize][value="' + state.homeSize + '"]');
      if (home) home.checked = true;
    }
    if (qs("#distanceBand")) qs("#distanceBand").value = state.distanceBand || "";
    qs("#moveDate").value = state.moveDate || "";
    if (state.moveDate) calView = monthFromYmd(state.moveDate);
    renderCalendar();
    if (state.arrivalWindow) {
      var w = qsa("input[name=arrivalWindow]").find
        ? qsa("input[name=arrivalWindow]").find(function (el) { return el.value === state.arrivalWindow; })
        : null;
      qsa("input[name=arrivalWindow]").forEach(function (el) {
        if (el.value === state.arrivalWindow) el.checked = true;
      });
    }
    qs("#firstName").value = state.firstName || "";
    qs("#lastName").value = state.lastName || "";
    qs("#phone").value = state.phone || "";
    qs("#email").value = state.email || "";
    qs("#originPropertyType").value = state.originPropertyType || "";
    qs("#originAccess").value = state.originAccess || "";
    qs("#destinationPropertyType").value = state.destinationPropertyType || "";
    qs("#destinationAccess").value = state.destinationAccess || "";
    qs("#notes").value = state.notes || "";
    (state.specialtyItems || []).forEach(function (item) {
      var box = qs('input[name=specialty][value="' + item + '"]');
      if (box) box.checked = true;
    });
    if (state.quote) renderEstimate(state.quote);
  }

  function setAddr(which, addr) {
    addr = addr || {};
    qs("#" + which + "Street").value = addr.street || "";
    qs("#" + which + "Unit").value = addr.unit || "";
    qs("#" + which + "City").value = addr.city || "";
    qs("#" + which + "State").value = addr.state || "";
    qs("#" + which + "Zip").value = addr.zip || "";
  }

  /**
   * The price table and distance tables ship with the page, so the estimate is
   * computed locally and instantly. The Edge Function recalculates it from the
   * same shared module when the reservation is written.
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

  function fillDistanceBands() {
    var select = qs("#distanceBand");
    if (!select || !core || select.options.length > 1) return;
    core.DISTANCE_BANDS.forEach(function (band) {
      var option = document.createElement("option");
      option.value = band.key;
      option.textContent = band.label;
      select.appendChild(option);
    });
  }

  function requestEstimate() {
    collectCurrent();
    var btn = qs("#step-date [data-next]");
    btn.disabled = true;
    btn.textContent = "Calculating...";
    getQuote({
      origin: state.origin,
      destination: state.destination,
      homeSize: state.homeSize,
      distanceBand: state.distanceBand
    }).then(function (quote) {
      state.quote = quote;
      saveState();
      renderEstimate(quote);
      current = steps.indexOf("estimate");
      state.step = current;
      saveState();
      goTo("estimate");
    }).catch(function (err) {
      fail(err.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "See My Estimate";
    });
  }

  function renderEstimate(quote) {
    qs("#est-from").textContent = quote.origin.city + ", " + quote.origin.state;
    qs("#est-to").textContent = quote.destination.city + ", " + quote.destination.state;
    qs("#est-miles").textContent = "~" + quote.distanceMiles + " miles";
    qs("#est-hours").textContent = quote.estimatedHours + " Hours";
    qs("#est-price").textContent = "$" + quote.estimatedPrice;
    var capNote = qs("#est-cap-note");
    if (capNote) capNote.hidden = !(Number(quote.estimatedHours) >= 8);
  }

  function renderReview() {
    collectCurrent();
    var q = state.quote || {};
    qs("#review-summary").innerHTML =
      "<h3>MOVE SUMMARY</h3>" +
      "<p><strong>Moving From</strong><br>" + escapeHtml(formatAddr(state.origin)) + "</p>" +
      "<p><strong>Moving To</strong><br>" + escapeHtml(formatAddr(state.destination)) + "</p>" +
      "<p><strong>Distance</strong><br>" + escapeHtml(String(q.distanceMiles || "")) + " miles</p>" +
      "<p><strong>Home Size</strong><br>" + escapeHtml(q.homeSizeLabel || "") + "</p>" +
      "<p><strong>Move Date</strong><br>" + escapeHtml(niceDate(state.moveDate)) + "</p>" +
      "<p><strong>Arrival Window</strong><br>" + escapeHtml(state.arrivalWindow) + "</p>" +
      "<p><strong>Estimated Time</strong><br>" + escapeHtml(String(q.estimatedHours || "")) + " Hours</p>" +
      "<p><strong>Estimated Price</strong><br>$" + escapeHtml(String(q.estimatedPrice || "")) + "</p>" +
      "<p><strong>Contact</strong><br>" + escapeHtml(state.firstName + " " + state.lastName) +
      "<br>" + escapeHtml(state.phone) + "<br>" + escapeHtml(state.email) + "</p>" +
      (state.originPropertyType ? "<p><strong>Origin property</strong><br>" + escapeHtml(state.originPropertyType) + "</p>" : "") +
      (state.originAccess ? "<p><strong>Origin access</strong><br>" + escapeHtml(state.originAccess) + "</p>" : "") +
      (state.destinationPropertyType ? "<p><strong>Destination property</strong><br>" + escapeHtml(state.destinationPropertyType) + "</p>" : "") +
      (state.destinationAccess ? "<p><strong>Destination access</strong><br>" + escapeHtml(state.destinationAccess) + "</p>" : "") +
      (state.specialtyItems && state.specialtyItems.length ? "<p><strong>Move details</strong><br>" + escapeHtml(state.specialtyItems.join(", ")) + "</p>" : "") +
      (state.notes ? "<p><strong>Notes</strong><br>" + escapeHtml(state.notes) + "</p>" : "");
  }

  function reserve() {
    clearError();
    if (!validateCurrent()) return;
    collectCurrent();
    var btn = qs("#book-reserve");
    btn.disabled = true;
    btn.textContent = "Reserving...";
    api.book({
      idempotencyKey: state.idempotencyKey,
      origin: state.origin,
      destination: state.destination,
      homeSize: state.homeSize,
      distanceBand: state.distanceBand,
      moveDate: state.moveDate,
      arrivalWindow: state.arrivalWindow,
      firstName: state.firstName,
      lastName: state.lastName,
      phone: state.phone,
      email: state.email,
      originPropertyType: state.originPropertyType,
      originAccess: state.originAccess,
      destinationPropertyType: state.destinationPropertyType,
      destinationAccess: state.destinationAccess,
      specialtyItems: state.specialtyItems,
      notes: state.notes,
      acceptedTerms: true,
      website: qs("#website").value
    }).then(function (result) {
      state.confirmation = result;
      state.idempotencyKey = uuid();
      saveState();
      showConfirmation(result);
      goTo("confirm");
      if (window.HerculesBooking.trackConversion) {
        window.HerculesBooking.trackConversion(result);
      }
    }).catch(function (err) {
      fail(err.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Reserve My Move";
    });
  }

  function showConfirmation(result) {
    qs("#conf-ref").textContent = result.reference;
    qs("#conf-date").textContent = niceDate(result.moveDate);
    qs("#conf-window").textContent = result.arrivalWindow;
    qs("#conf-hours").textContent = result.estimatedHours + " Hours";
    qs("#conf-price").textContent = "$" + result.estimatedPrice;
    qs("#conf-review-note").style.display = result.needsReview ? "block" : "none";
    // The fallback path emails the office but sends the customer nothing, so
    // promise a callback instead of an email that will never arrive.
    qs("#conf-email-note").style.display = result.viaFallback ? "none" : "block";
    qs("#conf-callback-note").style.display = result.viaFallback ? "block" : "none";
  }

  function loadPlaces() {
    if (!window.HerculesBooking.ensureMaps) return;
    window.HerculesBooking.ensureMaps(cfg.googleMapsBrowserKey);
    google.maps.importLibrary("places").then(function (lib) {
      attachAutocomplete(lib.PlaceAutocompleteElement, "originStreet", "origin", true);
      attachAutocomplete(lib.PlaceAutocompleteElement, "destinationStreet", "destination", false);
    }).catch(function (err) {
      console.error("Google Places failed to load", err);
    });
  }

  function attachAutocomplete(PlaceAutocompleteElement, inputId, which, flOnly) {
    var input = qs("#" + inputId);
    if (!input || input.dataset.placesBound) return;
    input.dataset.placesBound = "1";

    var widget = new PlaceAutocompleteElement({ includedRegionCodes: ["us"] });
    widget.classList.add("book-place-autocomplete");
    if (input.placeholder) widget.placeholder = input.placeholder;
    input.insertAdjacentElement("afterend", widget);
    input.classList.add("book-field-fallback");

    widget.addEventListener("gmp-select", function (evt) {
      var prediction = evt && evt.placePrediction;
      if (!prediction) return;
      var place = prediction.toPlace();
      place.fetchFields({ fields: ["addressComponents", "formattedAddress"] }).then(function () {
        var parsed = parsePlace(place);
        if (flOnly && parsed.state && parsed.state !== "FL") {
          fail(cfg.originOutsideFlMessage);
        }
        setAddr(which, parsed);
      }).catch(function (err) {
        console.error("Unable to read selected place", err);
      });
    });
  }

  function parsePlace(place) {
    var out = { street: "", unit: "", city: "", state: "", zip: "" };
    var streetNumber = "";
    var route = "";
    (place.addressComponents || []).forEach(function (c) {
      var types = c.types || [];
      if (types.indexOf("street_number") >= 0) streetNumber = c.longText;
      if (types.indexOf("route") >= 0) route = c.shortText;
      if (types.indexOf("subpremise") >= 0) out.unit = c.longText;
      if (types.indexOf("locality") >= 0) out.city = c.longText;
      if (!out.city && types.indexOf("sublocality") >= 0) out.city = c.longText;
      if (types.indexOf("administrative_area_level_1") >= 0) out.state = c.shortText;
      if (types.indexOf("postal_code") >= 0) out.zip = c.longText;
    });
    out.street = (streetNumber + " " + route).trim() || place.formattedAddress || "";
    return out;
  }

  function fail(msg) {
    var box = qs(".book-step.active .book-error") || qs("#global-error");
    if (box) {
      box.textContent = msg;
      box.classList.add("show");
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return false;
  }

  function clearError() {
    qsa(".book-error").forEach(function (el) {
      el.classList.remove("show");
      el.textContent = "";
    });
  }

  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function val(sel) { return qs(sel).value; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todayYmd() {
    var ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return ny.getFullYear() + "-" + pad(ny.getMonth() + 1) + "-" + pad(ny.getDate());
  }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""); }
  function isPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    return d.length === 10 || (d.length === 11 && d.charAt(0) === "1");
  }
  function isUsState(st) {
    return "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ").indexOf(st) >= 0;
  }
  function formatAddr(a) {
    return [a.street, a.unit, a.city + ", " + a.state + " " + a.zip].filter(Boolean).join(", ");
  }
  function niceDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC"
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function monthFromYmd(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    var p = ymd.split("-");
    return { year: Number(p[0]), month: Number(p[1]) - 1 };
  }

  function shiftMonth(view, delta) {
    var d = new Date(view.year, view.month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  function renderCalendar() {
    var label = qs("#cal-month-label");
    var grid = qs("#cal-grid");
    if (!label || !grid) return;
    var names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    label.textContent = names[calView.month] + " " + calView.year;
    var first = new Date(calView.year, calView.month, 1);
    var start = first.getDay();
    var daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();
    var prevDays = new Date(calView.year, calView.month, 0).getDate();
    var today = todayYmd();
    var html = "";
    var i;
    for (i = 0; i < start; i++) {
      html += '<button type="button" class="other" disabled>' + (prevDays - start + i + 1) + "</button>";
    }
    for (i = 1; i <= daysInMonth; i++) {
      var ymd = calView.year + "-" + pad(calView.month + 1) + "-" + pad(i);
      var cls = [];
      if (ymd === today) cls.push("today");
      if (ymd === state.moveDate) cls.push("selected");
      if (ymd < today) cls.push("past");
      html += '<button type="button" data-date="' + ymd + '" class="' + cls.join(" ") + '"' +
        (ymd < today ? " disabled" : "") + ">" + i + "</button>";
    }
    grid.innerHTML = html;
    qsa("#cal-grid button[data-date]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectMoveDate(btn.getAttribute("data-date"));
      });
    });
    updateCalSelectedLabel();
  }

  function selectMoveDate(ymd) {
    state.moveDate = ymd;
    qs("#moveDate").value = ymd;
    saveState();
    renderCalendar();
  }

  function updateCalSelectedLabel() {
    var el = qs("#cal-selected-label");
    if (!el) return;
    el.textContent = state.moveDate ? "Selected: " + niceDate(state.moveDate) : "No date selected";
  }

  function openTerms() {
    qs("#terms-modal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeTerms() {
    qs("#terms-modal").hidden = true;
    document.body.style.overflow = "";
  }

  function setTermsLinks() {
    var termsUrl = (cfg && cfg.termsUrl) || "terms.html";
    qsa(".terms-full-link a").forEach(function (link) {
      link.href = termsUrl;
    });
  }
})();
