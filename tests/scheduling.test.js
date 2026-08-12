import test from "node:test";
import assert from "node:assert/strict";
import { isValidMoveDate, isValidArrivalWindow, ARRIVAL_WINDOWS } from "../supabase/functions/_shared/scheduling.js";

test("rejects past dates", () => {
  assert.equal(isValidMoveDate("2020-01-01"), false);
});

test("rejects invalid date strings", () => {
  assert.equal(isValidMoveDate("not-a-date"), false);
  assert.equal(isValidMoveDate("2026-13-40"), false);
});

test("accepts configured windows only", () => {
  assert.equal(isValidArrivalWindow(ARRIVAL_WINDOWS[0]), true);
  assert.equal(isValidArrivalWindow("3:00 AM – 4:00 AM"), false);
});
