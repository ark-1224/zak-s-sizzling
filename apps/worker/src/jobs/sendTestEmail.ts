import "dotenv/config";
import { describeMailConfig, describeMailError, mailerFromConfig, readMailSettings } from "../lib/mailer";

/**
 * Checks the email settings by sending one short email to ALERT_EMAIL_TO (signing in to
 * the SMTP server first when SMTP is used). Run with `npm run mail:test` after setting them.
 */
export async function sendTestEmail(): Promise<boolean> {
  const config = readMailSettings();
  if (!config.ok) {
    console.error(`[mail] ${describeMailConfig(config)}`);
    return false;
  }
  const mailer = mailerFromConfig(config)!;
  console.log(`[mail] ${describeMailConfig(config)}`);
  try {
    await mailer.verify();
    const sentAt = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
    const { accepted } = await mailer.send({
      subject: "Test email from Zak's Sizzling Hub",
      text:
        `This is a test from the Zak's Sizzling Hub worker, sent ${sentAt}.\n\n` +
        "If you can read this, low-stock alerts can reach this address. No action is needed.",
    });
    console.log(`[mail] test email sent to ${accepted.length} recipient(s)`);
    return true;
  } catch (err) {
    console.error(`[mail] could not send: ${describeMailError(err)}`);
    return false;
  }
}

if (require.main === module) {
  sendTestEmail().then((sent) => process.exit(sent ? 0 : 1));
}
