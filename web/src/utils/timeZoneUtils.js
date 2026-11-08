/**
 * Sri Jayawardenepura Standard Time (SLST / Asia/Colombo, UTC+05:30) Utilities
 * Ensures consistent time representation matching Sri Lanka's administrative capital time.
 */

export const JAYA_TIMEZONE = "Asia/Colombo";
export const JAYA_OFFSET_HOURS = 5.5;
export const JAYA_OFFSET_STRING = "+05:30";
export const JAYA_TIMEZONE_LABEL = "Sri Jayawardenepura Time (UTC+05:30)";

/**
 * Returns a Date object shifted to Jayawardenepura Time (+05:30)
 */
export function getJayawardenepuraDate(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const utcMs = validDate.getTime() + (validDate.getTimezoneOffset() * 60000);
  const slstOffsetMs = JAYA_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(utcMs + slstOffsetMs);
}

/**
 * Returns an ISO-formatted string with explicit +05:30 offset
 * Example: "2026-09-25T11:40:48.123+05:30"
 */
export function getJayawardenepuraISO(inputDate = new Date()) {
  const slstDate = getJayawardenepuraDate(inputDate);

  const yyyy = slstDate.getFullYear();
  const mm = String(slstDate.getMonth() + 1).padStart(2, "0");
  const dd = String(slstDate.getDate()).padStart(2, "0");
  const hh = String(slstDate.getHours()).padStart(2, "0");
  const min = String(slstDate.getMinutes()).padStart(2, "0");
  const ss = String(slstDate.getSeconds()).padStart(2, "0");
  const sss = String(slstDate.getMilliseconds()).padStart(3, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.${sss}+05:30`;
}

/**
 * Returns formatted Jayawardenepura time string: "YYYY-MM-DD HH:mm:ss SLST"
 */
export function formatJayawardenepura(inputDate = new Date(), includeSeconds = true) {
  if (!inputDate) return "N/A";
  const slstDate = getJayawardenepuraDate(inputDate);
  if (isNaN(slstDate.getTime())) return "Invalid Date";

  const yyyy = slstDate.getFullYear();
  const mm = String(slstDate.getMonth() + 1).padStart(2, "0");
  const dd = String(slstDate.getDate()).padStart(2, "0");
  const hh = String(slstDate.getHours()).padStart(2, "0");
  const min = String(slstDate.getMinutes()).padStart(2, "0");
  const ss = String(slstDate.getSeconds()).padStart(2, "0");

  if (includeSeconds) {
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} (SLST)`;
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${min} (SLST)`;
}

/**
 * Returns a detailed info object for Jayawardenepura Time
 */
export function getJayawardenepuraDetails(inputDate = new Date()) {
  const slstDate = getJayawardenepuraDate(inputDate);
  return {
    iso: getJayawardenepuraISO(inputDate),
    formatted: formatJayawardenepura(inputDate),
    timeOnly: slstDate.toLocaleTimeString("en-US", { hour12: true, timeZone: "Asia/Colombo" }),
    dateOnly: slstDate.toLocaleDateString("en-US", { timeZone: "Asia/Colombo" }),
    timezone: JAYA_TIMEZONE,
    offset: JAYA_OFFSET_STRING,
    label: JAYA_TIMEZONE_LABEL
  };
}
