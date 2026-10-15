// Wording for estimated preparation times (the API works them out: apps/api/src/modules/
// orders/prepTime.ts). Times are rounded to whole minutes and always called "about",
// since an estimate is not a promise.

/** "about 14 minutes", "about 1 minute", or "right away" for 0. */
export function aboutMinutes(minutes: number): string {
  if (minutes <= 0) return "right away";
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The clock time, e.g. "8:42 PM". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** For a due time: "in 6 min", "due now", or "4 min late". */
export function dueIn(iso: string, now: number): { text: string; late: boolean } {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes > 0) return { text: `in ${minutes} min`, late: false };
  if (minutes === 0) return { text: "due now", late: false };
  return { text: `${-minutes} min late`, late: true };
}
