/**
 * Static, offline approximation of driving distance, with no external API call and
 * no Google Maps server key. Hercules prices are presented to customers as
 * estimates and land in bucketed 2-8 hour bands, so a straight-line distance
 * scaled by a fixed road factor is accurate enough to price a move.
 *
 * Coordinates and math live in js/booking/quote-core.js so the browser widget
 * and this function always agree. Resolution order per address is city name ->
 * ZIP5 override -> ZIP prefix -> state center point, so a distance can always be produced;
 * accuracy degrades gracefully as less specific data is given.
 */
import "../../../js/booking/quote-core.js";

const core = globalThis.HerculesQuoteCore;

export const DISTANCE_BANDS = core.DISTANCE_BANDS;
export const CITY_COORDS = core.CITY_COORDS;
export const ZIP5_COORDS = core.ZIP5_COORDS;
export const ZIP3_COORDS = core.ZIP3_COORDS;
export const STATE_CENTROIDS = core.STATE_CENTROIDS;

/** Representative mileage for a customer-selected range, else null. */
export function milesFromBand(band) {
  return core.milesFromBand(band);
}

export function bandLabel(band) {
  return core.bandLabel(band);
}

/** The range a real mileage falls into. */
export function bandForMiles(miles) {
  return core.bandForMiles(miles);
}

/**
 * A customer-selected `distanceBand` wins over the coordinate math, so the
 * price shown in the widget is the price the reservation is written with.
 */
export async function drivingDistanceMiles(origin, destination, distanceBand) {
  return core.estimateMiles(origin, destination, distanceBand);
}
