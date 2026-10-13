import "dotenv/config";
import { prisma } from "../lib/prisma";
import { describeMailConfig, describeMailError, mailerFromEnv, readMailSettings, type Mailer, type MailMessage } from "../lib/mailer";

/**
 * Emails the low-stock alerts that haven't been sent yet. The database queues an alert
 * when an item reaches its minimum stock level, once until the item is restocked
 * (triggers on inventory and raw_materials, see the low_stock_alerts migrations); this
 * job sends everything waiting in one email and marks it sent. A failed send is retried on the
 * next run, up to MAX_ATTEMPTS times, with the reason kept in last_error.
 *
 * The worker runs this every minute when email is set up (index.ts), and
 * `npm run low-stock:alerts` runs it once.
 */

export const MAX_ATTEMPTS = 5;
/** Alerts per email; anything beyond goes in the next run's email. */
const BATCH = 50;

export interface AlertLine {
  itemName: string;
  kind: "product" | "raw material";
  stockQty: number;
  minStockThreshold: number;
  unit: string | null;
  createdAt: Date;
  /** How many times it reached its minimum since the last email; this line is the latest. */
  times?: number;
}

// Same display as the web app (lib/units.ts): large gram and millilitre amounts in kg and L.
const LARGE: Record<string, { at: number; unit: string }> = { g: { at: 1000, unit: "kg" }, ml: { at: 1000, unit: "L" } };
const trim = (n: number, digits: number) => n.toLocaleString("en-PH", { maximumFractionDigits: digits });

function quantity(qty: number, unit: string | null): string {
  if (!unit) return trim(qty, 0);
  const large = LARGE[unit];
  return large && Math.abs(qty) >= large.at ? `${trim(qty / large.at, 2)} ${large.unit}` : `${trim(qty, 3)} ${unit}`;
}

const when = (date: Date) =>
  date.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function describe(alert: AlertLine) {
  return {
    name: alert.kind === "raw material" ? `${alert.itemName} (raw material)` : alert.itemName,
    left: `${quantity(alert.stockQty, alert.unit)} left`,
    minimum: `minimum ${quantity(alert.minStockThreshold, alert.unit)}`,
    at: (alert.times ?? 1) > 1 ? `${when(alert.createdAt)}; reached it ${alert.times} times since the last email` : when(alert.createdAt),
  };
}

/** One email listing every alert, in the order given (oldest first). */
export function buildLowStockEmail(alerts: AlertLine[]): MailMessage {
  const subject =
    alerts.length === 1
      ? `Low stock: ${alerts[0].itemName} reached its minimum`
      : `Low stock: ${alerts.length} items reached their minimum`;
  const lines = alerts.map(describe);
  const note =
    "Amounts are from when each item reached its minimum. The Inventory and Raw materials pages show the stock now.";

  const text = [
    alerts.length === 1 ? "This item has reached its minimum stock level:" : "These items have reached their minimum stock level:",
    "",
    ...lines.map((l) => `- ${l.name}: ${l.left}, ${l.minimum} (${l.at})`),
    "",
    note,
    "",
    "Zak's Sizzling Hub",
  ].join("\n");

  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 12px 6px 0">${escapeHtml(l.name)}</td>` +
        `<td style="padding:6px 12px 6px 0"><strong>${escapeHtml(l.left)}</strong>, ${escapeHtml(l.minimum)}</td>` +
        `<td style="padding:6px 0;color:#6b665c">${escapeHtml(l.at)}</td></tr>`
    )
    .join("");
  const html =
    `<p>${alerts.length === 1 ? "This item has" : "These items have"} reached their minimum stock level:</p>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    `<p style="color:#6b665c">${escapeHtml(note)}</p><p>Zak's Sizzling Hub</p>`;

  return { subject, text, html };
}

export interface SendResult {
  sent: number;
  failed: number;
  /** Alerts still waiting after this run (including any beyond this run's batch). */
  waiting: number;
}

/** `mailer` is null when email isn't set up; then nothing is sent and the alerts wait. */
export async function sendLowStockAlerts(mailer: Mailer | null = mailerFromEnv()): Promise<SendResult> {
  const pendingWhere = { sentAt: null, attempts: { lt: MAX_ATTEMPTS } };
  if (!mailer) return { sent: 0, failed: 0, waiting: await prisma.lowStockAlert.count({ where: pendingWhere }) };

  const alerts = await prisma.lowStockAlert.findMany({ where: pendingWhere, orderBy: { createdAt: "asc" }, take: BATCH });
  if (alerts.length === 0) return { sent: 0, failed: 0, waiting: 0 };

  const ids = alerts.map((a) => a.id);
  // An item restocked and run down again before this email went out (say, while the
  // mail server was unreachable) is listed once, with its latest figures.
  const byItem = new Map<string, { latest: (typeof alerts)[number]; times: number }>();
  for (const alert of alerts) {
    const key = alert.productId ?? alert.rawMaterialId!;
    byItem.set(key, { latest: alert, times: (byItem.get(key)?.times ?? 0) + 1 });
  }
  const message = buildLowStockEmail(
    [...byItem.values()]
      .sort((a, b) => a.latest.createdAt.getTime() - b.latest.createdAt.getTime())
      .map(({ latest: a, times }) => ({
        itemName: a.itemName,
        kind: a.rawMaterialId ? "raw material" : "product",
        stockQty: a.stockQty.toNumber(),
        minStockThreshold: a.minStockThreshold.toNumber(),
        unit: a.unit,
        createdAt: a.createdAt,
        times,
      }))
  );

  let result: SendResult;
  try {
    await mailer.send(message);
    await prisma.lowStockAlert.updateMany({ where: { id: { in: ids } }, data: { sentAt: new Date() } });
    console.log(`[low-stock] emailed ${ids.length} alert(s)`);
    result = { sent: ids.length, failed: 0, waiting: 0 };
  } catch (err) {
    const reason = describeMailError(err);
    await prisma.lowStockAlert.updateMany({
      where: { id: { in: ids } },
      data: { attempts: { increment: 1 }, lastError: reason.slice(0, 500) },
    });
    console.error(`[low-stock] could not email ${ids.length} alert(s): ${reason}`);
    result = { sent: 0, failed: ids.length, waiting: 0 };
  }
  result.waiting = await prisma.lowStockAlert.count({ where: pendingWhere });
  return result;
}

if (require.main === module) {
  const config = readMailSettings();
  if (!config.ok) console.log(`[low-stock] ${describeMailConfig(config)}`);
  sendLowStockAlerts()
    .then(async ({ sent, failed, waiting }) => {
      console.log(`[low-stock] sent ${sent}, failed ${failed}, still waiting ${waiting}`);
      await prisma.$disconnect();
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
