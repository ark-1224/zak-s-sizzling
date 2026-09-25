"use client";

// Small shared primitives for the admin visual system — kept here instead of
// repeating the same Tailwind strings across every admin page.
//
// Mobile-first: unprefixed classes are the phone sizes (16px text, 44px touch targets);
// md: restores the original dense desktop sizes.

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-end justify-between gap-3 md:mb-4.5 md:gap-4">
      <div className="min-w-0">
        <div className="font-adm-mono mb-1.5 text-xs tracking-[.16em] text-adm-ink-3 uppercase md:text-[10px]">{eyebrow}</div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight break-words md:text-[26px]">{title}</h1>
      </div>
      {actions && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children }: { title?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-adm-line bg-adm-surface">
      {title && (
        // flex-wrap: on narrow screens the actions drop onto their own line instead of
        // being pushed past the card edge and clipped by overflow-hidden.
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-adm-line px-4 py-3 md:px-4.5 md:py-3.5">
          <div className="min-w-0 text-base font-semibold md:text-sm">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[6px] border border-adm-line bg-adm-surface p-4">
      <div className="font-adm-mono text-xs tracking-[.13em] text-adm-ink-3 uppercase md:text-[10px]">{label}</div>
      <div
        className="font-adm-mono text-2xl leading-none tracking-tight break-words md:text-[27px]"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-sm text-adm-ink-3 md:text-[11.5px]">{sub}</div>}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-[5px] px-4 text-base font-medium disabled:opacity-50 md:min-h-0";
const BUTTON_VARIANTS = {
  primary: "bg-adm-accent text-adm-accent-ink",
  secondary: "border border-adm-line bg-adm-surface text-adm-ink-2",
  danger: "border border-adm-bad text-adm-bad",
};
// Every size is 44px / 16px on mobile; they only differ in their desktop density.
const BUTTON_SIZES = {
  compact: "md:px-2.5 md:py-1 md:text-[11.5px]",
  default: "md:px-3.5 md:py-2 md:text-[12.5px]",
  large: "md:px-3.5 md:py-2.75 md:text-[12.5px]",
};

type ButtonStyle = { variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES };

/** Button styling for elements that aren't <button>s (e.g. a Next <Link>). */
export function admButtonClass({ variant = "secondary", size = "default" }: ButtonStyle = {}) {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export function AdmButton({
  variant,
  size,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle) {
  return <button className={`${admButtonClass({ variant, size })} ${className}`} {...props} />;
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const styles = {
    ok: "bg-adm-ok-soft text-adm-ok",
    warn: "bg-adm-warn-soft text-adm-warn",
    bad: "bg-adm-bad-soft text-adm-bad",
  };
  return (
    <span className={`font-adm-mono rounded-[3px] px-2 py-0.75 text-xs whitespace-nowrap md:text-[10px] ${styles[tone]}`}>
      {children}
    </span>
  );
}

/** Shared form-control styling: 16px on mobile (stops iOS Safari zooming in on focus), 44px tall. */
export const admInputClass =
  "w-full min-h-11 rounded-[5px] border border-adm-line bg-adm-bg px-3 text-base outline-none focus:border-adm-accent md:min-h-0 md:px-2.75 md:py-2.25 md:text-[13px]";

export const admLabelClass = "mb-1.5 block text-sm font-medium text-adm-ink-2 md:text-[11.5px]";

/** Stacks modal action buttons full-width on mobile (primary on top), inline right-aligned from sm. */
export const admModalActionsClass = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5";

/** Modal backdrop + panel: the panel is capped at the backdrop's height (which tracks the visible viewport) and scrolls. */
export const admModalBackdropClass =
  "font-adm-sans fixed inset-0 z-50 flex items-center justify-center bg-[#141310]/45 p-3 sm:p-5";
export const admModalPanelClass = "max-h-full w-full overflow-y-auto rounded-[8px] bg-adm-surface p-5 shadow-2xl sm:p-6.5";
