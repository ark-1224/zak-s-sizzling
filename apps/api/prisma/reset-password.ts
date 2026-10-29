import "dotenv/config";
import bcrypt from "bcrypt";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";

/**
 * Sets a new password for one account, straight in the database: the way back in when
 * nobody can sign in (a forgotten admin password, or sign-in codes that can't be
 * emailed). Run it yourself, from the repo root:
 *
 *   npm run admin:reset-password
 *
 * It asks for the database URL (Enter uses DATABASE_URL from apps/api/.env; for the live
 * site paste Railway → Postgres → Variables → DATABASE_PUBLIC_URL), the account's email
 * and the new password, typed twice. The URL and passwords aren't shown on screen. It
 * shows the account it found and asks before changing anything, and changes only that
 * account's password. If the code emails are the problem, also set LOGIN_CODES=off on
 * the api service until they're fixed.
 */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let hidden = false;
// Typed characters aren't echoed while `hidden` is set; Enter still moves to a new line.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
  if (!hidden || /^\r?\n$/.test(s)) process.stdout.write(s);
};
// Lines typed before their question is asked wait here instead of being lost.
const typed: string[] = [];
const waiting: ((line: string) => void)[] = [];
rl.on("line", (line) => (waiting.length ? waiting.shift()!(line) : typed.push(line)));

async function ask(question: string, hide = false): Promise<string> {
  process.stdout.write(question);
  hidden = hide;
  const answer = typed.length ? typed.shift()! : await new Promise<string>((resolve) => waiting.push(resolve));
  if (hide) process.stdout.write("\n");
  hidden = false;
  return answer.trim();
}

async function main() {
  const url = (await ask("Database URL (Enter for the one in apps/api/.env): ", true)) || process.env.DATABASE_URL || "";
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("That isn't a postgresql:// URL.");
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const email = (await ask("Account email: ")).toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
    if (!user) {
      const all = await prisma.user.findMany({ select: { email: true }, orderBy: { email: "asc" } });
      throw new Error(`No account with that email. Accounts: ${all.map((u) => u.email).join(", ")}`);
    }
    console.log(`Found: ${user.name} (${user.role.name}, ${user.isActive ? "active" : "suspended"})`);

    const password = await ask("New password (8 to 72 characters): ", true);
    if (password.length < 8 || password.length > 72) throw new Error("The password must be 8 to 72 characters.");
    if ((await ask("Type it again: ", true)) !== password) throw new Error("The two passwords don't match.");

    if ((await ask(`Change the password for ${email}? (y/n) `)).toLowerCase() !== "y") {
      console.log("Nothing changed.");
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    // A sign-in code already emailed with the old password stops working.
    await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
    console.log(`Password changed.${user.isActive ? "" : " The account is suspended: reactivate it in Users, or sign in with another admin."}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
