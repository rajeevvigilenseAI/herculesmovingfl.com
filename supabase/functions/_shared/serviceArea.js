import "../../../js/booking/quote-core.js";

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
]);

export const ORIGIN_REQUIRED_STATE = "FL";
export const ORIGIN_OUTSIDE_FL_MESSAGE =
  "Hercules Movers currently accepts online reservations for moves originating in Florida.";

export function normalizeState(state) {
  return String(state || "").trim().toUpperCase();
}

export function isUsState(state) {
  return US_STATES.has(normalizeState(state));
}

export function validateServiceArea(originState, destinationState) {
  const origin = normalizeState(originState);
  const dest = normalizeState(destinationState);

  if (origin !== ORIGIN_REQUIRED_STATE) {
    const err = new Error(ORIGIN_OUTSIDE_FL_MESSAGE);
    err.code = "ORIGIN_NOT_FL";
    throw err;
  }
  if (!isUsState(dest)) {
    throw new Error("Destination must be a valid address in the United States.");
  }
}

// Shared with the browser widgets so a flagged item is flagged identically
// whether the reservation is saved here or emailed by the fallback path.
export function shouldFlagNeedsReview(specialtyItems) {
  return globalThis.HerculesQuoteCore.shouldFlagNeedsReview(specialtyItems);
}
