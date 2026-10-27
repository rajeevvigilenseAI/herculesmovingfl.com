window.HerculesEstimate = window.HerculesEstimate || {};

/**
 * The animated scene for /estimate: an illustrated South Florida road, not a
 * map. Sky, ocean with boats, a distant skyline, hills and palms, and a
 * rolling road from the pickup house to the delivery house. Nothing here is
 * to scale; the real route is on the small map (minimap.js).
 *
 * The scenery layers repeat side by side, so the scene can scroll them past
 * (class "moving" on the scene) while the truck drives.
 */
(function () {
  "use strict";

  // Each layer is drawn twice, side by side, so it can loop while scrolling.
  var FAR = ["🏙️", "⛵", "🌴", "🐬", "🛳️", "🏙️", "⛵", "🌴"];
  var MID = ["hill", "🌴", "🌴", "hill", "🌴", "🏘️", "hill", "🌴"];

  // Horizontal: items spread along the width. Vertical: along the height,
  // with the far layer (boats, dolphins) kept inside the ocean on the right
  // and the mid layer (hills, palms) on the land either side of the road.
  function fillLayer(el, items, top, size, spread, vertical, far) {
    el.innerHTML = "";
    for (var copy = 0; copy < 2; copy++) {
      items.forEach(function (it, i) {
        var s = document.createElement("span");
        var along = (copy * 100 + (i + 0.5) * (100 / items.length)) / 2;
        if (vertical) {
          s.style.top = along + "%";
          s.style.left = (far ? 80 + ((i * 7) % 14) : (i % 2 ? 8 + ((i * 11) % 16) : 58 + ((i * 5) % 10))) + "%";
        } else {
          s.style.left = along + "%";
          s.style.top = top + ((i * 37) % spread) + "%";
        }
        if (it === "hill") {
          s.className = "hill";
          s.style.width = size * 3.2 + "px";
          s.style.height = size * 1.4 + "px";
        } else {
          s.className = "em" + (/⛵|🐬|🛳️/.test(it) ? " bob" : "");
          s.textContent = it;
          s.style.fontSize = size + "px";
        }
        el.appendChild(s);
      });
    }
  }

  /**
   * Draws the road. `legs` are the miles of each leg of the route (pickup to
   * delivery, with any extra stops between), used to space the stops along
   * the road. Returns where each stop sits on screen and how far along the
   * road it is (0 to 1).
   */
  function draw(scene, legs) {
    var W = Math.max(1, scene.clientWidth), H = Math.max(1, scene.clientHeight);
    var svg = scene.querySelector("svg.map");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    // Tall, narrow scene (beside the form): the road runs top to bottom along
    // the coast. Short, wide strip (phones): it runs left to right.
    var vertical = H > W * 1.1, small = Math.min(W, H) < 200;
    scene.classList.toggle("vertical", vertical);
    var key = (vertical ? "v" : "h") + (small ? "s" : "");
    if (scene.dataset.scenery !== key) {
      scene.dataset.scenery = key;
      var size = small ? 16 : 24;
      fillLayer(scene.querySelector(".layer-far"), FAR, 4, size, 20, vertical, true);
      fillLayer(scene.querySelector(".layer-mid"), MID, small ? 6 : 18, size, small ? 14 : 30, vertical, false);
    }

    var d = "", steps = 60, i, t;
    if (vertical) {
      // Leave the top for the caption bar; wiggle gently left and right.
      var top = H * 0.27, bottom = H * 0.9, cx = W * 0.4, wig = Math.min(30, W * 0.11);
      for (i = 0; i <= steps; i++) {
        t = i / steps;
        d += (i ? " L" : "M") + (cx + wig * Math.sin(t * Math.PI * 3)).toFixed(1) + " " + (top + (bottom - top) * t).toFixed(1);
      }
    } else {
      // A rolling road across the lower part of the scene: gentle hills.
      var x0 = W * 0.09, x1 = W * 0.91, y0 = H * (small ? 0.8 : 0.76), amp = Math.min(small ? 8 : 22, H * 0.06);
      var waves = W > 700 ? 2 : 1.5;
      for (i = 0; i <= steps; i++) {
        t = i / steps;
        d += (i ? " L" : "M") + (x0 + (x1 - x0) * t).toFixed(1) + " " + (y0 - amp * Math.sin(t * Math.PI * 2 * waves)).toFixed(1);
      }
    }
    Array.prototype.forEach.call(svg.querySelectorAll(".route"), function (el) { el.setAttribute("d", d); });

    // Space the stops by the miles of each leg, but never bunch them up.
    legs = legs && legs.length ? legs : [1];
    var n = legs.length, total = legs.reduce(function (a, b) { return a + (b || 0); }, 0);
    var fractions = [0], acc = 0;
    for (var j = 0; j < n - 1; j++) {
      acc += total > 0 ? (legs[j] || 0) / total : 1 / n;
      var even = (j + 1) / n;
      fractions.push(Math.max(0.15, Math.min(0.85, (acc + even) / 2)));
    }
    fractions.push(1);

    var path = svg.querySelector(".route-dash"), len = path.getTotalLength();
    var screen = fractions.map(function (f) {
      var p = path.getPointAtLength(len * f);
      return { x: p.x, y: p.y };
    });
    return { fractions: fractions, screen: screen, far: false };
  }

  window.HerculesEstimate.road = { draw: draw };
})();
