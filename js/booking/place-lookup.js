window.HerculesBooking = window.HerculesBooking || {};

/**
 * City/ZIP suggestions, address matching and address tidying, shared by pages
 * that take free-text locations. Copied from the /quote page script (which
 * still carries its own copy) so behaviour is identical. Needs quote-core.js.
 */
(function () {
  "use strict";

  var places = null;
  function titleCase(s) { return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function buildPlaces(core) {
    var list = [], cityAt = {};
    Object.keys(core.CITY_COORDS).forEach(function (st) {
      var seen = [];
      Object.keys(core.CITY_COORDS[st]).forEach(function (name) {
        var c = core.CITY_COORDS[st][name];
        if (seen.indexOf(c) >= 0) return; // aliases like "ft lauderdale"
        seen.push(c);
        var label = titleCase(name) + ", " + st;
        if (st === "FL") cityAt[c.join()] = label;
        list.push({ key: name, label: label, fl: st === "FL" });
      });
    });
    Object.keys(core.ZIP5_COORDS).forEach(function (zip) {
      var city = cityAt[core.ZIP5_COORDS[zip].join()];
      if (city) list.push({ key: zip, label: zip + ", " + city, fl: true, zip: true });
    });
    return list;
  }
  function suggest(q) {
    q = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (q.length < 2) return [];
    var digits = /^\d+$/.test(q), starts = [], inside = [];
    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (!!p.zip !== digits) continue;
      if (p.key.indexOf(q) === 0) starts.push(p);
      else if (!digits && p.key.indexOf(" " + q) > 0) inside.push(p);
    }
    function fl(a, b) { return (b.fl ? 1 : 0) - (a.fl ? 1 : 0); }
    return starts.sort(fl).concat(inside.sort(fl)).slice(0, 6);
  }


  var STATE_NAMES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC"
  };

  // Customers type anything: "Miami", "33301", "Atlanta, GA", "Texas".
  // Returns an address the core can resolve, or null when nothing matches.
  function locate(core, text) {
    var raw = String(text || "").trim();
    var words = " " + raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
    var state = "";
    var code = /(?:^|[\s,])([A-Za-z]{2})(?:\s+\d{5})?$/.exec(raw);
    if (code && core.STATE_CENTROIDS[code[1].toUpperCase()]) state = code[1].toUpperCase();
    for (var name in STATE_NAMES) {
      if (!state && words.indexOf(" " + name + " ") >= 0) state = STATE_NAMES[name];
    }

    // In a street address the city comes last: "2000 Hollywood Blvd Miami"
    // is in Miami, not Hollywood.
    var tail = words.trim().replace(/( \d{5})+$/, "").split(" ");
    if (code && state) tail.pop();
    var cities = core.CITY_COORDS[state || "FL"] || {};
    for (var n = Math.min(4, tail.length); n >= 1; n--) {
      var end = tail.slice(-n).join(" ");
      if (cities[end]) return { city: end, state: state || "FL" };
    }

    // A known Florida city or ZIP wins unless another state was named, so
    // "West Palm Beach" is never read as West Virginia.
    var fl = { city: raw, state: "FL" };
    var hit = core.resolveCoordinates(fl);
    if (hit && hit !== core.STATE_CENTROIDS.FL && (!state || state === "FL")) return fl;
    if (state) return { city: raw, state: state };

    // No state given and not a Florida place: look for the city elsewhere,
    // but never inside a street address ("1601 Lincoln Rd" is not Nebraska).
    if (/^\d+ /.test(raw)) return null;
    for (var st in core.CITY_COORDS) {
      var addr = { city: raw, state: st };
      hit = core.resolveCoordinates(addr);
      if (st !== "FL" && hit && hit !== core.STATE_CENTROIDS[st]) return addr;
    }
    return null;
  }

  // Tidies what the customer typed for the lead email:
  // "465 brickell ave, Miami FL" -> "465 Brickell Ave, Miami, FL".
  // Only reformats; never invents a ZIP (the site's ZIP table is a pricing
  // approximation, not postal data), so a ZIP appears only if one was typed.
  var STREET_ABBR = {
    "avenue": "Ave", "ave": "Ave", "street": "St", "st": "St", "boulevard": "Blvd", "blvd": "Blvd",
    "road": "Rd", "rd": "Rd", "drive": "Dr", "dr": "Dr", "court": "Ct", "ct": "Ct", "place": "Pl",
    "pl": "Pl", "lane": "Ln", "ln": "Ln", "terrace": "Ter", "ter": "Ter", "highway": "Hwy", "hwy": "Hwy",
    "parkway": "Pkwy", "pkwy": "Pkwy", "circle": "Cir", "cir": "Cir", "way": "Way", "trail": "Trl",
    "causeway": "Cswy", "apartment": "Apt", "apt": "Apt", "suite": "Ste", "ste": "Ste", "unit": "Unit"
  };
  var CITY_ALIAS = { "ft lauderdale": "fort lauderdale", "ft pierce": "fort pierce", "hallandale": "hallandale beach" };

  function tidyAddress(core, text) {
    var raw = String(text || "").trim();
    if (!core || !raw) return raw;
    var tokens = raw.replace(/,/g, " , ").split(/\s+/).filter(Boolean);
    var zip = "", state = "";

    // Peel ZIP and state off the end, in either order.
    for (var k = 0; k < 3 && tokens.length; k++) {
      var t = tokens[tokens.length - 1], low = t.toLowerCase();
      if (t === ",") { tokens.pop(); continue; }
      if (!zip && /^\d{5}(-\d{4})?$/.test(t)) { zip = t; tokens.pop(); continue; }
      // Lowercase "or", "in", "me"... are words, not states, unless after a comma.
      var wordy = /^(or|in|me|oh|ok|hi|de|al|la|pa|ma|co|id)$/.test(t) && tokens[tokens.length - 2] !== ",";
      if (!state && /^[a-z]{2}$/i.test(t) && !wordy && core.STATE_CENTROIDS[t.toUpperCase()] && tokens.length > 1) {
        state = t.toUpperCase(); tokens.pop(); continue;
      }
      break;
    }
    var stateOnly = "";
    if (!state) {
      var tail = tokens.join(" ").toLowerCase();
      for (var name in STATE_NAMES) {
        if (tail === name || tail.slice(-name.length - 1) === " " + name) {
          state = STATE_NAMES[name];
          stateOnly = tail === name ? titleCase(name) : "";
          tokens = tokens.slice(0, tokens.length - name.split(" ").length);
          break;
        }
      }
    }
    // A ZIP typed first ("33401, West Palm Beach") or joined with "or".
    if (!zip && /^\d{5}$/.test(tokens[0] || "") && tokens.length > 1 && !/^\d/.test(tokens[1])) zip = tokens.shift();
    while (tokens.length && /^(,|or|and)$/i.test(tokens[tokens.length - 1])) tokens.pop();
    while (tokens.length && tokens[0] === ",") tokens.shift();

    // The city is the longest known name at the end of what is left.
    var city = "", cities = core.CITY_COORDS[state || "FL"] || {};
    var words = tokens.map(function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ""); });
    for (var n = Math.min(4, words.length); n >= 1; n--) {
      var end = words.slice(-n).join(" ");
      if (cities[end] && tokens.slice(-n).indexOf(",") < 0) {
        city = titleCase(CITY_ALIAS[end] || end);
        tokens = tokens.slice(0, -n);
        if (!state) state = "FL";
        break;
      }
    }
    while (tokens.length && tokens[tokens.length - 1] === ",") tokens.pop();

    var street = tokens.filter(function (w) { return w !== ","; }).map(function (w) {
      var low = w.toLowerCase().replace(/\.$/, "");
      if (STREET_ABBR[low]) return STREET_ABBR[low];
      if (/^(n|s|e|w|ne|nw|se|sw)$/.test(low)) return low.toUpperCase();
      if (/^#?\d+[a-z]?$/.test(low)) return low.toUpperCase();
      return titleCase(low);
    }).join(" ");

    if (stateOnly && !street) return stateOnly;
    if (!state && /^3[234]/.test(zip)) state = "FL";
    var parts = [street, city, (state + " " + zip).trim()].filter(Boolean);
    return parts.join(", ") || raw;
  }

  window.HerculesBooking.places = {
    suggest: function (q) {
      var core = window.HerculesQuoteCore;
      if (!core) return [];
      if (!places) places = buildPlaces(core);
      return suggest(q);
    },
    locate: function (text) {
      var core = window.HerculesQuoteCore;
      return core ? locate(core, text) : null;
    },
    tidy: function (text) {
      return tidyAddress(window.HerculesQuoteCore, text);
    }
  };
})();
