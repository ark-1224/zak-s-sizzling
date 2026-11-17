// Printing on Windows, where a USB receipt printer has no device file like Linux's
// /dev/usb/lp0: the receipt's printer commands (the same ESC/POS bytes the Raspberry Pi
// sends) go to the printer by its name in Windows (Settings > Printers & scanners) as a RAW
// print job, through raw-print.ps1 and Windows' own print spooler. Nothing to install
// beyond the printer's driver; PowerShell comes with Windows.
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "raw-print.ps1");
const POWERSHELL = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

function runPowerShell(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", [...POWERSHELL, ...args], { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      // execFile's timeout kills PowerShell, so a slow job can't print after the page has
      // given up and sent it again.
      if (error.killed) return reject(new Error(`Windows didn't take the receipt within ${timeoutMs / 1000} s`));
      if (error.code === "ENOENT") return reject(new Error("powershell.exe wasn't found; printing by printer name needs Windows"));
      reject(new Error(String(stderr || error.message).trim()));
    });
  });
}

/** Sends the bytes to the Windows printer named `printerName`; rejects with the reason. */
async function sendRaw(printerName, data, { timeoutMs = 9000, docName } = {}) {
  const file = path.join(os.tmpdir(), `zaks-receipt-${process.pid}-${crypto.randomUUID()}.bin`);
  await fs.writeFile(file, data);
  try {
    const args = ["-File", SCRIPT, "-PrinterName", printerName, "-Path", file];
    if (docName) args.push("-DocName", docName);
    await runPowerShell(args, timeoutMs);
  } finally {
    await fs.rm(file, { force: true });
  }
}

/**
 * Checks that Windows has the printer and doesn't report it offline, and prepares the
 * printing code so the first receipt isn't slower than the rest. Resolves with a line
 * describing the printer; rejects with the reason (listing the printers if the name is wrong).
 */
async function checkPrinter(printerName) {
  const out = await runPowerShell(["-File", SCRIPT, "-PrinterName", printerName, "-CheckOnly"], 30000);
  return out.trim();
}

module.exports = { sendRaw, checkPrinter };
