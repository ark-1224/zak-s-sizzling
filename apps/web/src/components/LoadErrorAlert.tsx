"use client";

// Shown when a page's data failed to load, instead of an empty state that would wrongly
// say there's nothing to do (UI review #1). `stale` means an earlier load worked and the
// page is still showing that older data. `tone` matches the admin pages (light) or the
// kitchen display (dark).
export function LoadErrorAlert({
  what,
  detail,
  onRetry,
  retrying,
  stale = false,
  tone = "light",
}: {
  what: string;
  detail: string;
  onRetry: () => void;
  retrying: boolean;
  stale?: boolean;
  tone?: "light" | "dark";
}) {
  const styles =
    tone === "light"
      ? { box: "border-adm-bad bg-adm-bad-soft text-adm-ink", sub: "text-adm-ink-2", button: "border-adm-bad bg-adm-surface text-adm-bad" }
      : { box: "border-berry bg-berry/20 text-cream", sub: "text-cream/80", button: "border-cream/40 bg-transparent text-cream" };

  return (
    <div role="alert" className={`flex flex-col gap-3 rounded-[6px] border p-4 sm:flex-row sm:items-center sm:justify-between ${styles.box}`}>
      <div className="min-w-0">
        <div className="font-semibold">Couldn&apos;t load {what}.</div>
        <div className={`text-base break-words md:text-sm ${styles.sub}`}>
          {detail}
          {stale && " What's shown below may be out of date."}
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={`min-h-11 shrink-0 rounded-[5px] border px-4 text-base font-semibold disabled:opacity-60 md:min-h-9 md:text-sm ${styles.button}`}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
