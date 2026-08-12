import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  drivingDistanceMiles,
  milesFromBand,
  bandForMiles,
  DISTANCE_BANDS,
  CITY_COORDS,
  ZIP5_COORDS,
  ZIP3_COORDS,
  STATE_CENTROIDS
} from "../supabase/functions/_shared/distance.js";
import { calculateEstimate, MAX_HOME_SIZE } from "../supabase/functions/_shared/pricing.js";

test("resolves distance between two known FL cities as local (<=50 miles)", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Fort Lauderdale", state: "FL", zip: "" }
  );
  assert.ok(miles > 0 && miles <= 50, `expected a short local distance, got ${miles}`);
});

test("resolves a long interstate distance as clearly over 50 miles", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "New York", state: "NY", zip: "" }
  );
  assert.ok(miles > 500, `expected a long distance, got ${miles}`);
});

test("Miami to Orlando lands near the real driving distance", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Orlando", state: "FL", zip: "" }
  );
  // Real driving distance is roughly 235 miles.
  assert.ok(miles > 190 && miles < 280, `expected ~235 miles, got ${miles}`);
});

test("falls back to ZIP prefix when city is missing", async () => {
  const miles = await drivingDistanceMiles(
    { city: "", state: "FL", zip: "33131" },
    { city: "", state: "FL", zip: "33301" }
  );
  assert.ok(miles > 0 && miles < 50, `expected a short local distance, got ${miles}`);
});

test("ZIP5 overrides correct 330xx outliers in the Florida Keys", async () => {
  const miles = await drivingDistanceMiles(
    { city: "", state: "FL", zip: "33040" },
    { city: "", state: "FL", zip: "33131" }
  );
  // Key West to Miami is a long intrastate trip; this catches accidental
  // fallback to Broward's 330xx centroid.
  assert.ok(miles > 130, `expected a long South Florida trip, got ${miles}`);
});

test("falls back to state centroid for an unrecognized city", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Some Tiny Unlisted Town", state: "FL", zip: "" },
    { city: "Another Unlisted Town", state: "GA", zip: "" }
  );
  assert.ok(miles > 0, `expected a state-centroid fallback distance, got ${miles}`);
});

test("same city origin and destination returns a near-zero distance", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Orlando", state: "FL", zip: "" },
    { city: "Orlando", state: "FL", zip: "" }
  );
  assert.ok(miles < 1, `expected near-zero distance, got ${miles}`);
});

test("reads a city out of a full Google Places string", async () => {
  const parsed = await drivingDistanceMiles(
    { city: "Miami, FL 33131, USA", state: "FL", zip: "" },
    { city: "Orlando, FL, USA", state: "FL", zip: "" }
  );
  const plain = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Orlando", state: "FL", zip: "" }
  );
  assert.equal(parsed, plain);
});

test("prefers the longest matching city name", async () => {
  const northMiamiBeach = await drivingDistanceMiles(
    { city: "North Miami Beach", state: "FL", zip: "" },
    { city: "Orlando", state: "FL", zip: "" }
  );
  const miami = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Orlando", state: "FL", zip: "" }
  );
  assert.notEqual(northMiamiBeach, miami);
});

test("same city name in different states resolves separately", async () => {
  const toFlHollywood = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Hollywood", state: "FL", zip: "" }
  );
  const toCaHollywood = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Hollywood", state: "CA", zip: "" }
  );
  assert.ok(toFlHollywood < 50, `expected a local FL move, got ${toFlHollywood}`);
  assert.ok(toCaHollywood > 2000, `expected a cross-country move, got ${toCaHollywood}`);
});

test("a selected distance range overrides the coordinate math", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Fort Lauderdale", state: "FL", zip: "" },
    "250-500"
  );
  assert.equal(miles, 375);
});

test("every distance range prices within its own bounds", () => {
  for (const band of DISTANCE_BANDS) {
    assert.ok(
      band.miles >= band.min && band.miles <= band.max,
      `${band.key} uses ${band.miles} miles, outside its own range`
    );
    assert.equal(milesFromBand(band.key), band.miles);
    // Each range must produce a priceable quote for every home size.
    for (let size = 0; size <= MAX_HOME_SIZE; size++) {
      const quote = calculateEstimate(band.miles, size);
      assert.ok(quote.estimatedPrice > 0);
      assert.ok(quote.estimatedHours >= 2 && quote.estimatedHours <= 8);
    }
  }
});

test("ranges are contiguous and the last one is open ended", () => {
  for (let i = 1; i < DISTANCE_BANDS.length; i++) {
    assert.equal(
      DISTANCE_BANDS[i].min,
      DISTANCE_BANDS[i - 1].max,
      `gap or overlap between ${DISTANCE_BANDS[i - 1].key} and ${DISTANCE_BANDS[i].key}`
    );
  }
  assert.equal(DISTANCE_BANDS[0].min, 0);
  assert.equal(DISTANCE_BANDS[DISTANCE_BANDS.length - 1].max, Infinity);
});

test("a real mileage maps to the range that contains it", () => {
  assert.equal(bandForMiles(0), "0-50");
  assert.equal(bandForMiles(28), "0-50");
  assert.equal(bandForMiles(50), "0-50");
  assert.equal(bandForMiles(51), "50-100");
  assert.equal(bandForMiles(240), "150-250");
  assert.equal(bandForMiles(500), "250-500");
  assert.equal(bandForMiles(1300), "500-plus");
  assert.equal(bandForMiles(-5), "");
  assert.equal(bandForMiles("nonsense"), "");
});

test("a cross-country move maps to the top range, not a local one", async () => {
  const miles = await drivingDistanceMiles(
    { city: "Miami", state: "FL", zip: "" },
    { city: "Seattle", state: "WA", zip: "" }
  );
  assert.equal(bandForMiles(miles), "500-plus");
});

test("longer ranges never price lower than shorter ones", () => {
  let previous = 0;
  for (const band of DISTANCE_BANDS) {
    const price = calculateEstimate(band.miles, 2).estimatedPrice;
    assert.ok(price >= previous, `${band.key} priced ${price} below the shorter range`);
    previous = price;
  }
});

test("no range selected means distance is calculated", () => {
  assert.equal(milesFromBand(""), null);
  assert.equal(milesFromBand(undefined), null);
  assert.equal(milesFromBand(null), null);
});

test("rejects a distance range that isn't offered", () => {
  assert.throws(() => milesFromBand("9000-9999"), /Invalid distance range/);
});

test("every coordinate in the tables is a plausible US location", () => {
  const check = (label, point) => {
    assert.ok(Array.isArray(point) && point.length === 2, `${label} is not a [lat, lon] pair`);
    const [lat, lon] = point;
    assert.ok(lat > 18 && lat < 72, `${label} latitude ${lat} is outside the US`);
    assert.ok(lon > -180 && lon < -66, `${label} longitude ${lon} is outside the US`);
  };

  for (const [state, cities] of Object.entries(CITY_COORDS)) {
    assert.ok(STATE_CENTROIDS[state], `${state} has cities but no state center point`);
    for (const [city, point] of Object.entries(cities)) check(`${city}, ${state}`, point);
  }
  for (const [zip5, point] of Object.entries(ZIP5_COORDS)) check(`ZIP ${zip5}`, point);
  for (const [zip3, point] of Object.entries(ZIP3_COORDS)) check(`ZIP ${zip3}`, point);
  for (const [state, point] of Object.entries(STATE_CENTROIDS)) check(state, point);
});

test("every ZIP prefix points at a city that actually exists in the table", () => {
  for (const [zip3, point] of Object.entries(ZIP3_COORDS)) {
    assert.ok(point, `ZIP prefix ${zip3} references a city that is not in CITY_COORDS`);
  }
  for (const [zip5, point] of Object.entries(ZIP5_COORDS)) {
    assert.ok(point, `ZIP5 ${zip5} references a city that is not in CITY_COORDS`);
  }
  assert.equal(Object.keys(ZIP5_COORDS).length, new Set(Object.keys(ZIP5_COORDS)).size);
  assert.equal(Object.keys(ZIP3_COORDS).length, new Set(Object.keys(ZIP3_COORDS)).size);
});

test("no city name is defined twice within the same state", () => {
  // A repeated key would be silently dropped by the object literal, so check
  // the source text rather than the parsed table.
  const source = fs.readFileSync("js/booking/quote-core.js", "utf8");
  const table = source.slice(
    source.indexOf("var CITY_COORDS"),
    source.indexOf("var ZIP3_COORDS")
  );
  const blocks = table.split(/\n    ([A-Z]{2}): \{/);

  for (let i = 1; i < blocks.length; i += 2) {
    const state = blocks[i];
    const seen = new Set();
    for (const match of blocks[i + 1].matchAll(/"([a-z0-9 ]+)":/g)) {
      assert.ok(!seen.has(match[1]), `"${match[1]}" is listed twice under ${state}`);
      seen.add(match[1]);
    }
  }
});
