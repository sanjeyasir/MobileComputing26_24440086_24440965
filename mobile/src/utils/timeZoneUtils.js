/**
 * Sri Lanka Standard Time (Asia/Colombo UTC+05:30) Utilities
 */

export function getSLSTDate(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const utcMs = validDate.getTime() + validDate.getTimezoneOffset() * 60000;
  const slstOffsetMs = 5.5 * 60 * 60 * 1000;
  const slstDate = new Date(utcMs + slstOffsetMs);

  const yyyy = slstDate.getFullYear();
  const mm = String(slstDate.getMonth() + 1).padStart(2, "0");
  const dd = String(slstDate.getDate()).padStart(2, "0");
  const hh = String(slstDate.getHours()).padStart(2, "0");
  const min = String(slstDate.getMinutes()).padStart(2, "0");
  const ss = String(slstDate.getSeconds()).padStart(2, "0");

  const dateString = `${yyyy}-${mm}-${dd}`;
  const timeString = `${hh}:${min}:${ss}`;
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`;
  const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

  return {
    date: slstDate,
    dateString,
    timeString,
    iso,
    formatted,
    hour: slstDate.getHours(),
    minute: slstDate.getMinutes(),
    second: slstDate.getSeconds(),
    timestampMs: validDate.getTime()
  };
}

export function formatHourRange(hour) {
  const h1 = String(hour).padStart(2, "0");
  const h2 = String((hour + 1) % 24).padStart(2, "0");
  return `${h1}:00 - ${h2}:00`;
}

export function formatDuration(totalMinutes) {
  if (totalMinutes === undefined || totalMinutes === null || isNaN(totalMinutes)) {
    return "0m";
  }
  const mins = Math.round(Number(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
