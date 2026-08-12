import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEstimate,
  HOME_SIZE_LABELS,
  MAX_HOME_SIZE
} from "../supabase/functions/_shared/pricing.js";

const cases = [
  { miles: 10, size: 0, hours: 2, price: 260, name: "10 miles / studio" },
  { miles: 20, size: 1, hours: 2, price: 260, name: "20 miles / 1 bedroom" },
  { miles: 40, size: 2, hours: 3, price: 390, name: "40 miles / 2 bedroom" },
  { miles: 40, size: 3, hours: 4, price: 490, name: "40 miles / 3 bedroom" },
  { miles: 40, size: 4, hours: 4, price: 490, name: "40 miles / 4 bedroom" },
  { miles: 51, size: 0, hours: 2, price: 260, name: "51 miles / studio" },
  { miles: 101, size: 1, hours: 3, price: 390, name: "101 miles / 1 bedroom" },
  { miles: 124, size: 2, hours: 4, price: 490, name: "124 miles / 2 bedroom" },
  { miles: 125, size: 2, hours: 5, price: 649, name: "125 miles / 2 bedroom" },
  { miles: 247, size: 2, hours: 7, price: 890, name: "247 miles / 2 bedroom" },
  { miles: 400, size: 4, hours: 8, price: 990, name: "exceeds 8 hours cap" }
];

for (const c of cases) {
  test(c.name, () => {
    const result = calculateEstimate(c.miles, c.size);
    assert.equal(result.estimatedHours, c.hours);
    assert.equal(result.estimatedPrice, c.price);
  });
}

test("does not use hours times a flat hourly rate", () => {
  const result = calculateEstimate(40, 3);
  assert.notEqual(result.estimatedPrice, result.estimatedHours * 130);
  assert.equal(result.estimatedPrice, 490);
});

test("a few items locally is the 2-hour minimum", () => {
  const result = calculateEstimate(20, 5);
  assert.equal(result.homeSizeLabel, "Just a Few Items");
  assert.equal(result.estimatedHours, 2);
  assert.equal(result.estimatedPrice, 260);
});

test("a few items never prices above a studio", () => {
  for (const miles of [10, 40, 51, 120, 240, 600]) {
    const fewItems = calculateEstimate(miles, 5).estimatedPrice;
    const studio = calculateEstimate(miles, 0).estimatedPrice;
    assert.ok(fewItems <= studio, `${miles} miles: few items ${fewItems} > studio ${studio}`);
  }
});

test("every home size has a label and a price", () => {
  for (let size = 0; size <= MAX_HOME_SIZE; size++) {
    assert.ok(HOME_SIZE_LABELS[size], `home size ${size} has no label`);
    assert.ok(calculateEstimate(30, size).estimatedPrice > 0);
  }
});

test("rejects a home size outside the offered range", () => {
  assert.throws(() => calculateEstimate(30, MAX_HOME_SIZE + 1), /home size/i);
  assert.throws(() => calculateEstimate(30, -1), /home size/i);
});
