import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { sendLowStockAlerts } from "../../../worker/src/jobs/sendLowStockAlerts";
import { createMailer, type Mailer, type MailSettings } from "../../../worker/src/lib/mailer";
import { app, kioskToken, loginAs } from "./helpers";
import { startSmtpSink, type SmtpSink } from "./smtp-sink";

// Low-stock notifications 3/3: the whole path, end to end. A customer's order is paid
// at the counter, the sale takes an item to its minimum, the database queues the alert,
// the worker's job sends it over real SMTP (nodemailer, to a test server on this
// machine), and the message arrives. The tests in this file build on each other.

let sink: SmtpSink;
let mailer: Mailer;
let staff: string;
let customer: string;
let lemonadeId = "";

const SETTINGS: Omit<MailSettings, "port"> = {
  host: "127.0.0.1",
  secure: false,
  user: "zaks.alerts@example.com",
  pass: "test-app-password",
  from: `"Zak's Sizzling Hub" <zaks.alerts@example.com>`,
  to: ["owner@example.com"],
};

beforeAll(async () => {
  sink = await startSmtpSink();
  mailer = createMailer({ ...SETTINGS, port: sink.port });
  [staff, customer] = await Promise.all([loginAs("staff"), kioskToken()]);
  const { id: categoryId } = await prisma.category.findFirstOrThrow();
  lemonadeId = (
    await prisma.product.create({
      data: { name: "LSF Test Lemonade", price: 35, categoryId, inventory: { create: { stockQty: 7, minStockThreshold: 5 } } },
    })
  ).id;
  // Send whatever other test files left waiting, so this file's emails hold only its own alerts.
  for (let run = 0; run < 10 && (await sendLowStockAlerts(mailer)).waiting > 0; run++);
  sink.inbox.length = 0;
});

afterAll(() => sink.close());

async function sell(qty: number) {
  const order = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${customer}`)
    .send({ items: [{ productId: lemonadeId, qty }], paymentMethod: "counter" });
  expect(order.status).toBe(201);
  const paid = await request(app).post(`/api/payments/counter/${order.body.id}/confirm`).set("Authorization", `Bearer ${staff}`);
  expect(paid.status).toBe(200);
}
const restock = (setQty: number) =>
  request(app).patch(`/api/inventory/${lemonadeId}`).set("Authorization", `Bearer ${staff}`).send({ setQty, reason: "restock" });
const lemonadeAlerts = () => prisma.lowStockAlert.findMany({ where: { productId: lemonadeId }, orderBy: { createdAt: "asc" } });

describe("a sale that reaches the minimum, through to the inbox", () => {
  it("emails the owner once the sale is paid", async () => {
    await sell(2); // 7 → 5, the minimum

    const result = await sendLowStockAlerts(mailer);

    expect(result).toMatchObject({ sent: 1, failed: 0, waiting: 0 });
    expect(sink.inbox).toHaveLength(1);
    const [mail] = sink.inbox;
    expect(mail.auth).toBe("zaks.alerts@example.com:test-app-password");
    expect(mail.from).toBe("zaks.alerts@example.com");
    expect(mail.to).toEqual(["owner@example.com"]);
    expect(mail.subject).toBe("Low stock: LSF Test Lemonade reached its minimum");
    expect(mail.content).toMatch(/- LSF Test Lemonade: 5 left, minimum 5 \(/);
    expect(mail.content).toContain("<strong>5 left</strong>, minimum 5"); // the HTML part too
    expect(await lemonadeAlerts()).toEqual([expect.objectContaining({ sentAt: expect.any(Date), resolvedAt: null })]);
  });

  it("sends nothing more while it stays low, however many more are sold", async () => {
    await sell(1);
    await sell(1);

    expect(await sendLowStockAlerts(mailer)).toMatchObject({ sent: 0 });
    expect(sink.inbox).toHaveLength(1);
  });

  it("sends nothing for the restock itself, and closes the alert", async () => {
    expect((await restock(12)).status).toBe(200);

    expect(await sendLowStockAlerts(mailer)).toMatchObject({ sent: 0 });
    expect(sink.inbox).toHaveLength(1);
    expect(await lemonadeAlerts()).toEqual([expect.objectContaining({ resolvedAt: expect.any(Date) })]);
  });

  it("keeps the next alert waiting while the mail server can't be reached, then delivers it", async () => {
    await sell(8); // 12 → 4
    const unreachable = createMailer({ ...SETTINGS, port: 1 });

    expect(await sendLowStockAlerts(unreachable)).toMatchObject({ sent: 0, failed: 1 });
    const [, waiting] = await lemonadeAlerts();
    expect(waiting).toMatchObject({ sentAt: null, attempts: 1 });
    expect(waiting.lastError).toMatch(/Could not reach the mail server/);

    expect(await sendLowStockAlerts(mailer)).toMatchObject({ sent: 1 });
    expect(sink.inbox).toHaveLength(2);
    expect(sink.inbox[1].content).toMatch(/- LSF Test Lemonade: 4 left, minimum 5 \(/);
  }, 30_000); // Windows takes a couple of seconds to refuse a connection
});
