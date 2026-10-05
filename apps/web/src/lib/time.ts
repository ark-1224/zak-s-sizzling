// "Placed 4 min ago"-style wording for queues where how long something has waited
// matters more than the clock time.
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} hr ago` : `${hours} hr ${rest} min ago`;
  }
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** The full date and time, for a tooltip next to the relative time. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
