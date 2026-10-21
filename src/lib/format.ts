const DAY_MS = 24 * 3600 * 1000;

export const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const shortDateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "short",
});

/** YYYY-MM-DD für <input type="date"> (lokale Zeit). */
export function toDateInput(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Tage bis zum Datum (negativ = überfällig). */
export function daysUntil(date: Date | string) {
  return Math.round((startOfDay(new Date(date)).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
}

export function relativeTime(date: Date | string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 7) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  return dateTimeFormat.format(new Date(date));
}
