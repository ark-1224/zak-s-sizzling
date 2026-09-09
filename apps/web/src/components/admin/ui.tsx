"use client";

// Small shared primitives for the admin visual system — kept here instead of
// repeating the same Tailwind strings across every admin page.

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
    <div className="mb-4.5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-adm-mono mb-1.5 text-[10px] tracking-[.16em] text-adm-ink-3 uppercase">{eyebrow}</div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children }: { title?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-adm-line bg-adm-surface">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-adm-line px-4.5 py-3.5">
          <div className="text-sm font-semibold">{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-adm-line bg-adm-surface p-4">
      <div className="font-adm-mono text-[10px] tracking-[.13em] text-adm-ink-3 uppercase">{label}</div>
      <div className="font-adm-mono text-[27px] leading-none tracking-tight" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-adm-ink-3">{sub}</div>}
    </div>
  );
}

export function AdmButton({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = "rounded-[5px] px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50";
  const styles = {
    primary: "bg-adm-accent text-adm-accent-ink",
    secondary: "border border-adm-line bg-adm-surface text-adm-ink-2",
    danger: "border border-adm-bad text-adm-bad",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const styles = {
    ok: "bg-adm-ok-soft text-adm-ok",
    warn: "bg-adm-warn-soft text-adm-warn",
    bad: "bg-adm-bad-soft text-adm-bad",
  };
  return (
    <span className={`font-adm-mono rounded-[3px] px-2 py-0.75 text-[10px] whitespace-nowrap ${styles[tone]}`}>
      {children}
    </span>
  );
}
