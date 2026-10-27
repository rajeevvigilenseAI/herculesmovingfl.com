window.HerculesEstimate = window.HerculesEstimate || {};

/**
 * Cartoon map of South Florida for the /estimate scene.
 *
 * Land, Lake Okeechobee and the Keys are simplified outlines in real
 * latitude/longitude, so the pickup and delivery pins land in the right place
 * and the view zooms to fit the route. The road between them is a gentle S
 * curve, nudged inland so it doesn't wander out to sea.
 *
 * Map units: 100 per degree of latitude, longitude scaled for ~26°N.
 */
(function () {
  "use strict";

  var LAT0 = 31, LON0 = -85.2, KX = 100 * Math.cos(26 * Math.PI / 180);

  function project(lat, lon) {
    return { x: (lon - LON0) * KX, y: (LAT0 - lat) * 100 };
  }

  // Florida peninsula, clockwise from the Georgia line on the Atlantic side.
  var COAST = [
    [31, -81.45], [30.3, -81.4], [29.6, -81.2], [29.2, -81.0], [28.6, -80.65], [28.2, -80.6],
    [27.8, -80.45], [27.45, -80.3], [27.2, -80.18], [26.95, -80.07], [26.7, -80.03], [26.45, -80.06],
    [26.3, -80.07], [26.1, -80.1], [25.95, -80.12], [25.82, -80.13], [25.76, -80.18], [25.69, -80.22],
    [25.6, -80.3], [25.45, -80.33], [25.33, -80.37], [25.22, -80.42], [25.15, -80.52], [25.13, -80.7],
    [25.14, -80.92], [25.2, -81.1], [25.35, -81.16], [25.55, -81.22], [25.8, -81.45], [25.9, -81.65],
    [26.1, -81.8], [26.35, -81.87], [26.5, -82.0], [26.7, -82.13], [27.0, -82.3], [27.4, -82.65],
    [27.9, -82.75], [28.5, -82.68], [29.0, -82.8], [29.6, -83.4], [30.0, -84.0], [30.0, -85.2], [31, -85.2]
  ];
  // Miami Beach to Sunny Isles barrier island.
  var BEACH = [[25.96, -80.115], [25.77, -80.125], [25.765, -80.135], [25.95, -80.125]];
  var KEYS = [[25.13, -80.43], [25.0, -80.55], [24.85, -80.8], [24.72, -81.05], [24.68, -81.35], [24.58, -81.6], [24.55, -81.8]];
  var LAKE = { lat: 26.95, lon: -80.8, rlat: 0.24, rlon: 0.28 };

  // Cartoon extras: [lat, lon, emoji or "hill", size px]
  var DECO = [
    [25.78, -80.2, "🏙️", 26], [26.12, -80.15, "🏙️", 22], [26.71, -80.07, "🏙️", 22], [26.36, -80.1, "🏘️", 18],
    [25.86, -80.72, "🐊", 22], [26.3, -80.85, "🐊", 18], [25.35, -80.75, "🦩", 20], [26.05, -81.3, "🌾", 18],
    [25.68, -80.38, "🌴", 18], [25.98, -80.3, "🌴", 18], [26.22, -80.24, "🌴", 18], [26.55, -80.16, "🌴", 18],
    [25.5, -80.47, "🌴", 18], [26.88, -80.14, "🌴", 18], [26.0, -80.18, "🌴", 16], [25.88, -80.26, "🌴", 16],
    [25.95, -80.5, "hill", 64], [26.42, -80.5, "hill", 76], [26.75, -80.4, "hill", 58], [25.62, -80.56, "hill", 70], [26.15, -80.62, "hill", 56],
    [25.9, -79.97, "🐬", 20], [26.52, -79.93, "🐬", 18], [25.55, -80.2, "🐬", 16],
    [25.66, -80.0, "⛵", 22], [26.28, -79.96, "⛵", 20], [26.85, -79.9, "⛵", 18], [25.75, -80.06, "🛳️", 24],
    [24.7, -81.0, "🏝️", 22], [24.56, -81.75, "🏝️", 20], [26.95, -80.8, "🐟", 16]
  ];

  function pts(list) {
    return list.map(function (p) { var q = project(p[0], p[1]); return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ");
  }

  // Fit a view around the points, at the scene's aspect ratio.
  function fit(points, aspect) {
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var w = x1 - x0, h = y1 - y0;
    var pad = Math.max(3, Math.max(w, h) * 0.12);
    w += pad * 2; h += pad * 2;
    // Always show some coast and neighbourhood, even for a same-city move.
    w = Math.max(w, 16); h = Math.max(h, 10);
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }

  // A soft S between two points, bowed inland (west) so it stays on land.
  function sPath(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len, k = Math.min(len * 0.28, 22);
    var west = -Math.min(len * 0.12, 8);
    var c1 = { x: a.x + dx / 3 + nx * k + west, y: a.y + dy / 3 + ny * k };
    var c2 = { x: a.x + 2 * dx / 3 - nx * k + west, y: a.y + 2 * dy / 3 - ny * k };
    return "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) +
      " C" + c1.x.toFixed(1) + " " + c1.y.toFixed(1) + " " + c2.x.toFixed(1) + " " + c2.y.toFixed(1) +
      " " + b.x.toFixed(1) + " " + b.y.toFixed(1);
  }

  /**
   * Draws the map into the scene. from/to are [lat, lon] or null (default
   * view of Miami to West Palm Beach). Far-away destinations are pulled in to
   * the edge of the view, and `far` says so for the label.
   */
  function draw(scene, from, to) {
    var svg = scene.querySelector("svg.map");
    var aspect = scene.clientWidth / Math.max(1, scene.clientHeight);
    var a = project.apply(null, from || [25.77, -80.19]);
    var b = project.apply(null, to || [26.71, -80.06]);
    var far = false;
    var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 140) {
      far = true;
      b = { x: a.x + (dx / dist) * 110, y: a.y + (dy / dist) * 110 };
    }
    var v = fit([a, b], aspect);
    // Fit the route into the part of the scene below the caption bar, with
    // room above each pin for its house and below for its label.
    var H = Math.max(1, scene.clientHeight), hud = scene.querySelector(".hud");
    var topPx = (hud ? hud.offsetHeight + 10 : 40) + 40, botPx = 22;
    var usable = Math.max(60, H - topPx - botPx);
    var newH = v.h * H / usable, cx = v.x + v.w / 2;
    v.y = v.y - newH * (topPx / H);
    v.h = newH;
    v.w = newH * aspect;
    v.x = cx - v.w / 2;
    svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h);

    svg.querySelector(".land").setAttribute("points", pts(COAST));
    svg.querySelector(".beach").setAttribute("points", pts(BEACH));
    var lake = project(LAKE.lat, LAKE.lon), lk = svg.querySelector(".lake");
    lk.setAttribute("cx", lake.x); lk.setAttribute("cy", lake.y);
    lk.setAttribute("rx", LAKE.rlon * KX); lk.setAttribute("ry", LAKE.rlat * 100);
    var keys = svg.querySelector(".keys");
    keys.innerHTML = KEYS.map(function (k) { var p = project(k[0], k[1]); return '<ellipse cx="' + p.x + '" cy="' + p.y + '" rx="5" ry="1.6"/>'; }).join("");

    var d = sPath(a, b);
    Array.prototype.forEach.call(svg.querySelectorAll(".route"), function (p) { p.setAttribute("d", d); });

    // Emoji and hills are HTML so they keep the same size at any zoom.
    var layer = scene.querySelector(".deco");
    layer.innerHTML = "";
    var ctm = svg.getScreenCTM(), box = scene.getBoundingClientRect(), pt = svg.createSVGPoint();
    if (!ctm) return { far: far };
    DECO.forEach(function (it) {
      var p = project(it[0], it[1]);
      if (p.x < v.x - 2 || p.x > v.x + v.w + 2 || p.y < v.y - 2 || p.y > v.y + v.h + 2) return;
      pt.x = p.x; pt.y = p.y;
      var s = pt.matrixTransform(ctm);
      var el = document.createElement("span");
      el.className = it[2] === "hill" ? "hill" : "em";
      if (it[2] !== "hill") el.textContent = it[2];
      el.style.left = (s.x - box.left) + "px";
      el.style.top = (s.y - box.top) + "px";
      el.style.fontSize = it[3] + "px";
      if (it[2] === "hill") { el.style.width = it[3] + "px"; el.style.height = it[3] * 0.5 + "px"; }
      if (/🐬|⛵|🛳️/.test(it[2])) el.classList.add("bob");
      layer.appendChild(el);
    });
    return { far: far };
  }

  window.HerculesEstimate.map = { draw: draw };
})();
