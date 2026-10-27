/**
 * /estimate: an animated, item-by-item moving estimate.
 *
 * Flow: addresses -> the truck lands at pickup -> customer adds items (each one
 * flies into the truck) -> "Start the move" plays disassembly, loading, the
 * drive, unloading and reassembly -> full price breakdown -> send it to us.
 *
 * Price follows the site rule in quote-core.js: hours come from the work, and
 * the price for those hours comes from HOUR_PRICE, never hours x a rate. The
 * add-on numbers in PRICING below are placeholders for the office to confirm.
 */
(function () {
  "use strict";

  var E = window.HerculesEstimate || {};
  var HB = window.HerculesBooking || {};

  /* --------------------------------------------------------------- pricing */

  var PRICING = {
    baseCrew: 2,
    minHours: 2,
    // Unloading is quicker than padding and loading.
    unloadShare: 0.85,
    // Share of that side's handling time added per flight of stairs above the
    // ground floor, and flat for elevator buildings (waiting, long halls).
    stairsPerFlight: 0.1,
    elevatorShare: 0.1,
    // Average driving speed for the drive-time estimate.
    localMph: 30,
    highwayMph: 50,
    // Trucks, smallest first. The estimate quietly uses the 18 ft truck and
    // steps up to the 26 ft once the load is bigger than a 3-bedroom home.
    // Customers never see the size; the office does, in the lead email.
    trucks: [
      { name: "18 ft", cuft: 1000 },
      { name: "26 ft", cuft: 1700 }
    ],
    // PLACEHOLDERS: confirm with the office before relying on these.
    pricePerHourAfter8: 150,
    extraMoverPerHour: 60,
    supplies: [
      { id: "tvbox-rent", name: "TV box (rent, we take it back)", emoji: "📺", price: 35, from: ["tv-small", "tv-large"] },
      { id: "tvbox-buy", name: "TV box (buy, yours to keep)", emoji: "📺", price: 65 },
      { id: "wardrobe", name: "Wardrobe box", emoji: "👔", price: 25, from: ["clothes"] },
      { id: "large", name: "Large boxes (empty)", emoji: "📦", price: 5 },
      { id: "medium", name: "Medium boxes (empty)", emoji: "📦", price: 4 },
      { id: "small", name: "Small boxes (empty)", emoji: "📦", price: 3 },
      { id: "fragile", name: "Fragile packing kit (dishes, glass, art)", emoji: "🥂", price: 15, flag: "fragile" },
      { id: "mattressbag", name: "Mattress bag", emoji: "🛏️", price: 15, from: ["king-bed", "queen-bed", "full-bed", "bunk-bed", "mattress"] }
    ],
    // Priced extra services. An extra stop is priced per stop the customer
    // adds on the map, the others by how many they ask for.
    stopPrice: 50,
    services: [
      { id: "longcarry", name: "Long walk from truck to door (75+ ft)", emoji: "🚶", price: 25, unit: "per location" },
      // Suggested fee for a donation or junk run; dump fees, if any, are extra.
      { id: "junk", name: "Junk or donation drop-off", emoji: "♻️", price: 75, unit: "per trip" }
    ],
    // Full packing service: our crew packs. The packing time is added to
    // the billed hours like any other work, plus a materials charge.
    // PLACEHOLDERS for the office to confirm.
    packs: [
      { id: "pack-kitchen", name: "Kitchen only", emoji: "🍽️", materials: 45, minutes: 60 },
      { id: "pack-small", name: "Studio or 1 bedroom", emoji: "🏠", materials: 95, minutes: 120 },
      { id: "pack-medium", name: "2 to 3 bedrooms", emoji: "🏡", materials: 225, minutes: 300 },
      { id: "pack-large", name: "4+ bedrooms", emoji: "🏘️", materials: 410, minutes: 480 }
    ],
    // Material-only kits for customers who pack themselves, priced a little
    // under the same boxes bought one by one. PLACEHOLDERS.
    kits: [
      { id: "kit-small", name: "Starter kit (studio / 1 bedroom)", emoji: "📦", price: 95, has: "10 small, 15 medium, 5 large boxes, tape & packing paper" },
      { id: "kit-medium", name: "Home kit (2 to 3 bedrooms)", emoji: "📦", price: 225, has: "15 small, 30 medium, 10 large, 2 wardrobe boxes, tape & paper" },
      { id: "kit-large", name: "Big home kit (4+ bedrooms)", emoji: "📦", price: 410, has: "25 small, 45 medium, 20 large, 4 wardrobe boxes, 2 dish packs, tape & paper" }
    ],
    // Nothing needs a phone quote any more; kept for older code paths.
    onCall: []
  };

  function findIn(list, id) { return list.filter(function (x) { return x.id === id; })[0] || null; }

  function truckFor(cuft) {
    var t = PRICING.trucks;
    for (var i = 0; i < t.length; i++) if (cuft <= t[i].cuft) return t[i];
    return t[t.length - 1];
  }

  // How many people it takes to lift one item safely.
  function crewForWeight(lbs) {
    if (lbs > 450) return 4;
    if (lbs > 300) return 3;
    return 2;
  }

  /* ----------------------------------------------------------------- state */

  var ITEMS = E.ITEMS || [];
  var byId = {};
  ITEMS.forEach(function (it) { byId[it.id] = it; });

  var state = {
    from: null, to: null, fromText: "", toText: "",
    fromFloor: "ground", toFloor: "ground",
    miles: 0,
    items: {}, order: [],
    supplies: {}, onCall: {}, excluded: {},
    // Extra stops in route order: { text, addr, kind: "pickup" | "dropoff" }
    stops: [],
    pack: null, kit: null,
    playing: false, played: false
  };

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function mins(m) {
    m = Math.max(0, Math.round(m));
    var h = Math.floor(m / 60), r = m % 60;
    return h ? h + " h" + (r ? " " + r + " m" : "") : r + " m";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function floorInfo(v) {
    if (v === "elevator") return { kind: "elevator", flights: 0, label: "Elevator building" };
    var m = /^stairs-(\d+)$/.exec(v || "");
    if (m) {
      var f = +m[1];
      return { kind: "stairs", flights: f - 1, label: ordinal(f) + " floor walk-up (" + (f - 1) + " flight" + (f > 2 ? "s" : "") + ")" };
    }
    return { kind: "ground", flights: 0, label: "Ground floor" };
  }
  function ordinal(n) { return n + (n === 2 ? "nd" : n === 3 ? "rd" : n === 1 ? "st" : "th"); }

  /* ------------------------------------------------------------- the math */

  function compute() {
    var load = 0, asm = 0, cuft = 0, count = 0, crew = PRICING.baseCrew, heaviest = null;
    state.order.forEach(function (id) {
      var it = byId[id], q = state.items[id] || 0;
      if (!it || !q) return;
      load += it.load * q;
      asm += it.asm * q;
      cuft += it.cuft * q;
      count += q;
      var need = crewForWeight(it.lbs);
      // Remember the heaviest item behind the biggest crew, to explain it.
      if (need > crew || (need === crew && need > PRICING.baseCrew && it.lbs > heaviest.lbs)) {
        crew = need;
        heaviest = it;
      }
    });
    var unload = load * PRICING.unloadShare;

    function stairsFor(floor, handling) {
      var f = floorInfo(floor);
      if (f.kind === "elevator") return handling * PRICING.elevatorShare;
      return handling * PRICING.stairsPerFlight * f.flights;
    }
    var stairsPick = stairsFor(state.fromFloor, load);
    var stairsDrop = stairsFor(state.toFloor, unload);

    var drive = 0;
    if (state.miles) {
      var mph = state.miles > 50 ? PRICING.highwayMph : PRICING.localMph;
      drive = Math.max(10, (state.miles / mph) * 60);
    }

    var pack = findIn(PRICING.packs, state.pack), kit = findIn(PRICING.kits, state.kit);
    var packMin = pack ? pack.minutes : 0;
    var packing = (pack ? pack.materials : 0) + (kit ? kit.price : 0);
    var packLines = [];
    if (pack) packLines.push("Full packing service, " + pack.name + ": ~" + mins(pack.minutes) + " packing + " + money(pack.materials) + " materials");
    if (kit) packLines.push(kit.name + " (" + kit.has + "): " + money(kit.price));
    var totalMin = load + unload + asm + stairsPick + stairsDrop + drive + packMin;
    var hours = Math.max(PRICING.minHours, Math.ceil(totalMin / 60));
    var table = (window.HerculesQuoteCore && window.HerculesQuoteCore.HOUR_PRICE) || {};
    var base = hours <= 8 ? table[hours] : table[8] + (hours - 8) * PRICING.pricePerHourAfter8;
    var extraMovers = (crew - PRICING.baseCrew) * PRICING.extraMoverPerHour * hours;

    var supplies = 0, supplyLines = [];
    PRICING.supplies.forEach(function (s) {
      var q = state.supplies[s.id] || 0;
      if (q) {
        supplies += q * s.price;
        supplyLines.push(q + " × " + s.name + " (" + money(q * s.price) + ")");
      }
    });

    var services = state.stops.length * PRICING.stopPrice, serviceLines = [];
    if (state.stops.length) serviceLines.push(state.stops.length + " × Extra stop (" + money(services) + ")");
    PRICING.services.forEach(function (s) {
      var q = state.supplies[s.id] || 0;
      if (q) {
        services += q * s.price;
        serviceLines.push(q + " × " + s.name + " (" + money(q * s.price) + ")");
      }
    });

    return {
      packMin: packMin, packing: packing, packLines: packLines,
      services: services, serviceLines: serviceLines,
      count: count, cuft: cuft, truck: truckFor(cuft), fill: cuft / truckFor(cuft).cuft,
      load: load, unload: unload, asm: asm, stairsPick: stairsPick, stairsDrop: stairsDrop, drive: drive,
      totalMin: totalMin, hours: hours, crew: crew, heaviest: heaviest,
      base: base || 0, extraMovers: extraMovers, supplies: supplies, supplyLines: supplyLines,
      total: (base || 0) + extraMovers + supplies + services + packing
    };
  }

  /* ------------------------------------------------------ address step */

  function attachSuggest(input) {
    var box = document.createElement("div");
    box.className = "ac";
    input.parentNode.insertBefore(box, input);
    box.appendChild(input);
    var ul = document.createElement("ul");
    ul.className = "ac-list";
    ul.hidden = true;
    box.appendChild(ul);
    input.setAttribute("autocomplete", "off");
    var list = [], active = -1;
    function close() { ul.hidden = true; list = []; active = -1; }
    function pick(p) { input.value = p.label; close(); input.dispatchEvent(new Event("change")); }
    input.addEventListener("input", function () {
      list = HB.places ? HB.places.suggest(input.value) : [];
      ul.innerHTML = "";
      if (!list.length) return close();
      list.forEach(function (p) {
        var li = document.createElement("li");
        li.textContent = p.label;
        li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(p); });
        ul.appendChild(li);
      });
      active = -1;
      ul.hidden = false;
    });
    input.addEventListener("keydown", function (e) {
      if (ul.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var last = list.length - 1;
        active = e.key === "ArrowDown" ? (active < last ? active + 1 : 0) : (active > 0 ? active - 1 : last);
        Array.prototype.forEach.call(ul.children, function (li, i) { li.classList.toggle("on", i === active); });
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(list[active]);
      } else if (e.key === "Escape") {
        close();
      }
    }, true);
    input.addEventListener("blur", close);
  }

  function shortPlace(text) {
    var t = HB.places ? HB.places.tidy(text) : text;
    var parts = t.split(", ");
    // "465 Brickell Ave, Miami, FL" -> "Miami"; "Miami, FL" -> "Miami"
    return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  }

  // The first step's contact details. Required for both buttons.
  function contact() {
    return { name: $("st-name").value.trim(), phone: $("st-ph").value.trim(), email: $("st-em").value.trim() };
  }

  function contactOk(err) {
    var c = contact();
    if (!c.name) { err.textContent = "Please enter your name."; return null; }
    if (!phoneOk(c.phone)) { err.textContent = "Please enter a valid phone number."; return null; }
    if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) { err.textContent = "Please check your email address."; return null; }
    return c;
  }

  // Carries the first step's details into the final form.
  function prefill(c) {
    var parts = c.name.split(/\s+/);
    if (!$("fn").value) $("fn").value = parts.shift() || "";
    if (!$("ln").value) $("ln").value = parts.join(" ");
    if (!$("ph").value) $("ph").value = c.phone;
    if (!$("em").value && c.email) $("em").value = c.email;
  }

  // Stops typed on the first step, in order: [{ text, kind }]
  function addStopRow(text, kind) {
    var row = document.createElement("div");
    row.className = "addr-stop";
    row.dataset.kind = kind || "stop";
    row.innerHTML = '<div><label class="f">📍 ' + stopLabel({ kind: row.dataset.kind }) + '</label><input class="in" placeholder="Address, city or ZIP" aria-label="Stop on the way"></div>' +
      '<button type="button" class="mv-btn" aria-label="Remove this stop">✕</button>';
    var input = row.querySelector("input");
    input.value = text || "";
    row.querySelector("button").addEventListener("click", function () { row.remove(); });
    $("st-stops").appendChild(row);
    attachSuggest(input);
    if (!text) input.focus();
  }

  function typedStops() {
    return Array.prototype.map.call(document.querySelectorAll("#st-stops .addr-stop"), function (row) {
      return { text: row.querySelector("input").value.trim(), kind: row.dataset.kind };
    }).filter(function (s) { return s.text; });
  }

  // "Reach out to me": send what we have and stop here.
  function sendReach() {
    var err = $("where-err"), c = contactOk(err);
    if (!c || $("st-hp").value) return;
    if (!$("pickup").value.trim()) { err.textContent = "Please enter your pickup address."; return; }
    err.textContent = "";
    var lead = shortLead("reach out", c.name, c.phone, {
      "Email": c.email || "N/A",
      "Stops on the way": typedStops().map(function (s) { return s.text; }).join("\n") || "None",
      "Note": "Asked us to reach out instead of building an estimate."
    });
    if (c.email) lead.payload._replyto = c.email;
    var btn = $("reach-go");
    btn.disabled = true;
    btn.textContent = "Sending…";
    deliver(lead.payload).then(function () {
      // They already reached us, so building later sends no extra "started" lead.
      startedSent = true;
      $("reach-ref").textContent = lead.ref;
      $("reach-sent").hidden = false;
      document.querySelector("#step-where .two-btn").hidden = true;
      if (typeof fbq === "function") fbq("track", "Lead", { content_name: "Website estimate (reach out)" }, { eventID: lead.ref });
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = "📞 Reach out to me";
      textFallback(err, ["Hi Hercules, please reach out about my move (" + lead.ref + ").", "Name: " + c.name,
        "From: " + lead.payload["Moving from"], "To: " + lead.payload["Moving to"]], "Text Us Instead");
    });
  }

  // "Build my estimate" also saves the lead once, quietly, so we can help
  // if they stop part way.
  var startedSent = false;
  function sendStarted(c) {
    if (startedSent) return;
    startedSent = true;
    var lead = shortLead("started", c.name, c.phone, { "Email": c.email || "N/A", "Note": "Started building an estimate online." });
    if (c.email) lead.payload._replyto = c.email;
    deliver(lead.payload).catch(function () { startedSent = false; });
  }

  function startWhere() {
    var err = $("where-err"), c = contactOk(err);
    if (!c || $("st-hp").value) return;
    var fromText = $("pickup").value.trim(), toText = $("dropoff").value.trim();
    if (!fromText) { err.textContent = "Please enter your pickup address."; return; }
    if (!toText) { err.textContent = "Add a drop-off address to build your estimate, or tap Reach out to me."; return; }
    var stops = [], typed = typedStops();
    for (var i = 0; i < typed.length; i++) {
      var addr = HB.places && HB.places.locate(typed[i].text);
      if (!addr) { err.textContent = "We couldn't place stop " + (i + 1) + ". Try adding the city or ZIP."; return; }
      stops.push({ text: typed[i].text, addr: addr, kind: typed[i].kind });
    }
    var a = HB.places && HB.places.locate(fromText);
    var b = HB.places && HB.places.locate(toText);
    if (!a || !b) {
      err.textContent = "We couldn't place " + (!a ? "the pickup" : "the delivery") + " address. Try adding the city or ZIP, or pick from the list.";
      return;
    }
    err.textContent = "";
    state.from = a; state.to = b; state.fromText = fromText; state.toText = toText;
    state.stops = stops;
    state.fromFloor = $("pickup-floor").value; state.toFloor = $("dropoff-floor").value;
    updateRoute();
    renderFloors();
    document.body.classList.add("has-scene");
    showStep("step-items");
    $("board").hidden = false;
    $("live").hidden = false;
    $("lane").hidden = false;
    prefill(c);
    sendStarted(c);
    render();
  }

  /* ------------------------------------------------ route map and strip */

  // The real map (minimap.js) shows the true route. The strip across the
  // top is the friendly part: a straight road from pickup to delivery with
  // the truck and two movers, and a pin for each extra stop.

  // Pickup, extra pickups, stops on the way, extra drop-offs, delivery.
  function route() {
    function of(kind) { return state.stops.filter(function (s) { return (s.kind || "stop") === kind; }); }
    return of("pickup").concat(of("stop")).concat(of("dropoff"));
  }

  function stopLabel(s) {
    return s.kind === "pickup" ? "Extra pickup" : s.kind === "dropoff" ? "Extra drop-off" : "Stop on the way";
  }

  // Miles of each leg: pickup, extra stops, delivery.
  function legMiles() {
    var core = window.HerculesQuoteCore;
    if (!core || !state.from || !state.to) return [1];
    var pts = [state.from].concat(route().map(function (s) { return s.addr; })).concat([state.to]), out = [];
    for (var i = 1; i < pts.length; i++) {
      try { out.push(core.estimateMiles(pts[i - 1], pts[i], "")); } catch (e) { out.push(1); }
    }
    return out;
  }

  // Where each extra stop sits along the strip (0 to 1), by its miles but
  // never bunched up against the ends.
  function stopSpots() {
    var legs = legMiles(), total = legs.reduce(function (a, b) { return a + b; }, 0), acc = 0, out = [];
    for (var i = 0; i < legs.length - 1; i++) {
      acc += total ? legs[i] / total : 1 / legs.length;
      out.push(Math.max(0.15, Math.min(0.85, (acc + (i + 1) / legs.length) / 2)));
    }
    return out;
  }

  function drawStrip() {
    $("lane-from").textContent = state.fromText ? shortPlace(state.fromText) : "Pickup";
    $("lane-to").textContent = state.toText ? shortPlace(state.toText) : "Delivery";
    $("lane-from-floor").textContent = floorBadge(state.fromFloor);
    $("lane-to-floor").textContent = floorBadge(state.toFloor);
    var box = $("lane-stops"), spots = stopSpots();
    box.innerHTML = "";
    route().forEach(function (st, i) {
      var pin = document.createElement("span");
      pin.className = "lane-stop";
      pin.style.left = spots[i] * 100 + "%";
      pin.innerHTML = "📍<b>" + esc(shortPlace(st.text)) + "</b>";
      box.appendChild(pin);
    });
    $("lane-miles").textContent = state.miles ? "~" + Math.round(state.miles) + " mi" : "";
  }

  function floorBadge(v) {
    var f = floorInfo(v);
    return f.kind === "stairs" ? "🪜 " + ordinal(f.flights + 1) + " fl" : f.kind === "elevator" ? "🛗" : "";
  }

  var lastMapKey = "";

  // The real map: pins and the actual driving route. Only looked up again
  // when the places change.
  function drawMap() {
    drawStrip();
    var core = window.HerculesQuoteCore, mid = route();
    var key = [state.fromText, state.toText].concat(mid.map(function (s) { return s.text; })).join("|");
    if (!state.from || !state.to || !core || !E.minimap || key === lastMapKey) return;
    lastMapKey = key;
    var ll = function (a) { return core.resolveCoordinates(a); };
    $("map-empty").hidden = true;
    $("mm-open").hidden = false;
    E.minimap.show($("scene"), [{ ll: ll(state.from), text: state.fromText, kind: "pick" }]
      .concat(mid.map(function (s) { return { ll: ll(s.addr), text: s.text, kind: "stop" }; }))
      .concat([{ ll: ll(state.to), text: state.toText, kind: "drop" }]));
  }

  // Miles for the whole route, then redraw. Called whenever stops change.
  function updateRoute() {
    var legs = legMiles(), miles = state.from && state.to ? legs.reduce(function (a, b) { return a + b; }, 0) : 0;
    state.miles = miles;
    $("trip-short").textContent = "~" + Math.round(miles) + " mi trip";
    $("stop-count").textContent = state.stops.length ? "· " + state.stops.length + " added" : "";
    var list = $("stop-list");
    list.innerHTML = "";
    state.stops.forEach(function (s, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="e">📍</span><span class="nm">' + stopLabel(s) + ": " + esc(HB.places ? HB.places.tidy(s.text) : s.text) +
        ' <small>' + money(PRICING.stopPrice) + '</small></span><button type="button" class="mv-btn">Remove ✕</button>';
      li.querySelector("button").addEventListener("click", function () { removeStop(i); });
      list.appendChild(li);
    });
    drawMap();
    render();
  }

  function addStop() {
    var text = $("stop-input").value.trim(), err = $("stop-err");
    var addr = text && HB.places ? HB.places.locate(text) : null;
    if (!addr) { err.textContent = "We couldn't place that stop. Try a city or ZIP."; return; }
    err.textContent = "";
    if (state.played) resetTrip();
    var kind = $("stop-kind").value;
    state.stops.push({ text: text, addr: addr, kind: kind });
    $("stop-input").value = "";
    hudSay("📍 " + stopLabel({ kind: kind }) + " at " + shortPlace(text) + " added (+" + money(PRICING.stopPrice) + ")");
    updateRoute();
  }

  function removeStop(i) {
    if (state.played) resetTrip();
    state.stops.splice(i, 1);
    updateRoute();
  }

  function hudSay(text) {
    var el = $("lane-msg");
    el.textContent = text;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  // An added item pops up over the truck and drops into it.
  function popIntoTruck(emoji) {
    if (reduceMotion) return;
    var t = $("lane-truck"), s = document.createElement("span");
    s.className = "lane-pop";
    s.textContent = emoji;
    t.appendChild(s);
    setTimeout(function () { s.remove(); }, 900);
    t.classList.remove("gulp");
    void t.offsetWidth;
    t.classList.add("gulp");
  }

  // Keeps the whole truck on the road: at the start its left edge sits at
  // the pickup end, at the finish its right edge at the delivery end.
  function setTruck(f) {
    var t = $("lane-truck");
    t.style.left = f * 100 + "%";
    t.style.transform = "translateX(-" + f * 100 + "%)";
  }

  // One drive along the strip, pausing at each extra stop.
  function driveStrip() {
    var marks = stopSpots().concat([1]), i = 0;
    return new Promise(function (resolve) {
      if (reduceMotion) { setTruck(1); resolve(); return; }
      function next() {
        if (i >= marks.length) { resolve(); return; }
        var to = marks[i++], st = route()[i - 1];
        setTruck(to);
        hudSay(st ? (st.kind === "pickup" ? "⬆ Picking up in " : st.kind === "dropoff" ? "⬇ Dropping off in " : "📍 Stopping in ") + shortPlace(st.text) : "🛣️ On the way to " + $("lane-to").textContent);
        setTimeout(next, st ? 1300 : 1100);
      }
      next();
    });
  }

  /* ------------------------------------------------------------ items step */

  var selected = null;

  function searchItems(q) {
    q = q.toLowerCase().trim();
    if (!q) return [];
    var starts = [], inside = [];
    ITEMS.forEach(function (it) {
      var hay = (it.name + " " + (it.alt || "") + " " + it.cat).toLowerCase();
      if (it.name.toLowerCase().indexOf(q) === 0) starts.push(it);
      else if ((" " + hay).indexOf(" " + q) >= 0 || hay.indexOf(q) >= 0) inside.push(it);
    });
    return starts.concat(inside).slice(0, 8);
  }

  function setupSearch() {
    var input = $("item-search"), ul = $("item-list"), active = -1, list = [];
    function close() { ul.hidden = true; active = -1; }
    function choose(it) {
      selected = it;
      input.value = it.emoji + " " + it.name;
      close();
      $("qty").focus({ preventScroll: true });
      $("qty").select();
    }
    input.addEventListener("input", function () {
      selected = null;
      list = searchItems(input.value);
      ul.innerHTML = "";
      if (!list.length) {
        if (input.value.trim().length > 1) {
          ul.innerHTML = '<li class="none">No match. Pick the closest item, or tell us in the notes when you send it.</li>';
          ul.hidden = false;
        } else close();
        return;
      }
      list.forEach(function (it) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="e">' + it.emoji + "</span>" + esc(it.name) + "<small>" + esc(it.cat) + "</small>";
        li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(it); });
        ul.appendChild(li);
      });
      active = -1;
      ul.hidden = false;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!ul.hidden && list.length) choose(list[Math.max(0, active)]);
        else addSelected();
        return;
      }
      if (ul.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var last = list.length - 1;
        active = e.key === "ArrowDown" ? (active < last ? active + 1 : 0) : (active > 0 ? active - 1 : last);
        Array.prototype.forEach.call(ul.children, function (li, i) { li.classList.toggle("on", i === active); });
      } else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", function () { setTimeout(close, 100); });

    $("qty").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addSelected(); } });
    $("qty-minus").addEventListener("click", function () { $("qty").value = Math.max(1, (+$("qty").value || 1) - 1); });
    $("qty-plus").addEventListener("click", function () { $("qty").value = Math.min(99, (+$("qty").value || 1) + 1); });
    $("add-item").addEventListener("click", addSelected);

    var chips = $("chips");
    (E.POPULAR || []).forEach(function (id) {
      var it = byId[id];
      if (!it) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = it.emoji + " " + esc(it.name.replace(/ \(.*\)| \+ mattress/g, ""));
      b.addEventListener("click", function () { addItem(it, 1, b); });
      chips.appendChild(b);
    });
  }

  function addSelected() {
    var err = $("item-err");
    if (!selected) {
      var guess = searchItems($("item-search").value);
      if (guess.length === 1) selected = guess[0];
    }
    if (!selected) { err.textContent = "Pick an item from the list first."; return; }
    err.textContent = "";
    var q = Math.max(1, Math.min(99, parseInt($("qty").value, 10) || 1));
    addItem(selected, q, $("add-item"));
    selected = null;
    $("item-search").value = "";
    $("qty").value = 1;
    $("item-search").focus({ preventScroll: true });
  }

  function addItem(it, q, fromEl) {
    if (state.played) resetTrip();
    if (!state.items[it.id]) state.order.push(it.id);
    state.items[it.id] = (state.items[it.id] || 0) + q;
    popIntoTruck(it.emoji);
    var need = crewForWeight(it.lbs);
    if (need > PRICING.baseCrew) hudSay("💪 " + it.name + " is heavy: that's " + need + " movers to lift it safely.");
    else hudSay("✅ " + q + " × " + it.name + " loaded");
    render();
  }

  function setQty(id, q) {
    if (state.played) resetTrip();
    if (q <= 0) {
      delete state.items[id];
      state.order = state.order.filter(function (x) { return x !== id; });
    } else state.items[id] = Math.min(99, q);
    render();
  }

  /* -------------------------------------------------------------- render */

  function renderFloors() {
    drawStrip();
    $("floor-pick-edit").value = state.fromFloor;
    $("floor-drop-edit").value = state.toFloor;
  }

  function render() {
    var c = compute();

    // Truck fill and crew, in the stats and on the strip.
    $("cargo-text").textContent = Math.round(c.fill * 100) + "% full";
    $("mover-count").textContent = c.crew;
    $("lane-fill").style.width = Math.min(100, Math.round(c.fill * 100)) + "%";
    var loads = ["🛋️", "📦", "🖼️", "🧺"], extra = "";
    for (var m = 0; m < c.crew - 2; m++) extra += '<span class="mv"><i>' + loads[m % loads.length] + "</i>🧍‍♂️</span>";
    $("mover-extra").innerHTML = extra;

    // Your items.
    var mine = $("my-items");
    mine.innerHTML = "";
    state.order.forEach(function (id) {
      var it = byId[id], q = state.items[id];
      var li = dragRow("item", id, it.emoji, esc(it.name) +
        (it.asm ? ' <small>🔧 take apart &amp; rebuild</small>' : "") +
        (crewForWeight(it.lbs) > 2 ? ' <small class="hv">💪 ' + crewForWeight(it.lbs) + "-person lift</small>" : ""),
        q, function (n) { setQty(id, n); }, "inc");
      mine.appendChild(li);
    });
    $("my-items-empty").hidden = state.order.length > 0;

    // Packing supplies and phone-quoted services sit in whichever column
    // they belong to right now.
    var incX = $("inc-extras"), sup = $("supplies"), oc = $("oncall"), outL = $("excluded");
    incX.innerHTML = ""; sup.innerHTML = ""; oc.innerHTML = ""; outL.innerHTML = "";
    PRICING.supplies.forEach(function (s) {
      var q = state.supplies[s.id] || 0, sug = suggestFor(s);
      var label = esc(s.name) + " <small>" + money(s.price) + " each</small>" +
        (sug > q ? ' <button type="button" class="sug" data-sug="' + sug + '">Suggested: ' + sug + "</button>" : "");
      var li = dragRow("supply", s.id, s.emoji, label, q ? q : null, function (n) { state.supplies[s.id] = Math.max(0, Math.min(200, n)); render(); }, q ? "inc" : "ext");
      var sb = li.querySelector(".sug");
      if (sb) sb.addEventListener("click", function () { state.supplies[s.id] = sug; render(); });
      (q ? incX : sup).appendChild(li);
    });
    var svc = $("services");
    svc.innerHTML = "";
    PRICING.services.forEach(function (s) {
      var q = state.supplies[s.id] || 0;
      var li = dragRow("supply", s.id, s.emoji, esc(s.name) + " <small>" + money(s.price) + " " + s.unit + "</small>", q ? q : null,
        function (n) { state.supplies[s.id] = Math.max(0, Math.min(20, n)); render(); }, q ? "inc" : "ext");
      (q ? incX : svc).appendChild(li);
    });
    // Extra stops need an address, so this row opens the stop box.
    var stopRow = document.createElement("li");
    stopRow.innerHTML = '<span class="e">📍</span><span class="nm">Extra pickup or drop-off stop <small>' + money(PRICING.stopPrice) + ' per stop, shows on your route</small></span><button type="button" class="mv-btn">⬅ Add a stop</button>';
    stopRow.querySelector("button").addEventListener("click", openStops);
    svc.appendChild(stopRow);
    state.stops.forEach(function (s, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="e">📍</span><span class="nm">' + stopLabel(s) + ": " + esc(shortPlace(s.text)) + " <small>" + money(PRICING.stopPrice) + '</small></span><button type="button" class="mv-btn">Remove ✕</button>';
      li.querySelector("button").addEventListener("click", function () { removeStop(i); });
      incX.appendChild(li);
    });
    var packsL = $("packs"), kitsL = $("kits");
    packsL.innerHTML = ""; kitsL.innerHTML = "";
    PRICING.packs.forEach(function (p) {
      var on = state.pack === p.id;
      var li = dragRow("pack", p.id, p.emoji, "Packing: " + esc(p.name) + " <small>~" + mins(p.minutes) + " of packing (in your hours) + " + money(p.materials) + " materials</small>", null, null, on ? "inc" : "ext");
      (on ? incX : packsL).appendChild(li);
    });
    PRICING.kits.forEach(function (k) {
      var on = state.kit === k.id;
      var li = dragRow("kit", k.id, k.emoji, esc(k.name) + " <small>" + money(k.price) + ": " + esc(k.has) + "</small>", null, null, on ? "inc" : "ext");
      (on ? incX : kitsL).appendChild(li);
    });
    PRICING.onCall.forEach(function (o) {
      var on = !!state.onCall[o.id];
      var li = dragRow("oncall", o.id, o.emoji, esc(o.name) + " <small>Quoted by phone</small>", null, null, on ? "inc" : "ext");
      (on ? incX : oc).appendChild(li);
    });
    Object.keys(state.excluded).forEach(function (id) {
      var it = byId[id];
      outL.appendChild(dragRow("out", id, it.emoji, state.excluded[id] + " × " + esc(it.name) + " <small>Not in the truck</small>", null, null, "ext"));
    });
    $("inc-extras-head").hidden = !incX.children.length;
    $("excluded-head").hidden = !outL.children.length;
    $("item-total").textContent = c.count ? c.count + " item" + (c.count === 1 ? "" : "s") + " · ~" + Math.round(c.cuft) + " cu ft" : "";
    $("asm-row").hidden = !c.asm;
    $("asm-time").textContent = mins(c.asm);

    // Not included: automatic rows.
    var pf = floorInfo(state.fromFloor), df = floorInfo(state.toFloor);
    var stairsBits = [];
    if (pf.kind !== "ground") stairsBits.push("Pickup: " + pf.label + " (+" + mins(c.stairsPick) + ")");
    if (df.kind !== "ground") stairsBits.push("Delivery: " + df.label + " (+" + mins(c.stairsDrop) + ")");
    $("stairs-detail").textContent = stairsBits.length ? stairsBits.join(" · ") : "None. Both places are ground floor.";
    $("stairs-row").classList.toggle("on", stairsBits.length > 0);

    var extra = c.crew - PRICING.baseCrew;
    $("movers-row").classList.toggle("on", extra > 0);
    $("movers-detail").textContent = extra > 0
      ? "+" + extra + " mover" + (extra > 1 ? "s" : "") + " for your " + c.heaviest.name.toLowerCase() + " (~" + c.heaviest.lbs + " lbs) · " + money(c.extraMovers)
      : "Not needed. Nothing over ~300 lbs yet.";

    $("truck-row").hidden = c.fill <= 1;

    renderRoom();

    // Live estimate card beside the map.
    var live = [
      ["📦", c.count ? c.count + " items to load & unload" : "Add your items", c.load + c.unload],
      ["🔧", "Take apart & rebuild", c.asm],
      ["🪜", "Stairs & elevators", c.stairsPick + c.stairsDrop],
      ["🛣️", "Drive ~" + Math.round(state.miles) + " mi", c.drive],
      ["💪", c.crew + " movers" + (c.crew > 2 ? " (+" + money(c.extraMovers) + ")" : ""), null],
      ["🧑‍🔧", "Packing service", c.packMin ? mins(c.packMin) : null],
      ["📦", "Packing materials & kits", c.packing ? money(c.packing) : null],
      ["📦", "Packing supplies", c.supplies ? money(c.supplies) : null],
      ["🛠️", "Extra stops & services", c.services ? money(c.services) : null]
    ];
    $("live-lines").innerHTML = live.map(function (r) {
      var v = r[2] == null ? "" : typeof r[2] === "string" ? r[2] : r[2] > 0.5 ? mins(r[2]) : "-";
      return '<li class="' + (v === "-" ? "muted" : "") + '"><span>' + r[0] + " " + esc(r[1]) + "</span><b>" + v + "</b></li>";
    }).join("") + '<li class="sum"><span>⏱️ Billed time</span><b>' + (c.count ? c.hours + " hours" : "-") + "</b></li>";
    $("live-total").textContent = c.count ? money(c.total) : "-";
    $("go-live").disabled = c.count === 0 || state.playing;
    $("go-live").textContent = $("go").textContent;

    // Running total.
    var has = c.count > 0;
    $("bar-time").textContent = has ? "~" + c.hours + " h" : "-";
    $("bar-crew").textContent = c.crew;
    $("bar-price").textContent = has ? money(c.total) : "-";
    $("go").disabled = !has;
  }

  function suggestFor(s) {
    if (s.from) {
      return s.from.reduce(function (n, id) { return n + (state.items[id] || 0); }, 0);
    }
    if (s.flag === "fragile") {
      var any = state.order.some(function (id) { return byId[id].box === "fragile"; });
      return any ? 1 : 0;
    }
    return 0;
  }

  /* ---------------------------------------------------- drag and drop */

  // One row in either column. kind: item | supply | oncall | out.
  function dragRow(kind, id, emoji, labelHtml, qty, onQty, zone) {
    var li = document.createElement("li");
    li.className = "drag";
    li.dataset.kind = kind;
    li.dataset.id = id;
    var stepper = qty != null && onQty
      ? '<span class="step"><button type="button" aria-label="Fewer">−</button><b>' + qty + '</b><button type="button" aria-label="More">+</button></span>'
      : "";
    var btn = zone === "inc"
      ? '<button type="button" class="mv-btn" title="' + (kind === "item" ? "I'll move it myself" : "Remove") + '">' + (kind === "item" ? "Not in truck ➜" : "Remove ✕") + "</button>"
      : '<button type="button" class="mv-btn" title="Add to my move">⬅ Add</button>';
    li.innerHTML = '<span class="grip" aria-hidden="true">⠿</span><span class="e">' + emoji + '</span><span class="nm">' + labelHtml + "</span>" + stepper + btn;
    if (stepper) {
      var b = li.querySelectorAll(".step button");
      b[0].addEventListener("click", function () { onQty(qty - 1); });
      b[1].addEventListener("click", function () { onQty(qty + 1); });
    }
    li.querySelector(".mv-btn").addEventListener("click", function () { moveTo(kind, id, zone === "inc" ? "ext" : "inc", li); });
    return li;
  }

  function moveTo(kind, id, zone, fromEl) {
    if (state.played) resetTrip();
    if (kind === "item" && zone === "ext") {
      var it = byId[id];
      state.excluded[id] = state.items[id];
      delete state.items[id];
      state.order = state.order.filter(function (x) { return x !== id; });
      hudSay("🙋 OK, you'll move your " + it.name.toLowerCase() + " yourself.");
      render();
    } else if (kind === "out" && zone === "inc") {
      var q = state.excluded[id];
      delete state.excluded[id];
      addItem(byId[id], q, fromEl);
    } else if (kind === "supply") {
      var s = PRICING.supplies.concat(PRICING.services).filter(function (x) { return x.id === id; })[0];
      state.supplies[id] = zone === "inc" ? Math.max(1, s.from || s.flag ? suggestFor(s) : 1) : 0;
      if (zone === "inc") { popIntoTruck(s.emoji); hudSay("📦 " + s.name + " added"); }
      render();
    } else if (kind === "pack") {
      var p = findIn(PRICING.packs, id);
      state.pack = zone === "inc" ? id : null;
      if (zone === "inc") {
        if (state.kit) state.kit = null;
        hudSay("🧑‍🔧 Full packing (" + p.name.toLowerCase() + ") added. Materials included.");
      }
      render();
    } else if (kind === "kit") {
      if (zone === "inc" && state.pack) {
        hudSay("🧑‍🔧 Your packing service already includes materials.");
        return;
      }
      var k = findIn(PRICING.kits, id);
      state.kit = zone === "inc" ? id : null;
      if (zone === "inc") { popIntoTruck("📦"); hudSay("📦 " + k.name + " added"); }
      render();
    } else if (kind === "oncall") {
      state.onCall[id] = zone === "inc";
      if (zone === "inc") hudSay("📞 We'll quote that by phone");
      render();
    }
  }

  // Pointer-based dragging so it works with a mouse and on phones. On touch
  // screens only the ⠿ grip starts a drag, so the page still scrolls.
  function setupDrag() {
    var board = $("board"), drag = null;
    function zoneAt(x, y) {
      var el = document.elementFromPoint(x, y);
      return el && el.closest ? el.closest("[data-zone]") : null;
    }
    function clearOver() {
      Array.prototype.forEach.call(board.querySelectorAll(".zone.over"), function (z) { z.classList.remove("over"); });
    }
    board.addEventListener("pointerdown", function (e) {
      var li = e.target.closest("li.drag");
      if (!li || e.target.closest("button, select, input")) return;
      if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return;
      // Stops the browser selecting text as the mouse moves.
      e.preventDefault();
      drag = { li: li, x: e.clientX, y: e.clientY, from: li.closest("[data-zone]").dataset.zone, ghost: null };

    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.ghost) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
        var r = drag.li.getBoundingClientRect();
        var g = drag.li.cloneNode(true);
        g.classList.add("drag-ghost");
        g.style.width = r.width + "px";
        g.style.left = r.left + "px";
        g.style.top = r.top + "px";
        drag.dx = e.clientX - r.left;
        drag.dy = e.clientY - r.top;
        document.body.appendChild(g);
        drag.ghost = g;
        drag.li.classList.add("dragging");
        document.body.classList.add("is-dragging");
      }
      e.preventDefault();
      // Near the top or bottom of the screen, scroll so the other column
      // (stacked above or below on phones) can be reached.
      var edge = 110;
      drag.speed = e.clientY < edge + 60 ? -14 : e.clientY > window.innerHeight - edge ? 14 : 0;
      if (drag.speed && !drag.scroller) {
        drag.scroller = setInterval(function () { if (drag && drag.speed) window.scrollBy(0, drag.speed); }, 16);
      }
      drag.ghost.style.left = e.clientX - drag.dx + "px";
      drag.ghost.style.top = e.clientY - drag.dy + "px";
      clearOver();
      var z = zoneAt(e.clientX, e.clientY);
      if (z && z.dataset.zone !== drag.from) z.classList.add("over");
    }, { passive: false });
    function end(e) {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (d.scroller) clearInterval(d.scroller);
      clearOver();
      document.body.classList.remove("is-dragging");
      if (!d.ghost) return;
      d.ghost.remove();
      d.li.classList.remove("dragging");
      var z = e && zoneAt(e.clientX, e.clientY);
      if (z && z.dataset.zone !== d.from) moveTo(d.li.dataset.kind, d.li.dataset.id, z.dataset.zone, d.li);
    }
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", function () { end(null); });
  }

  function openStops() {
    var box = $("stops-box");
    box.open = true;
    box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    setTimeout(function () { $("stop-input").focus({ preventScroll: true }); }, 300);
  }

  function buildExtras() {
    ["pick", "drop"].forEach(function (side) {
      $("floor-" + side + "-edit").addEventListener("change", function (e) {
        if (side === "pick") state.fromFloor = e.target.value; else state.toFloor = e.target.value;
        if (state.played) resetTrip();
        renderFloors();
        render();
      });
    });
  }

  /* ------------------------------------------------------------ results */

  var GO_LABEL = "🧾 See my full estimate ➜";

  function resetTrip() {
    state.played = false;
    $("step-result").hidden = true;
    document.body.classList.remove("reading");
    setTruck(0);
    $("go").textContent = GO_LABEL;
  }

  function showEstimate() {
    if (state.playing || !state.order.length) return;
    var c = compute();
    state.playing = true;
    render();
    driveStrip().then(function () {
      state.playing = false;
      state.played = true;
      hudSay("🎉 About " + c.hours + " hours with " + c.crew + " movers. Here's your estimate.");
      $("go").textContent = "🔁 Update my estimate";
      render();
      showResult(c);
    });
  }

  /* -------------------------------------------------------------- result */

  function showResult(c) {
    var rows = [
      ["🧑‍🔧", "Packing your home", c.packMin],
      ["🔧", "Taking apart", c.asm * 0.4],
      ["📦", "Loading " + c.count + " items", c.load],
      ["🪜", "Stairs / elevator at pickup", c.stairsPick],
      ["🛣️", "Driving ~" + Math.round(state.miles) + " miles", c.drive],
      ["📤", "Unloading", c.unload],
      ["🪜", "Stairs / elevator at delivery", c.stairsDrop],
      ["🔧", "Putting back together", c.asm * 0.6]
    ].filter(function (r) { return r[2] > 0.5; });
    $("timeline").innerHTML = rows.map(function (r) {
      return "<li><span>" + r[0] + " " + esc(r[1]) + "</span><b>" + mins(r[2]) + "</b></li>";
    }).join("") + "<li class=\"sum\"><span>⏱️ Total work time</span><b>" + mins(c.totalMin) + " → " + c.hours + " hours billed</b></li>";

    var price = [["🚚 Truck + 2 movers, " + c.hours + " hours (includes pads, wrap & tape)", c.base]];
    if (c.extraMovers) price.push(["💪 " + (c.crew - 2) + " extra mover" + (c.crew > 3 ? "s" : "") + " for heavy items", c.extraMovers]);
    if (c.packing) price.push(["🧑‍🔧 Packing materials", c.packing]);
    if (c.supplies) price.push(["📦 Packing supplies", c.supplies]);
    if (c.services) price.push(["🛠️ Extra stops & services", c.services]);
    $("price-lines").innerHTML = price.map(function (p) {
      return "<li><span>" + esc(p[0]) + "</span><b>" + money(p[1]) + "</b></li>";
    }).join("");
    $("price-total").textContent = money(c.total);
    var asks = PRICING.onCall.filter(function (o) { return state.onCall[o.id]; }).map(function (o) { return o.name; });
    $("price-asks").textContent = asks.length ? "We'll also quote by phone: " + asks.join(", ") + "." : "";
    $("price-big").hidden = c.fill <= 1;
    $("step-result").hidden = false;
    // Let the scene scroll away so the results are easy to read on phones.
    document.body.classList.add("reading");
    setTimeout(function () { $("step-result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); }, reduceMotion ? 0 : 900);
  }

  /* ---------------------------------------------------------------- send */

  var FORMSUBMIT = "https://formsubmit.co/ajax/herculesmoversfl@gmail.com";

  function buildReference() {
    var now = new Date(), alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", suffix = "";
    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    for (var i = 0; i < 3; i++) suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return "FL-" + String(now.getFullYear()).slice(2) + pad2(now.getMonth() + 1) + pad2(now.getDate()) + "-" + suffix;
  }

  function todayISO() {
    var t = new Date();
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    return t.toISOString().slice(0, 10);
  }

  function leadSource() {
    var src = {};
    try {
      var p = new URLSearchParams(location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"].forEach(function (k) { if (p.get(k)) src[k] = p.get(k); });
      if (Object.keys(src).length) sessionStorage.setItem("hq_src", JSON.stringify(src));
      else src = JSON.parse(sessionStorage.getItem("hq_src") || "{}") || {};
    } catch (e) {}
    return [src.utm_source, src.utm_campaign, src.utm_content].filter(Boolean).join(" / ") ||
      (src.fbclid ? "facebook (untagged)" : src.gclid ? "google ads" : "Direct / unknown");
  }

  // FormSubmit first, then the Web3Forms backup. Resolves once one of them
  // has the lead.
  function deliver(payload) {
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 15000); });
    return Promise.race([fetch(FORMSUBMIT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }), timeout])
      .then(function (r) {
        return r.json().then(function (j) { if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "Send failed"); });
      })
      .catch(function (ex) {
        if (!HB.sendBackup) throw ex;
        return HB.sendBackup(Object.assign({}, payload, { "Send note": "FormSubmit failed: " + (ex && ex.message) }));
      });
  }

  // Neither service reachable: offer a prefilled text instead.
  function textFallback(errEl, lines, label) {
    var href = HB.textUsHref ? HB.textUsHref(lines) : "sms:+17543542008";
    errEl.innerHTML = "We couldn't send it from this browser. Tap below to text it to us, it's already filled in:" +
      '<a class="btn go" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="' + href + '">' + label + "</a>";
  }

  function routeText() {
    var tidy = HB.places ? HB.places.tidy : function (t) { return t; };
    // Before the truck is called, fall back to whatever is typed in the boxes.
    var fromText = state.fromText || $("pickup").value.trim(), toText = state.toText || $("dropoff").value.trim();
    var fromFloor = state.fromText ? state.fromFloor : $("pickup-floor").value;
    var toFloor = state.toText ? state.toFloor : $("dropoff-floor").value;
    return {
      from: fromText ? tidy(fromText) + " · " + floorInfo(fromFloor).label : "N/A",
      to: toText ? tidy(toText) + " · " + floorInfo(toFloor).label : "N/A"
    };
  }

  function phoneOk(ph) { return String(ph || "").replace(/\D/g, "").length >= 10; }

  function itemLines() {
    return state.order.map(function (id) { return state.items[id] + " × " + byId[id].name; });
  }

  // Short lead for "call me" and "text me": whatever we know so far.
  function shortLead(kind, name, phone, extra) {
    var c = compute(), ref = buildReference(), r = routeText();
    var payload = Object.assign({
      "_subject": "Your Hercules Movers move request | Website estimate (" + kind + ") | " + (name || phone) + " | " + r.from.split(" · ")[0] + " → " + r.to.split(" · ")[0] + " (" + ref + ")",
      "_template": "table",
      "_captcha": "false",
      "Lead type": "Website estimate (" + kind + ")",
      "Name": name || "N/A",
      "Phone": phone,
      "Moving from": r.from,
      "Moving to": r.to,
      "Approx. distance": state.miles ? "~" + Math.round(state.miles) + " miles" : "N/A",
      "Items so far": itemLines().join("\n") || "None yet",
      "Estimate so far": c.count ? money(c.total) + " (" + c.hours + " h, " + c.crew + " movers)" : "N/A"
    }, extra || {}, {
      "Lead source": leadSource(),
      "Page": location.origin + location.pathname,
      "Reference": ref
    });
    return { payload: payload, ref: ref };
  }

  // Older Safari has no e.submitter, so remember which button was pressed.
  var lastChoice = "callback";

  function send(e) {
    e.preventDefault();
    var choice = (e.submitter && e.submitter.dataset.choice) || lastChoice;
    var err = $("send-err");
    var fn = $("fn").value.trim(), ln = $("ln").value.trim(), ph = $("ph").value.trim(), em = $("em").value.trim();
    var date = $("date").value, flex = $("flex").checked;
    if (!fn) { err.textContent = "Please enter your first name."; return; }
    if (!phoneOk(ph)) { err.textContent = "Please enter a valid phone number."; return; }
    if (em && !/^\S+@\S+\.\S+$/.test(em)) { err.textContent = "Please check your email address."; return; }
    if (!date) { err.textContent = "Please pick a move date. A rough one is fine, tick flexible if it can change."; return; }
    if (date < todayISO()) { err.textContent = "Please pick today or a later date."; return; }
    if ($("hp").value) return;
    err.textContent = "";

    var c = compute(), ref = buildReference(), source = leadSource(), r = routeText();
    var fromAddr = r.from.split(" · ")[0], toAddr = r.to.split(" · ")[0];
    var items = itemLines();
    var deposit = choice === "deposit" && HB.config && HB.config.depositUrl;
    var bldg = [$("coi").checked ? "Needs a certificate of insurance (COI)" : "", $("elev-res").checked ? "Elevator or loading dock must be reserved" : ""].filter(Boolean);

    var payload = {
      "_subject": "Your Hercules Movers move request | Website estimate" + (deposit ? " (booking + deposit)" : "") + " | " + (fn + " " + ln).trim() + " | " + fromAddr + " → " + toAddr + " (" + ref + ")",
      "_template": "table",
      "_captcha": "false",
      "Lead type": "Website estimate",
      "Booking choice": deposit ? "Book now, paying the $50 deposit on Square (check Square to confirm payment)" : "Send estimate, call to confirm",
      "Name": (fn + " " + ln).trim(),
      "Phone": ph,
      "Email": em || "N/A",
      "Moving from": r.from,
      "Moving to": r.to,
      "Move date": date,
      "Date flexible": flex ? "Yes" : "No",
      "Arrival window": $("window").value || "Any time",
      "Type of move": $("mtype").value,
      "Storage needed": $("storage").value,
      "Building requirements": bldg.length ? bldg.join("\n") : "None",
      "Approx. distance": "~" + Math.round(state.miles) + " miles",
      "Items": items.join("\n"),
      "Item count": c.count + " items, ~" + Math.round(c.cuft) + " cu ft (" + Math.round(c.fill * 100) + "% of a " + c.truck.name + " truck)",
      "Truck": c.truck.name + (c.fill > 1 ? ", plus a second truck or trip" : ""),
      "Crew": c.crew + " movers" + (c.heaviest && c.crew > 2 ? " (heaviest: " + c.heaviest.name + ", ~" + c.heaviest.lbs + " lbs)" : ""),
      "Time breakdown": "Take apart " + mins(c.asm * 0.4) + " · Load " + mins(c.load) + " · Pickup stairs " + mins(c.stairsPick) +
        " · Drive " + mins(c.drive) + " · Unload " + mins(c.unload) + " · Delivery stairs " + mins(c.stairsDrop) + " · Rebuild " + mins(c.asm * 0.6),
      "Estimated hours": c.hours + " (" + mins(c.totalMin) + " of work)",
      "Base price": money(c.base),
      "Extra movers": c.extraMovers ? money(c.extraMovers) : "None",
      "Packing supplies": c.supplyLines.length ? c.supplyLines.join("\n") : "None",
      "Extra stops": state.stops.length ? route().map(function (s) { return stopLabel(s) + ": " + (HB.places ? HB.places.tidy(s.text) : s.text); }).join("\n") : "None",
      "Extra services": c.serviceLines.length ? c.serviceLines.join("\n") : "None",
      "Packing": c.packLines.length ? c.packLines.join("\n") : "None",
      "Customer moving themselves": Object.keys(state.excluded).map(function (id) { return state.excluded[id] + " × " + byId[id].name; }).join("\n") || "None",
      "Estimated total": money(c.total),
      "How they heard about us": $("heard").value || "Not given",
      "Notes": $("notes").value.trim() || "N/A",
      "Lead source": source,
      "Page": location.origin + location.pathname,
      "Reference": ref
    };
    if (em) payload._replyto = em;

    var buttons = [$("send"), $("send-plain")];
    var labels = buttons.map(function (b) { return b.textContent; });
    buttons.forEach(function (b) { b.disabled = true; });
    e.submitter && (e.submitter.textContent = "Sending…");

    deliver(payload).then(function () {
      $("send-form").hidden = true;
      $("sent-ref").textContent = ref;
      $("sent").hidden = false;
      if (typeof fbq === "function") fbq("track", "Lead", { content_name: "Website estimate", value: c.total, currency: "USD" }, { eventID: ref });
      if (!deposit) return;
      // Same hand-off as the homepage: keep a copy for booking-confirmed.html,
      // then go to Square for the deposit.
      try {
        localStorage.setItem("hercules_last_booking", JSON.stringify({
          reference: ref, moveDate: date, arrivalWindow: $("window").value || "",
          estimatedHours: c.hours, estimatedPrice: Math.round(c.total),
          route: fromAddr + " → " + toAddr, savedAt: Date.now()
        }));
      } catch (ex) { /* private browsing: the confirmation page shows a generic message */ }
      $("sent-title").textContent = "Booking saved! Taking you to pay your $" + (HB.config.depositAmount || 50) + " deposit…";
      $("sent-text").innerHTML = "Reference <b>" + esc(ref) + "</b>. If Square doesn't open, <a href=\"" + esc(HB.config.depositUrl) + "\">continue to secure checkout</a>.";
      setTimeout(function () { window.location.href = HB.config.depositUrl; }, 1800);
    }).catch(function (ex) {
      if (window.console) console.error("Estimate send failed:", ex);
      buttons.forEach(function (b, i) { b.disabled = false; b.textContent = labels[i]; });
      textFallback(err, [
        "Hi Hercules, here's my moving estimate (" + ref + ").",
        "Name: " + (fn + " " + ln).trim(),
        "From: " + fromAddr, "To: " + toAddr, "Date: " + date,
        "Items: " + items.join(", "),
        "Estimate: " + money(c.total) + " (" + c.hours + " h, " + c.crew + " movers)"
      ], "Text Us My Estimate");
    });
  }

  /* ----------------------------------------------------------- rooms */

  var openRoom = null;

  function setupRooms() {
    var presets = $("presets"), chips = $("room-chips");
    (E.PRESETS || []).forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = p.name;
      b.addEventListener("click", function () { applyPreset(p, b); });
      presets.appendChild(b);
    });
    (E.ROOMS || []).forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.room = r.id;
      b.textContent = r.emoji + " " + r.name;
      b.addEventListener("click", function () {
        openRoom = openRoom === r.id ? null : r.id;
        renderRoom();
      });
      chips.appendChild(b);
    });
  }

  function applyPreset(p, fromEl) {
    if (state.played) resetTrip();
    var emojis = [];
    Object.keys(p.items).forEach(function (id) {
      if (!byId[id]) return;
      if (!state.items[id]) state.order.push(id);
      state.items[id] = (state.items[id] || 0) + p.items[id];
      if (emojis.length < 4) emojis.push(byId[id].emoji);
    });
    emojis.forEach(function (em, i) { setTimeout(function () { popIntoTruck(em); }, i * 250); });
    hudSay("📋 Added a typical " + p.name.toLowerCase() + " home. Adjust anything below.");
    render();
  }

  function renderRoom() {
    Array.prototype.forEach.call(document.querySelectorAll("#room-chips .chip"), function (b) {
      b.classList.toggle("on", b.dataset.room === openRoom);
    });
    var panel = $("room-panel"), room = (E.ROOMS || []).filter(function (r) { return r.id === openRoom; })[0];
    panel.hidden = !room;
    if (!room) return;
    panel.innerHTML = "";
    room.items.forEach(function (id) {
      var it = byId[id];
      if (!it) return;
      var q = state.items[id] || 0;
      var row = document.createElement("div");
      row.className = "ri" + (q ? " has" : "");
      row.innerHTML = '<span class="e">' + it.emoji + '</span><span class="nm">' + esc(it.name) + '</span><span class="step"><button type="button" aria-label="Fewer">−</button><b>' + q + '</b><button type="button" aria-label="More">+</button></span>';
      var btns = row.querySelectorAll("button");
      btns[0].addEventListener("click", function () { if (q > 0) setQty(id, q - 1); });
      btns[1].addEventListener("click", function () { addItem(it, 1, btns[1]); });
      panel.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------- setup */

  function showStep(id) {
    // The result card is shown and hidden by the move itself.
    Array.prototype.forEach.call(document.querySelectorAll(".est-step"), function (s) {
      if (s.id !== "step-result") s.hidden = s.id !== id;
    });
    $(id).hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    attachSuggest($("pickup"));
    attachSuggest($("dropoff"));
    $("where-go").addEventListener("click", startWhere);
    ["pickup", "dropoff"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); startWhere(); } });
    });
    $("st-add-stop").addEventListener("click", function () { addStopRow("", "stop"); });
    $("edit-where").addEventListener("click", function () {
      $("st-stops").innerHTML = "";
      state.stops.forEach(function (s) { addStopRow(s.text, s.kind); });
      document.body.classList.remove("has-scene");
      showStep("step-where");
      $("board").hidden = true;
      $("live").hidden = true;
      $("lane").hidden = true;
      $("step-result").hidden = true;
    });

    setupSearch();
    buildExtras();
    setupDrag();
    attachSuggest($("stop-input"));
    $("stop-add").addEventListener("click", addStop);
    $("stop-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addStop(); } });
    function go() {
      if (state.played) resetTrip();
      showEstimate();
    }
    $("go").addEventListener("click", go);
    $("go-live").addEventListener("click", go);
    $("send-form").addEventListener("submit", send);
    setupRooms();
    // Phones: the map is a pop-up opened from the strip.
    $("mm-open").addEventListener("click", function () {
      document.body.classList.add("map-open");
      E.minimap.resize();
    });
    $("mm-close").addEventListener("click", function () { document.body.classList.remove("map-open"); });
    $("send").addEventListener("click", function () { lastChoice = "deposit"; });
    $("send-plain").addEventListener("click", function () { lastChoice = "callback"; });
    $("reach-go").addEventListener("click", sendReach);
    $("reach-build").addEventListener("click", function () {
      $("reach-sent").hidden = true;
      document.querySelector("#step-where .two-btn").hidden = false;
      $("dropoff").focus();
    });
    // Arrival windows come from the shared booking config, like the homepage.
    ((HB.config && HB.config.arrivalWindows) || []).forEach(function (w) {
      var o = document.createElement("option");
      o.textContent = w;
      $("window").appendChild(o);
    });
    $("date").min = todayISO();
    $("date").addEventListener("focus", function () { $("date").min = todayISO(); });

    window.addEventListener("resize", function () { E.minimap.resize(); });
    E.minimap.init($("scene"));
    drawStrip();
    hudSay("📦 Add your items and watch your truck fill up");
  });
})();
