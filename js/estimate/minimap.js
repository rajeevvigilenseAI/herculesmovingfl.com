window.HerculesEstimate = window.HerculesEstimate || {};

/**
 * The real route map on /estimate: both addresses (and any extra stops)
 * with the actual driving route, so the customer can see we understood
 * where they are. Before addresses are entered it shows the service area.
 *
 * Free services, all swappable in SERVICES below:
 *   - map tiles: OpenStreetMap (attribution required, fair-use limits)
 *   - route line: OSRM public server; falls back to a straight dashed line
 *   - exact pins for street addresses: Nominatim; falls back to the city/ZIP
 *     point the price uses
 * The price does not depend on any of these; it uses quote-core.js.
 */
(function () {
  "use strict";

  var SERVICES = {
    leafletJs: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    leafletCss: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    route: function (pts) {
      return "https://router.project-osrm.org/route/v1/driving/" +
        pts.map(function (p) { return p[1].toFixed(5) + "," + p[0].toFixed(5); }).join(";") +
        "?overview=simplified&geometries=geojson";
    },
    geocode: function (text) {
      return "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(text);
    }
  };

  var loading = null, map = null, layer = null, geoCache = {}, drawId = 0, lastBounds = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = SERVICES.leafletCss;
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = SERVICES.leafletJs;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  // Exact pin for something that looks like a street address; otherwise the
  // city/ZIP point we already have.
  function pinFor(p) {
    if (!/\d+\s+\S+/.test(p.text || "") || /^\d{5}$/.test((p.text || "").trim())) return Promise.resolve(p.ll);
    var key = p.text.toLowerCase().trim();
    if (geoCache[key]) return Promise.resolve(geoCache[key]);
    return fetch(SERVICES.geocode(p.text + (/\bfl\b|florida/i.test(p.text) ? "" : ", Florida")))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var hit = j && j[0] ? [parseFloat(j[0].lat), parseFloat(j[0].lon)] : null;
        // Ignore a match that lands far from the city/ZIP we matched (~30 mi).
        if (hit && Math.abs(hit[0] - p.ll[0]) + Math.abs(hit[1] - p.ll[1]) < 0.5) {
          geoCache[key] = hit;
          return hit;
        }
        return p.ll;
      })
      .catch(function () { return p.ll; });
  }

  function icon(emoji, cls) {
    return window.L.divIcon({ className: "mm-pin " + (cls || ""), html: "<span>" + emoji + "</span>", iconSize: [26, 26], iconAnchor: [13, 24] });
  }

  // Creates the map once. Page scrolling is never hijacked: no scroll-wheel
  // zoom, and on phones one finger scrolls the page rather than the map.
  function ensureMap(el) {
    return loadLeaflet().then(function () {
      var L = window.L;
      if (!map) {
        map = L.map(el.querySelector(".mm-map"), {
          zoomControl: true, attributionControl: true, scrollWheelZoom: false,
          dragging: !L.Browser.mobile, tap: false
        });
        map.zoomControl.setPosition("bottomright");
        L.tileLayer(SERVICES.tiles, { maxZoom: 18, attribution: SERVICES.attribution }).addTo(map);
        map.attributionControl.setPrefix("");
        layer = L.layerGroup().addTo(map);
      }
      return L;
    });
  }

  // Before any addresses: Miami-Dade, Broward and Palm Beach.
  function init(el) {
    if (!el) return;
    ensureMap(el).then(function () {
      if (!lastBounds) map.fitBounds([[25.45, -80.5], [26.95, -80.03]]);
    }).catch(function () { /* the map simply stays blank */ });
  }

  /**
   * points: [{ ll: [lat, lon], text, kind: "pick" | "stop" | "drop" }]
   */
  function show(el, points) {
    if (!el || !points || points.length < 2 || !points[0].ll || !points[points.length - 1].ll) return;
    var id = ++drawId;
    ensureMap(el).then(function (L) {
      return Promise.all(points.map(pinFor)).then(function (lls) {
        if (id !== drawId) return;
        layer.clearLayers();
        lls.forEach(function (ll, i) {
          var p = points[i];
          var em = p.kind === "pick" ? "🏠" : p.kind === "drop" ? "🏡" : "📍";
          L.marker(ll, { icon: icon(em, p.kind), keyboard: false }).addTo(layer);
        });
        var straight = L.polyline(lls, { color: "#F07F22", weight: 3, dashArray: "6 6", opacity: 0.9 }).addTo(layer);
        map.invalidateSize();
        lastBounds = straight.getBounds();
        map.fitBounds(lastBounds, { padding: [22, 22], maxZoom: 14 });
        // Swap the dashed line for the real driving route when it arrives.
        return fetch(SERVICES.route(lls)).then(function (r) { return r.json(); }).then(function (j) {
          if (id !== drawId || !j || !j.routes || !j.routes[0]) return;
          var coords = j.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
          layer.removeLayer(straight);
          L.polyline(coords, { color: "#13294B", weight: 6, opacity: 0.35 }).addTo(layer);
          L.polyline(coords, { color: "#F07F22", weight: 4 }).addTo(layer);
          lastBounds = L.latLngBounds(coords).extend(lls);
          map.fitBounds(lastBounds, { padding: [22, 22], maxZoom: 14 });
        }).catch(function () { /* keep the dashed line */ });
      });
    }).catch(function () { /* the map simply stays blank */ });
  }

  // After the map box changes size, refit the route.
  function resize() {
    if (!map) return;
    setTimeout(function () {
      map.invalidateSize();
      if (lastBounds) map.fitBounds(lastBounds, { padding: [22, 22], maxZoom: 14 });
    }, 280);
  }

  window.HerculesEstimate.minimap = { init: init, show: show, resize: resize };
})();
