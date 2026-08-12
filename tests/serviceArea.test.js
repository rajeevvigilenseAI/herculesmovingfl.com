import test from "node:test";
import assert from "node:assert/strict";
import {
  validateServiceArea,
  shouldFlagNeedsReview,
  ORIGIN_OUTSIDE_FL_MESSAGE
} from "../supabase/functions/_shared/serviceArea.js";

test("allows Florida origin to Florida destination", () => {
  assert.doesNotThrow(() => validateServiceArea("FL", "FL"));
});

test("allows Florida origin to any US destination", () => {
  assert.doesNotThrow(() => validateServiceArea("FL", "GA"));
  assert.doesNotThrow(() => validateServiceArea("fl", "NY"));
  assert.doesNotThrow(() => validateServiceArea("FL", "NC"));
});

test("rejects origin outside Florida", () => {
  assert.throws(() => validateServiceArea("GA", "FL"), { message: ORIGIN_OUTSIDE_FL_MESSAGE });
  assert.throws(() => validateServiceArea("NY", "FL"), { message: ORIGIN_OUTSIDE_FL_MESSAGE });
});

test("rejects destination outside the United States", () => {
  assert.throws(() => validateServiceArea("FL", "ON"));
});

test("flags specialty items for review without changing status", () => {
  assert.equal(shouldFlagNeedsReview(["piano"]), true);
  assert.equal(shouldFlagNeedsReview(["safe"]), true);
  assert.equal(shouldFlagNeedsReview(["tv_over_75"]), false);
  assert.equal(shouldFlagNeedsReview([]), false);
});
