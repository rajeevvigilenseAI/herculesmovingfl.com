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
    stops: [], stopFractions: [],
    pack: null, kit: null,
    playing: false, played: false
  };

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion ? Math.min(ms, 150) : ms); }); }
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

  function startWhere() {
    var err = $("where-err");
    var fromText = $("pickup").value.trim(), toText = $("dropoff").value.trim();
    if (!fromText || !toText) { err.textContent = "Please enter both addresses."; return; }
    var a = HB.places && HB.places.locate(fromText);
    var b = HB.places && HB.places.locate(toText);
    if (!a || !b) {
      err.textContent = "We couldn't place " + (!a ? "the pickup" : "the delivery") + " address. Try adding the city or ZIP, or pick from the list.";
      return;
    }
    err.textContent = "";
    state.from = a; state.to = b; state.fromText = fromText; state.toText = toText;
    state.fromFloor = $("pickup-floor").value; state.toFloor = $("dropoff-floor").value;
    $("pick-name").textContent = shortPlace(fromText);
    updateRoute();
    renderFloors();
    document.body.classList.add("has-scene");
    showStep("step-items");
    $("board").hidden = false;
    $("live").hidden = false;
    land();
    render();
  }

  /* --------------------------------------------------------------- scene */

  var road, truck, truckBody, movers, hud, cargoFill;

  // The truck parks just past each house rather than on top of it.
  // Updated by parkSpots() whenever the map is drawn.
  var T_START = 0.06, T_END = 0.94;

  // Park the truck about 75 px down the road from each house, however long
  // the route is on screen, so it never sits on top of a house.
  function parkSpots() {
    var ctm = road.getScreenCTM(), len = road.getTotalLength();
    var px = ctm && len ? len * Math.abs(ctm.a) : 0;
    var k = px ? Math.min(0.35, 75 / px) : 0.06;
    T_START = k;
    T_END = 1 - k;
  }

  function pathPoint(t) {
    var len = road.getTotalLength();
    var p = road.getPointAtLength(len * t);
    var ctm = road.getScreenCTM(), box = $("scene").getBoundingClientRect();
    if (!ctm) return { x: 0, y: 0 };
    var pt = road.ownerSVGElement.createSVGPoint();
    pt.x = p.x; pt.y = p.y;
    var s = pt.matrixTransform(ctm);
    return { x: s.x - box.left, y: s.y - box.top };
  }

  // Pickup, extra pickups, extra drop-offs, delivery.
  function route() {
    var pick = state.stops.filter(function (s) { return s.kind === "pickup"; });
    var drop = state.stops.filter(function (s) { return s.kind === "dropoff"; });
    return pick.concat(drop);
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

  var lastMiniKey = "";

  function drawMap() {
    var core = window.HerculesQuoteCore;
    var mid = route();
    var res = E.road.draw($("scene"), legMiles());
    parkSpots();
    if (state.toText) $("drop-name").textContent = shortPlace(state.toText);

    // The small real map: the same places, with the actual driving route.
    // Only look the route up again when the places change, not on resize.
    var miniKey = [state.fromText, state.toText].concat(mid.map(function (s) { return s.text; })).join("|");
    if (state.from && state.to && E.minimap && core && miniKey !== lastMiniKey) {
      lastMiniKey = miniKey;
      var ll = function (a) { return core.resolveCoordinates(a); };
      E.minimap.show($("minimap"), [{ ll: ll(state.from), text: state.fromText, kind: "pick" }]
        .concat(mid.map(function (s) { return { ll: ll(s.addr), text: s.text, kind: "stop" }; }))
        .concat([{ ll: ll(state.to), text: state.toText, kind: "drop" }]));
    }

    // Pins for extra stops, and where along the road the truck pauses.
    Array.prototype.forEach.call(document.querySelectorAll(".home.stop"), function (el) { el.remove(); });
    state.stopFractions = [];
    mid.forEach(function (s, i) {
      var spot = res.screen && res.screen[i + 1];
      state.stopFractions.push(res.fractions ? res.fractions[i + 1] : (i + 1) / (mid.length + 1));
      if (!spot) return;
      var el = document.createElement("div");
      el.className = "home stop";
      el.innerHTML = '<span class="bld">📍</span><span class="tag"><b>' + (s.kind === "pickup" ? "⬆ " : "⬇ ") + esc(shortPlace(s.text)) + "</b></span>";
      el.style.left = spot.x + "px";
      el.style.top = spot.y + "px";
      $("scene").appendChild(el);
    });
  }

  // Miles for the whole route, then redraw. Called whenever stops change.
  function updateRoute() {
    var core = window.HerculesQuoteCore, legs = [state.from].concat(route().map(function (s) { return s.addr; })).concat([state.to]);
    var miles = 0;
    for (var i = 1; i < legs.length; i++) {
      try { miles += core.estimateMiles(legs[i - 1], legs[i], ""); } catch (e) {}
    }
    state.miles = miles;
    $("trip-miles").textContent = "~" + Math.round(miles) + " mi";
    $("trip-short").textContent = "~" + Math.round(miles) + " mi trip";
    $("stop-count").textContent = state.stops.length ? "· " + state.stops.length + " added" : "";
    var list = $("stop-list");
    list.innerHTML = "";
    state.stops.forEach(function (s, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="e">📍</span><span class="nm">' + (s.kind === "pickup" ? "Extra pickup: " : "Extra drop-off: ") + esc(HB.places ? HB.places.tidy(s.text) : s.text) +
        ' <small>' + money(PRICING.stopPrice) + '</small></span><button type="button" class="mv-btn">Remove ✕</button>';
      li.querySelector("button").addEventListener("click", function () { removeStop(i); });
      list.appendChild(li);
    });
    drawMap();
    placeEnds();
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
    hudSay("📍 " + (kind === "pickup" ? "Extra pickup" : "Extra drop-off") + " at " + shortPlace(text) + " added (+" + money(PRICING.stopPrice) + ")");
    updateRoute();
  }

  function removeStop(i) {
    if (state.played) resetTrip();
    state.stops.splice(i, 1);
    updateRoute();
  }

  function placeTruck(t, facingLeft) {
    var p = pathPoint(t);
    truck.style.left = p.x + "px";
    truck.style.top = p.y + "px";
    truckBody.style.transform = facingLeft ? "scaleX(1)" : "scaleX(-1)";
  }

  function placeEnds() {
    // Houses sit on each end of the road, nudged back inside the scene on
    // narrow screens so their labels never get cut off.
    var a = pathPoint(0), b = pathPoint(1), w = $("scene").clientWidth;
    [[$("home-pick"), a.x, a.y], [$("home-drop"), b.x, b.y]].forEach(function (h) {
      var half = h[0].offsetWidth / 2 + 4;
      h[0].style.left = Math.max(half, Math.min(w - half, h[1])) + "px";
      h[0].style.top = h[2] + "px";
    });
    if (!state.playing) placeTruck(state.played ? T_END : T_START, false);
  }

  function hudSay(text) {
    hud.textContent = text;
    hud.classList.remove("pop");
    void hud.offsetWidth;
    hud.classList.add("pop");
  }

  function dust(x, y, n) {
    var scene = $("scene");
    for (var i = 0; i < (n || 10); i++) {
      var d = document.createElement("span");
      d.className = "dust";
      d.textContent = i % 3 ? "●" : "💨";
      d.style.left = x + "px";
      d.style.top = y + "px";
      scene.appendChild(d);
      var ang = (Math.PI * (i / ((n || 10) - 1))) + Math.PI, dist = 30 + Math.random() * 40;
      var anim = d.animate([
        { transform: "translate(-50%,-50%) scale(.6)", opacity: 0.9 },
        { transform: "translate(" + (Math.cos(ang) * dist - 10) + "px," + (Math.sin(ang) * dist * 0.4 - 6) + "px) scale(1.6)", opacity: 0 }
      ], { duration: reduceMotion ? 1 : 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)" });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(d);
    }
  }

  function land() {
    placeEnds();
    truck.hidden = false;
    movers.classList.remove("here");
    hudSay("🚚 Your truck is on its way…");
    var drop = truckBody.animate([
      { transform: truckBody.style.transform + " translateY(-340px) rotate(-10deg)", offset: 0 },
      { transform: truckBody.style.transform + " translateY(0) rotate(0)", offset: 0.75 },
      { transform: truckBody.style.transform + " translateY(-14px)", offset: 0.87 },
      { transform: truckBody.style.transform + " translateY(0)", offset: 1 }
    ], { duration: reduceMotion ? 1 : 1100, easing: "cubic-bezier(.45,0,.55,1)" });
    // The timer is a safety net: some browsers pause animations in background
    // tabs, and the truck must never stay stuck in the sky.
    var landed = false;
    function touchdown() {
      if (landed) return;
      landed = true;
      drop.cancel();
      var p = pathPoint(T_START);
      dust(p.x, p.y + 6, 12);
      $("scene").classList.add("shake");
      setTimeout(function () { $("scene").classList.remove("shake"); }, 400);
      movers.classList.add("here");
      hudSay("💪 Truck landed! Your 2 movers are ready. Add your items below.");
      setTimeout(function () { $("item-search").focus({ preventScroll: true }); }, 50);
    }
    drop.onfinish = touchdown;
    setTimeout(touchdown, reduceMotion ? 10 : 1400);
  }

  function flyToTruck(emoji, fromEl, count) {
    var n = Math.min(count || 1, 5);
    var start = fromEl.getBoundingClientRect();
    var door = $("home-pick"), end = door.getBoundingClientRect();
    var walkers = Math.min(n, 2);
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var f = document.createElement("span");
          f.className = "fly";
          f.textContent = emoji;
          document.body.appendChild(f);
          var sx = start.left + start.width / 2, sy = start.top + start.height / 2;
          var ex = end.left + end.width / 2, ey = end.top + end.height / 2;
          var midY = Math.min(sy, ey) - 120;
          var a = f.animate([
            { transform: "translate(" + sx + "px," + sy + "px) scale(1)", opacity: 1 },
            { transform: "translate(" + (sx + ex) / 2 + "px," + midY + "px) scale(1.5) rotate(160deg)", opacity: 1, offset: 0.5 },
            { transform: "translate(" + ex + "px," + ey + "px) scale(.3) rotate(360deg)", opacity: 0.2 }
          ], { duration: reduceMotion ? 1 : 750, easing: "cubic-bezier(.3,.1,.3,1)" });
          var landedIn = false;
          function inTruck() {
            if (landedIn) return;
            landedIn = true;
            f.remove();
            // A mover picks it up at the door and walks it to the truck.
            if (i < walkers) carry(emoji, spotOf(door), truckSpot(), 0).then(gulp);
          }
          a.onfinish = inTruck;
          setTimeout(inTruck, 1000);
        }, i * 120);
      })(i);
    }
    if (reduceMotion) gulp();
  }

  function spotOf(el) {
    var s = $("scene").getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - s.left, y: r.bottom - s.top - 18 };
  }

  function truckSpot() {
    var s = $("scene").getBoundingClientRect(), r = truckBody.getBoundingClientRect();
    return { x: r.left + r.width / 2 - s.left, y: r.bottom - s.top - 4 };
  }

  // One mover walks from one spot to another with the item on his head. The
  // idle crew by the truck steps aside while anyone is walking.
  var walking = 0;
  function carry(emoji, from, to, delay) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var c = document.createElement("span");
        c.className = "carrier";
        c.innerHTML = "<i>" + emoji + "</i><b><span>🚶‍♂️</span></b>";
        // The walking emoji faces left; flip it when heading right.
        if (to.x > from.x) c.querySelector("b").style.transform = "scaleX(-1)";
        $("scene").appendChild(c);
        walking++;
        movers.classList.add("busy");
        var dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
        var ms = reduceMotion ? 1 : Math.max(700, Math.min(1600, dist * 11));
        var a = c.animate([
          { transform: "translate(" + from.x + "px," + from.y + "px) translate(-50%,-100%)", opacity: 0 },
          { transform: "translate(" + from.x + "px," + from.y + "px) translate(-50%,-100%)", opacity: 1, offset: 0.08 },
          { transform: "translate(" + to.x + "px," + to.y + "px) translate(-50%,-100%)", opacity: 1, offset: 0.92 },
          { transform: "translate(" + to.x + "px," + to.y + "px) translate(-50%,-100%) scale(.8)", opacity: 0 }
        ], { duration: ms, easing: "linear" });
        var done = false;
        function end() {
          if (done) return;
          done = true;
          c.remove();
          if (--walking <= 0) { walking = 0; movers.classList.remove("busy"); }
          resolve();
        }
        a.onfinish = end;
        setTimeout(end, ms + 300);
      }, delay || 0);
    });
  }

  function gulp() {
    truckBody.animate([
      { transform: truckBody.style.transform + " scale(1)" },
      { transform: truckBody.style.transform + " scale(1.18,.9)" },
      { transform: truckBody.style.transform + " scale(1)" }
    ], { duration: reduceMotion ? 1 : 260 });
  }

  // Unloading: a mover walks each item from the truck into the new home.
  function flyFromTruck(emoji, toEl, delay) {
    return carry(emoji, truckSpot(), spotOf(toEl), delay);
  }

  function tool(on, where) {
    var w = $("wrench");
    w.hidden = !on;
    if (on) {
      var p = pathPoint(where);
      w.style.left = p.x + "px";
      w.style.top = p.y - 58 + "px";
    }
  }

  function drive(ms, driveMin, from, to, minFrom, miFrom, miLeg) {
    from = from == null ? T_START : from;
    to = to == null ? T_END : to;
    minFrom = minFrom || 0;
    miFrom = miFrom || 0;
    miLeg = miLeg == null ? state.miles : miLeg;
    return new Promise(function (resolve) {
      // A plain timer rather than requestAnimationFrame, so the move still
      // finishes if the tab is in the background.
      var t0 = Date.now(), clock = $("clock"), lastX = null, timer;
      clock.hidden = false;
      function frame() {
        var k = Math.min(1, (Date.now() - t0) / ms);
        var eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        var p = pathPoint(from + (to - from) * eased);
        var left = lastX !== null && p.x < lastX;
        lastX = p.x;
        truck.style.left = p.x + "px";
        truck.style.top = p.y + "px";
        truckBody.style.transform = left ? "scaleX(1)" : "scaleX(-1)";
        if (Math.random() < 0.25) dust(p.x - 18, p.y + 8, 1);
        clock.textContent = "🕒 " + mins(minFrom + driveMin * eased) + " · " + Math.round(miFrom + miLeg * eased) + " mi";
        if (k >= 1) { clearInterval(timer); resolve(); }
      }
      if (reduceMotion) { placeTruck(to, false); resolve(); return; }
      timer = setInterval(frame, 16);
      frame();
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
    flyToTruck(it.emoji, fromEl, q);
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
    [["pick", state.fromFloor], ["drop", state.toFloor]].forEach(function (pair) {
      var f = floorInfo(pair[1]), el = $(pair[0] + "-floor");
      el.textContent = f.kind === "stairs" ? "🪜 " + ordinal(f.flights + 1) + " fl" : f.kind === "elevator" ? "🛗 Elevator" : "";
      el.hidden = f.kind === "ground";
      $("home-" + pair[0]).querySelector(".bld").textContent = f.kind === "ground" ? (pair[0] === "pick" ? "🏠" : "🏡") : "🏢";
    });
    $("floor-pick-edit").value = state.fromFloor;
    $("floor-drop-edit").value = state.toFloor;
  }

  function render() {
    var c = compute();

    // Cargo meter on the truck.
    cargoFill.style.width = Math.min(100, Math.round(c.fill * 100)) + "%";
    cargoFill.classList.toggle("over", c.fill > 1);
    $("cargo-text").textContent = Math.round(c.fill * 100) + "% full";
    $("mover-count").textContent = c.crew;
    // Extra movers join the crew in the scene, each carrying something.
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
      li.innerHTML = '<span class="e">📍</span><span class="nm">' + (s.kind === "pickup" ? "Extra pickup: " : "Extra drop-off: ") + esc(shortPlace(s.text)) + " <small>" + money(PRICING.stopPrice) + '</small></span><button type="button" class="mv-btn">Remove ✕</button>';
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
      if (zone === "inc") { flyToTruck(s.emoji, fromEl, 1); hudSay("📦 " + s.name + " added"); }
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
      if (zone === "inc") { flyToTruck("📦", fromEl, 2); hudSay("📦 " + k.name + " added"); }
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

  /* ------------------------------------------------------------ the move */

  function resetTrip() {
    state.played = false;
    $("step-result").hidden = true;
    document.body.classList.remove("reading");
    $("clock").hidden = true;
    truck.hidden = false;
    placeTruck(T_START, false);
    movers.classList.add("here");
    $("drop-pile").textContent = "";
    $("go").textContent = "🚚 Start the move ➜";
  }

  function playMove() {
    if (state.playing || !state.order.length) return;
    var c = compute();
    state.playing = true;
    $("go").disabled = true;
    document.getElementById("scene").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    var asmItems = state.order.filter(function (id) { return byId[id].asm; });
    var pf = floorInfo(state.fromFloor), df = floorInfo(state.toFloor);

    var steps = Promise.resolve()
      .then(function () { return sleep(500); })
      .then(function () {
        if (!c.packMin) return;
        hudSay("🧑‍🔧 Packing up your home (~" + mins(c.packMin) + ")");
        var house = $("home-pick");
        return Promise.all([0, 1, 2].map(function (i) { return carry("📦", spotOf(house), truckSpot(), i * 450); }));
      })
      .then(function () {
        if (!asmItems.length) return;
        tool(true, 0);
        hudSay("🔧 Taking apart " + asmItems.map(function (id) { return byId[id].name.toLowerCase(); }).slice(0, 3).join(", ") + " (~" + mins(c.asm * 0.4) + ")");
        return sleep(1800).then(function () { tool(false); });
      })
      .then(function () {
        if (pf.kind === "ground") return;
        $("home-pick").classList.add("climb");
        hudSay(pf.kind === "stairs" ? "🪜 Carrying everything down " + pf.flights + " flight" + (pf.flights > 1 ? "s" : "") + " (+" + mins(c.stairsPick) + ")" : "🛗 Riding the elevator down (+" + mins(c.stairsPick) + ")");
        return sleep(1700).then(function () { $("home-pick").classList.remove("climb"); });
      })
      .then(function () {
        hudSay("📦 Loading " + c.count + " items with pads & stretch wrap (~" + mins(c.load) + ")");
        gulp();
        return sleep(1400);
      })
      .then(function () {
        movers.classList.remove("here");
        var stops = route(), marks = [T_START].concat(state.stopFractions.map(function (f) {
          return Math.min(T_END - 0.02, Math.max(T_START + 0.02, f));
        })).concat([T_END]);
        var ms = Math.max(2600, Math.min(6500, 2200 + c.drive * 45)) + stops.length * 600;
        var legs = Promise.resolve(), done = 0;
        $("scene").classList.add("moving");
        hudSay("🛣️ Driving to " + (stops.length ? shortPlace(stops[0].text) : $("drop-name").textContent) + " (~" + mins(c.drive) + " total)");
        marks.slice(1).forEach(function (to, i) {
          var from = marks[i], share = (to - from) / (T_END - T_START);
          legs = legs.then(function () {
            var start = done;
            done += share;
            return drive(ms * share, c.drive * share, from, to, c.drive * start, state.miles * start, state.miles * share);
          }).then(function () {
            var s = stops[i];
            if (!s) return;
            movers.classList.add("here");
            hudSay(s.kind === "pickup" ? "⬆ Picking up at " + shortPlace(s.text) : "⬇ Dropping off at " + shortPlace(s.text));
            gulp();
            return sleep(1300).then(function () {
              movers.classList.remove("here");
              var next = stops[i + 1];
              hudSay("🛣️ Driving to " + (next ? shortPlace(next.text) : $("drop-name").textContent));
            });
          });
        });
        return legs.then(function () { $("scene").classList.remove("moving"); });
      })
      .then(function () {
        var p = pathPoint(T_END);
        dust(p.x, p.y + 6, 8);
        movers.classList.add("here");
        hudSay("📤 Unloading at " + $("drop-name").textContent + " (~" + mins(c.unload) + ")");
        var pile = $("drop-pile"), emojis = [];
        state.order.forEach(function (id) { emojis.push(byId[id].emoji); });
        var shown = emojis.slice(0, 6);
        return Promise.all(shown.map(function (em, i) {
          return flyFromTruck(em, $("home-drop"), i * 380).then(function () { pile.textContent += em; });
        }));
      })
      .then(function () {
        if (df.kind === "ground") return;
        $("home-drop").classList.add("climb");
        hudSay(df.kind === "stairs" ? "🪜 Carrying everything up " + df.flights + " flight" + (df.flights > 1 ? "s" : "") + " (+" + mins(c.stairsDrop) + ")" : "🛗 Riding the elevator up (+" + mins(c.stairsDrop) + ")");
        return sleep(1700).then(function () { $("home-drop").classList.remove("climb"); });
      })
      .then(function () {
        if (!asmItems.length) return;
        tool(true, 1);
        hudSay("🔧 Putting it all back together (~" + mins(c.asm * 0.6) + ")");
        return sleep(1800).then(function () { tool(false); });
      })
      .then(function () {
        hudSay("🎉 Moved in! About " + c.hours + " hours with " + c.crew + " movers.");
        confetti();
        state.playing = false;
        state.played = true;
        $("go").disabled = false;
        $("go").textContent = "🔁 Play it again";
        render();
        showResult(c);
      });
    return steps;
  }

  function confetti() {
    var scene = $("scene"), bits = ["🎉", "✨", "🎊", "⭐"];
    for (var i = 0; i < (reduceMotion ? 0 : 18); i++) {
      var s = document.createElement("span");
      s.className = "dust";
      s.textContent = bits[i % bits.length];
      s.style.left = Math.random() * 100 + "%";
      s.style.top = "-10px";
      scene.appendChild(s);
      var a = s.animate([
        { transform: "translateY(0) rotate(0)", opacity: 1 },
        { transform: "translateY(" + (scene.clientHeight + 20) + "px) rotate(" + (Math.random() * 720 - 360) + "deg)", opacity: 0.6 }
      ], { duration: 1600 + Math.random() * 1200, easing: "ease-in", delay: Math.random() * 400 });
      a.onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
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

  function openCallback() {
    showStep("step-callback");
    $("board").hidden = true;
    $("live").hidden = true;
    $("step-result").hidden = true;
    $("cb-date").min = todayISO();
    $("step-callback").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setTimeout(function () { $("cb-fn").focus({ preventScroll: true }); }, 300);
  }

  function backFromCallback() {
    if (state.from && state.to) {
      showStep("step-items");
      $("board").hidden = false;
      $("live").hidden = false;
    } else showStep("step-where");
  }

  function sendCallback() {
    var err = $("cb-err"), fn = $("cb-fn").value.trim(), ph = $("cb-ph").value.trim(), date = $("cb-date").value;
    if (!fn) { err.textContent = "Please enter your first name."; return; }
    if (!phoneOk(ph)) { err.textContent = "Please enter a valid phone number."; return; }
    if (date && date < todayISO()) { err.textContent = "Please pick today or a later date."; return; }
    err.textContent = "";
    var lead = shortLead("call me", fn, ph, {
      "Move date": date || "Not given",
      "Best time to call": $("cb-when").value,
      "Notes": $("cb-notes").value.trim() || "N/A"
    });
    var btn = $("cb-send");
    btn.disabled = true;
    btn.textContent = "Sending…";
    deliver(lead.payload).then(function () {
      $("cb-ref").textContent = lead.ref;
      $("cb-sent").hidden = false;
      btn.hidden = true;
      if (typeof fbq === "function") fbq("track", "Lead", { content_name: "Website estimate (call me)" }, { eventID: lead.ref });
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = "📞 Call me";
      textFallback(err, ["Hi Hercules, please call me about a move (" + lead.ref + ").", "Name: " + fn,
        "From: " + lead.payload["Moving from"], "To: " + lead.payload["Moving to"], "Date: " + (date || "not sure yet")], "Text Us Instead");
    });
  }

  // "Text me": saves the lead early, while the customer is still building.
  var assisted = false;
  function sendAssist() {
    var err = $("assist-err"), ph = $("assist-ph").value.trim();
    if (!phoneOk(ph)) { err.textContent = "Please enter a valid mobile number."; return; }
    err.textContent = "";
    if (assisted) return;
    var lead = shortLead("started", "", ph, { "Note": "Customer asked us to text them to help finish their estimate." });
    var btn = $("assist-go");
    btn.disabled = true;
    btn.textContent = "Sending…";
    deliver(lead.payload).then(function () {
      assisted = true;
      $("assist").innerHTML = "<p>✅ <b>Got it!</b> We'll text you shortly. Keep adding items if you like.</p>";
      if (!$("ph").value) $("ph").value = ph;
      hudSay("📲 Thanks! We'll text you to help finish up.");
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = "Text me";
      textFallback(err, ["Hi Hercules, can you help me finish my moving estimate? (" + lead.ref + ")",
        "From: " + lead.payload["Moving from"], "To: " + lead.payload["Moving to"]], "Text Us Instead");
    });
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
      "Extra stops": state.stops.length ? route().map(function (s) { return (s.kind === "pickup" ? "Extra pickup: " : "Extra drop-off: ") + (HB.places ? HB.places.tidy(s.text) : s.text); }).join("\n") : "None",
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
    emojis.forEach(function (em, i) { setTimeout(function () { flyToTruck(em, fromEl, 1); }, i * 200); });
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
    road = $("road-path");
    truck = $("truck");
    truckBody = truck.querySelector(".body");
    movers = $("movers");
    hud = $("hud");
    cargoFill = $("cargo-fill");

    attachSuggest($("pickup"));
    attachSuggest($("dropoff"));
    $("where-go").addEventListener("click", startWhere);
    ["pickup", "dropoff"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); startWhere(); } });
    });
    $("edit-where").addEventListener("click", function () {
      document.body.classList.remove("has-scene");
      showStep("step-where");
      $("board").hidden = true;
      $("live").hidden = true;
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
      playMove();
      render();
    }
    $("go").addEventListener("click", go);
    $("go-live").addEventListener("click", go);
    $("send-form").addEventListener("submit", send);
    setupRooms();
    $("mm-toggle").addEventListener("click", function () {
      var mm = $("minimap");
      mm.classList.toggle("big");
      this.textContent = mm.classList.contains("big") ? "✕" : "⤢";
      E.minimap.resize();
    });
    $("send").addEventListener("click", function () { lastChoice = "deposit"; });
    $("send-plain").addEventListener("click", function () { lastChoice = "callback"; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-callme]"), function (b) { b.addEventListener("click", openCallback); });
    $("cb-send").addEventListener("click", sendCallback);
    $("cb-back").addEventListener("click", backFromCallback);
    $("assist-go").addEventListener("click", sendAssist);
    $("assist-ph").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendAssist(); } });
    // Arrival windows come from the shared booking config, like the homepage.
    ((HB.config && HB.config.arrivalWindows) || []).forEach(function (w) {
      var o = document.createElement("option");
      o.textContent = w;
      $("window").appendChild(o);
    });
    $("date").min = todayISO();
    $("date").addEventListener("focus", function () { $("date").min = todayISO(); });

    window.addEventListener("resize", function () { drawMap(); placeEnds(); });
    drawMap();
    placeEnds();
    truck.hidden = true;
    hudSay("📍 Tell us where you're moving to call your truck");
  });
})();
