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
    truckCuft: 1700,
    // PLACEHOLDERS: confirm with the office before relying on these.
    pricePerHourAfter8: 150,
    extraMoverPerHour: 60,
    supplies: [
      { id: "tvbox", name: "TV box", emoji: "📺", price: 40, from: ["tv-small", "tv-large"] },
      { id: "wardrobe", name: "Wardrobe box", emoji: "👔", price: 20, from: ["clothes"] },
      { id: "large", name: "Large boxes (empty)", emoji: "📦", price: 5 },
      { id: "medium", name: "Medium boxes (empty)", emoji: "📦", price: 4 },
      { id: "small", name: "Small boxes (empty)", emoji: "📦", price: 3 },
      { id: "fragile", name: "Fragile packing kit (dishes, glass, art)", emoji: "🥂", price: 45, flag: "fragile" },
      { id: "mattressbag", name: "Mattress bag", emoji: "🛏️", price: 15, from: ["king-bed", "queen-bed", "full-bed", "bunk-bed", "mattress"] }
    ],
    // Things we quote by phone; ticking them adds them to the request.
    onCall: [
      { id: "packing", name: "Full packing service (we pack for you)", emoji: "🧑‍🔧" },
      { id: "crating", name: "Custom crating (marble, glass, art)", emoji: "🪵" },
      { id: "storage", name: "Storage between moves", emoji: "🏬" },
      { id: "extrastop", name: "An extra pickup or drop-off stop", emoji: "📍" },
      { id: "longcarry", name: "Long walk from truck to door (75+ ft)", emoji: "🚶" },
      { id: "junk", name: "Junk or donation drop-off", emoji: "♻️" }
    ]
  };

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
    supplies: {}, onCall: {},
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

    var totalMin = load + unload + asm + stairsPick + stairsDrop + drive;
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

    return {
      count: count, cuft: cuft, fill: cuft / PRICING.truckCuft,
      load: load, unload: unload, asm: asm, stairsPick: stairsPick, stairsDrop: stairsDrop, drive: drive,
      totalMin: totalMin, hours: hours, crew: crew, heaviest: heaviest,
      base: base || 0, extraMovers: extraMovers, supplies: supplies, supplyLines: supplyLines,
      total: (base || 0) + extraMovers + supplies
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
    try { state.miles = window.HerculesQuoteCore.estimateMiles(a, b, ""); } catch (e) { state.miles = 0; }

    $("pick-name").textContent = shortPlace(fromText);
    drawMap();
    $("trip-miles").textContent = "~" + Math.round(state.miles) + " mi";
    renderFloors();
    document.body.classList.add("has-scene");
    showStep("step-items");
    land();
    render();
  }

  /* --------------------------------------------------------------- scene */

  var road, truck, truckBody, movers, hud, cargoFill;

  // The truck parks just past each house rather than on top of it.
  // Updated by parkSpots() whenever the map is drawn.
  var T_START = 0.06, T_END = 0.94;

  // Park the truck about 50 px down the road from each house, however long
  // the route is on screen, so it never sits on top of a house.
  function parkSpots() {
    var ctm = road.getScreenCTM(), len = road.getTotalLength();
    var px = ctm && len ? len * Math.abs(ctm.a) : 0;
    var k = px ? Math.min(0.35, 50 / px) : 0.06;
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

  function drawMap() {
    var core = window.HerculesQuoteCore;
    function ll(a) { return a && core ? core.resolveCoordinates(a) : null; }
    var res = E.map.draw($("scene"), ll(state.from), ll(state.to));
    parkSpots();
    if (state.toText) $("drop-name").textContent = shortPlace(state.toText) + (res.far ? " ➚" : "");
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
    var end = truck.getBoundingClientRect();
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
            gulp();
          }
          a.onfinish = inTruck;
          setTimeout(inTruck, 1000);
        }, i * 120);
      })(i);
    }
    if (reduceMotion) gulp();
  }

  function gulp() {
    truckBody.animate([
      { transform: truckBody.style.transform + " scale(1)" },
      { transform: truckBody.style.transform + " scale(1.18,.9)" },
      { transform: truckBody.style.transform + " scale(1)" }
    ], { duration: reduceMotion ? 1 : 260 });
  }

  function flyFromTruck(emoji, toEl, delay) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var s = truck.getBoundingClientRect(), t = toEl.getBoundingClientRect();
        var f = document.createElement("span");
        f.className = "fly";
        f.textContent = emoji;
        document.body.appendChild(f);
        var sx = s.left + s.width / 2, sy = s.top + s.height / 2, ex = t.left + t.width / 2, ey = t.top + t.height / 2;
        var a = f.animate([
          { transform: "translate(" + sx + "px," + sy + "px) scale(.4)", opacity: 0.4 },
          { transform: "translate(" + (sx + ex) / 2 + "px," + (Math.min(sy, ey) - 70) + "px) scale(1.3)", opacity: 1, offset: 0.5 },
          { transform: "translate(" + ex + "px," + ey + "px) scale(.5)", opacity: 0 }
        ], { duration: reduceMotion ? 1 : 650, easing: "ease-in-out" });
        var finished = false;
        function end() { if (finished) return; finished = true; f.remove(); resolve(); }
        a.onfinish = end;
        setTimeout(end, 900);
      }, delay || 0);
    });
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

  function drive(ms, driveMin) {
    return new Promise(function (resolve) {
      // A plain timer rather than requestAnimationFrame, so the move still
      // finishes if the tab is in the background.
      var t0 = Date.now(), clock = $("clock"), lastX = null, timer;
      clock.hidden = false;
      function frame() {
        var k = Math.min(1, (Date.now() - t0) / ms);
        var eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        var p = pathPoint(T_START + (T_END - T_START) * eased);
        var left = lastX !== null && p.x < lastX;
        lastX = p.x;
        truck.style.left = p.x + "px";
        truck.style.top = p.y + "px";
        truckBody.style.transform = left ? "scaleX(1)" : "scaleX(-1)";
        if (Math.random() < 0.25) dust(p.x - 18, p.y + 8, 1);
        clock.textContent = "🕒 " + mins(driveMin * eased) + " · " + Math.round(state.miles * eased) + " mi";
        if (k >= 1) { clearInterval(timer); resolve(); }
      }
      if (reduceMotion) { placeTruck(T_END, false); resolve(); return; }
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
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="e">' + it.emoji + '</span><span class="nm">' + esc(it.name) +
        (it.asm ? ' <small>🔧 take apart &amp; rebuild</small>' : "") +
        (crewForWeight(it.lbs) > 2 ? ' <small class="hv">💪 ' + crewForWeight(it.lbs) + "-person lift</small>" : "") +
        '</span><span class="step"><button type="button" aria-label="Fewer">−</button><b>' + q +
        '</b><button type="button" aria-label="More">+</button></span>';
      var btns = li.querySelectorAll("button");
      btns[0].addEventListener("click", function () { setQty(id, q - 1); });
      btns[1].addEventListener("click", function () { setQty(id, q + 1); });
      mine.appendChild(li);
    });
    $("my-items-empty").hidden = state.order.length > 0;
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

    // Not included: packing supplies with suggestions.
    PRICING.supplies.forEach(function (s) {
      var row = $("sup-" + s.id), q = state.supplies[s.id] || 0;
      row.querySelector("b").textContent = q;
      row.classList.toggle("on", q > 0);
      var hint = row.querySelector(".sug"), sug = suggestFor(s);
      if (sug && sug > q) {
        hint.hidden = false;
        hint.textContent = "Suggested: " + sug;
        hint.onclick = function () { state.supplies[s.id] = sug; render(); };
      } else hint.hidden = true;
    });

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

  function buildExtras() {
    var ul = $("supplies");
    PRICING.supplies.forEach(function (s) {
      var li = document.createElement("li");
      li.id = "sup-" + s.id;
      li.innerHTML = '<span class="e">' + s.emoji + '</span><span class="nm">' + esc(s.name) +
        ' <small>' + money(s.price) + ' each</small> <button type="button" class="sug" hidden></button></span>' +
        '<span class="step"><button type="button" aria-label="Fewer">−</button><b>0</b><button type="button" aria-label="More">+</button></span>';
      var btns = li.querySelectorAll(".step button");
      btns[0].addEventListener("click", function () { state.supplies[s.id] = Math.max(0, (state.supplies[s.id] || 0) - 1); render(); });
      btns[1].addEventListener("click", function () { state.supplies[s.id] = Math.min(200, (state.supplies[s.id] || 0) + 1); render(); });
      ul.appendChild(li);
    });
    var oc = $("oncall");
    PRICING.onCall.forEach(function (o) {
      var li = document.createElement("li");
      li.innerHTML = '<label><input type="checkbox"> <span class="e">' + o.emoji + "</span> " + esc(o.name) + " <small>Quoted by phone</small></label>";
      li.querySelector("input").addEventListener("change", function (e) { state.onCall[o.id] = e.target.checked; });
      oc.appendChild(li);
    });
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
        hudSay("🛣️ Driving to " + $("drop-name").textContent + " (~" + mins(c.drive) + ")");
        var ms = Math.max(2600, Math.min(6500, 2200 + c.drive * 45));
        return drive(ms, c.drive);
      })
      .then(function () {
        var p = pathPoint(T_END);
        dust(p.x, p.y + 6, 8);
        movers.classList.add("here");
        hudSay("📤 Unloading at " + $("drop-name").textContent + " (~" + mins(c.unload) + ")");
        var pile = $("drop-pile"), emojis = [];
        state.order.forEach(function (id) { emojis.push(byId[id].emoji); });
        var shown = emojis.slice(0, 10);
        return Promise.all(shown.map(function (em, i) {
          return flyFromTruck(em, $("home-drop"), i * 160).then(function () { pile.textContent += em; });
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
    if (c.supplies) price.push(["📦 Packing supplies", c.supplies]);
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

  function send(e) {
    e.preventDefault();
    var err = $("send-err");
    var fn = $("fn").value.trim(), ln = $("ln").value.trim(), ph = $("ph").value.trim(), em = $("em").value.trim();
    var date = $("date").value, flex = $("flex").checked;
    if (!fn) { err.textContent = "Please enter your first name."; return; }
    if (ph.replace(/\D/g, "").length < 10) { err.textContent = "Please enter a valid phone number."; return; }
    if (em && !/^\S+@\S+\.\S+$/.test(em)) { err.textContent = "Please check your email address."; return; }
    if (!date) { err.textContent = "Please pick a move date. A rough one is fine, tick flexible if it can change."; return; }
    if (date < todayISO()) { err.textContent = "Please pick today or a later date."; return; }
    if ($("hp").value) return;
    err.textContent = "";

    var c = compute(), ref = buildReference(), source = leadSource();
    var tidy = HB.places ? HB.places.tidy : function (t) { return t; };
    var fromAddr = tidy(state.fromText), toAddr = tidy(state.toText);
    var itemLines = state.order.map(function (id) { return state.items[id] + " × " + byId[id].name; });
    var asks = PRICING.onCall.filter(function (o) { return state.onCall[o.id]; }).map(function (o) { return o.name; });

    var payload = {
      "_subject": "Your Hercules Movers move request | Website estimate | " + (fn + " " + ln).trim() + " | " + fromAddr + " → " + toAddr + " (" + ref + ")",
      "_template": "table",
      "_captcha": "false",
      "Lead type": "Website estimate",
      "Name": (fn + " " + ln).trim(),
      "Phone": ph,
      "Email": em || "N/A",
      "Moving from": fromAddr + " · " + floorInfo(state.fromFloor).label,
      "Moving to": toAddr + " · " + floorInfo(state.toFloor).label,
      "Move date": date,
      "Date flexible": flex ? "Yes" : "No",
      "Approx. distance": "~" + Math.round(state.miles) + " miles",
      "Items": itemLines.join("\n"),
      "Item count": c.count + " items, ~" + Math.round(c.cuft) + " cu ft (" + Math.round(c.fill * 100) + "% of a 26 ft truck)",
      "Crew": c.crew + " movers" + (c.heaviest && c.crew > 2 ? " (heaviest: " + c.heaviest.name + ", ~" + c.heaviest.lbs + " lbs)" : ""),
      "Time breakdown": "Take apart " + mins(c.asm * 0.4) + " · Load " + mins(c.load) + " · Pickup stairs " + mins(c.stairsPick) +
        " · Drive " + mins(c.drive) + " · Unload " + mins(c.unload) + " · Delivery stairs " + mins(c.stairsDrop) + " · Rebuild " + mins(c.asm * 0.6),
      "Estimated hours": c.hours + " (" + mins(c.totalMin) + " of work)",
      "Base price": money(c.base),
      "Extra movers": c.extraMovers ? money(c.extraMovers) : "None",
      "Packing supplies": c.supplyLines.length ? c.supplyLines.join("\n") : "None",
      "Quote by phone": asks.length ? asks.join(", ") : "None",
      "Estimated total": money(c.total),
      "Notes": $("notes").value.trim() || "N/A",
      "Lead source": source,
      "Page": location.origin + location.pathname,
      "Reference": ref
    };
    if (em) payload._replyto = em;

    var btn = $("send");
    btn.disabled = true;
    btn.textContent = "Sending…";

    function done() {
      $("send-form").hidden = true;
      $("sent-ref").textContent = ref;
      $("sent").hidden = false;
      if (typeof fbq === "function") fbq("track", "Lead", { content_name: "Website estimate", value: c.total, currency: "USD" }, { eventID: ref });
    }
    function textUs() {
      btn.disabled = false;
      btn.textContent = "📲 Send my estimate";
      var href = HB.textUsHref ? HB.textUsHref([
        "Hi Hercules, here's my moving estimate (" + ref + ").",
        "Name: " + (fn + " " + ln).trim(),
        "From: " + fromAddr, "To: " + toAddr, "Date: " + date,
        "Items: " + itemLines.join(", "),
        "Estimate: " + money(c.total) + " (" + c.hours + " h, " + c.crew + " movers)"
      ]) : "sms:+17543542008";
      err.innerHTML = "We couldn't send it from this browser. Tap below to text it to us, it's already filled in:" +
        '<a class="btn go" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="' + href + '">Text Us My Estimate</a>';
    }

    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 15000); });
    Promise.race([fetch(FORMSUBMIT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }), timeout])
      .then(function (r) {
        return r.json().then(function (j) { if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "Send failed"); });
      })
      .then(done)
      .catch(function (ex) {
        if (!HB.sendBackup) throw ex;
        return HB.sendBackup(Object.assign({}, payload, { "Send note": "FormSubmit failed: " + (ex && ex.message) })).then(done);
      })
      .catch(function (ex) {
        if (window.console) console.error("Estimate send failed:", ex);
        textUs();
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
      $("step-result").hidden = true;
    });

    setupSearch();
    buildExtras();
    $("go").addEventListener("click", function () {
      if (state.played) resetTrip();
      playMove();
    });
    $("send-form").addEventListener("submit", send);
    $("date").min = todayISO();
    $("date").addEventListener("focus", function () { $("date").min = todayISO(); });

    window.addEventListener("resize", function () { drawMap(); placeEnds(); });
    drawMap();
    placeEnds();
    truck.hidden = true;
    hudSay("📍 Tell us where you're moving to call your truck");
  });
})();
