export const ARRIVAL_WINDOWS = Object.freeze([
  "8:00 AM – 10:00 AM",
  "10:00 AM – 12:00 PM",
  "12:00 PM – 2:00 PM",
  "2:00 PM – 4:00 PM"
]);

const NY_TZ = "America/New_York";

function todayInNewYork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidMoveDate(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return false;
  }
  return dateStr >= todayInNewYork();
}

export function isValidArrivalWindow(window) {
  return ARRIVAL_WINDOWS.includes(window);
}

export function assertSchedule(moveDate, arrivalWindow) {
  if (!isValidMoveDate(moveDate)) {
    throw new Error("Please choose a valid move date that is not in the past.");
  }
  if (!isValidArrivalWindow(arrivalWindow)) {
    throw new Error("Please choose a valid arrival window.");
  }
}
