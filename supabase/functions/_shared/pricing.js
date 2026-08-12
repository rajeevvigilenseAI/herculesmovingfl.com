/**
 * Authoritative Hercules Movers pricing.
 * Do not compute price as hours * hourly rate.
 *
 * The table and math live in js/booking/quote-core.js so the browser widget
 * and this function always quote the same number. That file has no module
 * syntax; importing it for its side effect populates globalThis.
 */
import "../../../js/booking/quote-core.js";

const core = globalThis.HerculesQuoteCore;

export const HOUR_PRICE = Object.freeze(core.HOUR_PRICE);
export const LOCAL_MILE_LIMIT = core.LOCAL_MILE_LIMIT;
export const HOME_SIZE_LABELS = Object.freeze(core.HOME_SIZE_LABELS);
export const MAX_HOME_SIZE = core.MAX_HOME_SIZE;

export function normalizeHomeSize(value) {
  return core.normalizeHomeSize(value);
}

export function calculateEstimate(distanceMiles, homeSize) {
  return core.calculateEstimate(distanceMiles, homeSize);
}
