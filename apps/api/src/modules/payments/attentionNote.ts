import type { Prisma } from "@prisma/client";

/**
 * Holds the order's row until the transaction ends. Whoever changes an order's note takes
 * this first, then reads the note, so two changes at once can't overwrite each other.
 */
export async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
}

// orders.stock_issue_note is varchar(1000).
const NOTE_MAX = 1000;
const TOO_LONG = "… More in PayMongo's dashboard.";

/**
 * An order's note once another thing needs attention. Nothing is overwritten, so every
 * amount owed stays on screen: a new item goes under an unresolved note, and under one
 * already sorted out it goes after a mark saying so. At the length limit the end is cut
 * and says where to look.
 */
export function addAttentionNote(current: string | null, stillOpen: boolean, text: string): string {
  const combined = !current ? text : stillOpen ? `${current}\n${text}` : `${current} (Sorted out.)\n${text}`;
  return combined.length <= NOTE_MAX ? combined : `${combined.slice(0, NOTE_MAX - TOO_LONG.length)}${TOO_LONG}`;
}
