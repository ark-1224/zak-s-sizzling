# Print service (receipt and kitchen printers)

A small program that drives a 58 mm thermal printer (RP21UB-Y, USB). The same program runs
on each device that has a printer:

| Device | Printer prints | Sent by |
|---|---|---|
| The in-store kiosk's Raspberry Pi | **Customer receipt** (`POST /print`) once an order is placed, or once a QR Ph payment arrives: restaurant name, order number, dine in / take out, date and time, items with prices, total, how it was paid ("PAID - QR Ph", "PAID at the counter") or "Please pay at the counter", and the estimated preparation time | The kiosk page (`apps/web/src/lib/receiptPrinter.ts`) |
| The device in the kitchen that shows the kitchen display (`/kitchen`) | **Kitchen ticket** (`POST /print/kitchen`): a large order number and the dishes with their quantities and special instructions, nothing else | The kitchen display (`apps/web/src/app/kitchen/page.tsx`) |
| The counter computer, where staff use Orders awaiting payment (`/staff/orders`) | **Counter receipt** (`POST /print`) when staff press **Print receipt** after taking a payment: the customer receipt plus "PAID - Cash" with the cash received and the change, or "PAID - GCash / Maya" with the reference number, and any dishes cancelled after paying with the amount refunded | The receipt on Orders awaiting payment (`apps/web/src/components/staff/CounterReceipt.tsx`) |

The kitchen ticket prints when an order first appears on the kitchen display, which is
once it is paid (a counter order after staff confirm it, a QR Ph order once the payment
arrives), so the kitchen never gets a ticket for an unpaid order. Each order prints once:
the kitchen display remembers on its device which tickets have printed, so reloading the
page doesn't print them again. Tickets go one at a time, oldest first. If a ticket can't
print, the display says so and tries again with the next update or within 30 seconds.

The service prints one job at a time, in the order they arrive, so two jobs sent together
can't mix their lines on the paper. A printer that doesn't answer within 10 seconds (a
paper jam, a loose cable) fails that job instead of holding up the rest, and a job whose
page stopped waiting (after 8 seconds) is skipped, since the page sends it again later.

The service listens on the device itself (127.0.0.1) only, so phones that open the kiosk
from the QR code, and other computers, can't reach it. It is deliberately not an npm
workspace: the root `npm install` and the Railway builds don't install its packages.

## Requests

Customer receipt, `POST /print`:

```json
{
  "orderNumber": "ZK-123456",
  "items": [{ "qty": 2, "name": "Pork Sisig", "price": 240 }],
  "total": 240,
  "orderType": "dine_in",
  "paid": false,
  "paymentMethod": "counter",
  "estimatedPrepMinutes": 15,
  "createdAt": "2026-10-26T04:30:00.000Z"
}
```

`price` is the line's amount (qty × unit price). `paymentMethod` (`qrph`, `counter` for
cash, `gcash` or `maya`) only matters when `paid` is true: it picks the "PAID" line.

The counter adds, all optional: `amountTendered` and `change` (cash, printed as "Cash
received" and "Change"), `reference` (the GCash / Maya reference number, cut to 40
characters) and `cancelledAmount` (dishes cancelled after paying, printed above the total
as "Cancelled (refund)"; the total is what is left).

Kitchen ticket, `POST /print/kitchen`:

```json
{
  "orderNumber": "ZK-123456",
  "items": [{ "qty": 2, "name": "Pork Sisig", "note": "Extra rice" }]
}
```

`note` (the dish's special instructions) is optional. For both, only `orderNumber` and
`items` are required. Text is printed without control characters (ESC/POS printer commands
are control sequences, and special instructions are typed by customers) and is cut to 20
characters for the order number, 60 for a dish name and 140 for a note. The answer is `{ "ok": true }` once the slip is sent to the
printer, or `{ "ok": false, "error": "…" }` with status 400, 403 or 500.

## Setup on each device

The steps are the same on the kiosk's Pi, the kitchen device and a Linux counter computer
(a Raspberry Pi or another Linux computer with Node.js; the printer is reached at
`/dev/usb/lp0`). For a **Windows** counter laptop, follow
[Counter laptop on Windows](#counter-laptop-on-windows) instead.

1. Copy this folder to the device (for example `~/print-service`), then install its
   packages:

   ```bash
   cd ~/print-service && npm install
   ```

2. Check that the printer is at `/dev/usb/lp0` and that the device's user can write to it
   (the user usually needs to be in the `lp` group):

   ```bash
   ls -l /dev/usb/lp0
   ```

3. Start it:

   ```bash
   npm start
   ```

4. Switch printing on in the browser of that device, once:
   - on the kiosk's Pi, open the kiosk with `?printer=1` at the end of the address;
   - on the kitchen device, open the kitchen display with `?printer=1`:
     `https://zaks-sizzling-hub-admin.up.railway.app/kitchen?printer=1`. If the login page
     appears first, sign in; it brings you back to that address. The page then shows
     "Ticket printer on" under its title. Orders already on screen at that
     moment don't print; every order that arrives after does.

   - on the counter computer, open Orders awaiting payment with `?printer=1`:
     `https://zaks-sizzling-hub-admin.up.railway.app/staff/orders?printer=1`, signing in
     if asked. **Print receipt** on a payment's receipt then prints on this printer; if the
     printer doesn't answer, the receipt says so and offers **Print with this computer**
     (the browser's own printing). Without `?printer=1`, Print receipt uses the browser's
     printing, as before.

   `?printer=0` switches it off again. Only switch it on for one kitchen display, or each
   ticket prints once per display.

Settings, as environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PRINTER_INTERFACE` | `/dev/usb/lp0` | Where the printer is connected (Linux) |
| `PRINTER_NAME` | none | Windows only: the printer's name in Windows. When set, receipts go to that printer through Windows' print spooler and `PRINTER_INTERFACE` is not used. `start-windows.bat` sets it |
| `PORT` | `4000` | Port to listen on. If you change it, set `NEXT_PUBLIC_PRINT_SERVICE_URL` on the kiosk and admin sites to match |
| `ALLOWED_ORIGINS` | `https://web-production-ba868.up.railway.app,https://zaks-sizzling-hub-admin.up.railway.app,http://localhost:3000` | Comma-separated sites allowed to print. Requests from any other site are refused (403), so another page open in the browser can't print. Set it if a site's address changes (for example a custom domain) |

## Counter laptop on Windows

On Windows a USB printer has no address like `/dev/usb/lp0`, so the print service sends the
receipt to the printer by its **name in Windows**, through Windows' own print spooler, as a
RAW print job: the same printer commands the Raspberry Pi sends, so the receipt looks the
same, prints without a dialog and is cut. The Windows part is `windowsPrinter.js` and
`raw-print.ps1` (PowerShell, which comes with Windows); nothing else needs installing.

### 1. Install the printer in Windows

1. Plug the RP21UB-Y into the laptop with its USB cable, load paper and switch it on.
2. Install its Windows driver from the CD or the seller's download page (often called
   "POS-58" or "58mm thermal printer driver"), then check that it appears in
   **Settings › Bluetooth & devices › Printers & scanners**.
3. No driver? Add it with Windows' built-in one: **Printers & scanners › Add device ›
   Add manually › Add a local printer or network printer with manual settings**, choose the
   existing port **USB001** (Virtual printer port for USB), then the driver **Generic ›
   Generic / Text Only**, and name it, for example `RP21UB-Y`. This works because the
   receipt is sent raw: the driver only passes the bytes through.
4. Note the printer's name exactly as Windows shows it.

### 2. Install the print service

1. Install **Node.js** (the LTS version) from <https://nodejs.org>, with the default options.
2. Copy this `print-service` folder to the laptop, for example to `C:\ZaksPrint`.
3. Open `start-windows.bat` in Notepad and type the printer's name on the line
   `set "PRINTER_NAME="`, for example `set "PRINTER_NAME=RP21UB-Y"`. Save it.
4. Double-click `start-windows.bat`. The first time it installs its packages (a minute,
   needs the internet). The window should then show:

   ```text
   print service on 127.0.0.1:4000 -> Windows printer "RP21UB-Y"
   printer ok: 'RP21UB-Y' on port USB001, driver …
   ```

   If the name is wrong, it lists the printers Windows has instead; fix the name and start it
   again. Leave the window open while testing; closing it stops the service.

### 3. Test print

With the window from step 2 open, open **Windows PowerShell** and run:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4000/print -ContentType "application/json" -Body '{"orderNumber":"TEST-2","items":[{"qty":1,"name":"Beef Tapa","price":220}],"total":220,"orderType":"dine_in","paid":true,"paymentMethod":"counter","amountTendered":500,"change":280,"estimatedPrepMinutes":10}'
```

A receipt prints and the answer is `ok: True`.

### 4. Start it with Windows

Close the test window, then double-click `autostart-windows.bat` once. It puts a small
starter in the Windows Startup folder, so the print service starts by itself, without a
window, whenever this Windows user signs in, and starts it now. Its messages go to
`print-service.log` in the folder. To stop it starting by itself, press **Windows+R**,
type `shell:startup`, press Enter and delete **Zaks print service.vbs**. To stop it now,
end **Node.js JavaScript Runtime** in Task Manager.

### 5. Switch it on in the browser

In Chrome or Edge on the laptop, open Orders awaiting payment once with `?printer=1`:
`https://zaks-sizzling-hub-admin.up.railway.app/staff/orders?printer=1` (sign in if asked).
The first time, the browser asks whether the site may access devices on the local network:
choose **Allow**; it remembers this for the site. **Print receipt** then prints on the
receipt printer.

### Good to know

- If Windows reports the printer offline, or it has no printer by that name, the receipt
  says the printer didn't answer and offers **Print with this computer** (the browser's own
  printing).
- Windows keeps a print job in its queue. If the printer is switched off but Windows hasn't
  noticed (some USB printers don't report it), the receipt waits in the queue and prints once
  the printer is back on, rather than offering the browser's printing.
- A receipt takes about one to two seconds; the very first one after starting can take a
  little longer.

## Always allow the sites to use the printer (Chromium)

The kiosk and kitchen pages reach the print service on the device itself (`127.0.0.1`), so
Chromium asks for permission to access the local network ("local network access"). To
allow the system's two sites permanently without a prompt, install the Chromium policy in
[`chromium-policy.json`](chromium-policy.json) on each device:

1. From this folder on the device, copy the policy into Chromium's policy folder:

   ```bash
   sudo mkdir -p /etc/chromium/policies/managed
   ```

   ```bash
   sudo cp chromium-policy.json /etc/chromium/policies/managed/zaks-printer.json
   ```

2. Close Chromium completely so it reads the policy, then start it again as usual:

   ```bash
   pkill chromium
   ```

3. Open `chrome://policy` in Chromium. `LocalNetworkAccessAllowedForUrls` should be listed
   with the two site addresses. If nothing is listed, the device's Chromium may read
   `/etc/chromium-browser/policies/managed/` instead (some older Raspberry Pi OS
   versions); copy the file there too and restart Chromium.

`LocalNetworkAccessAllowedForUrls` covers current Chromium versions. From Chrome 146 the
permission is split in two and `LoopbackNetworkAllowedForUrls` covers access to the device
itself; older versions list it as unknown and ignore it. Only these two sites are allowed.
Any other site still has to ask, and the print service refuses other sites anyway
(`ALLOWED_ORIGINS`). If a site's address changes, update both lists and `ALLOWED_ORIGINS`.

Without the policy, clicking **Allow** once also works: Chromium remembers it for the site,
unless it starts with `--incognito` or a fresh profile on every boot.

## Start it when the device boots

As a systemd service, change `User` and the paths to match the device, then save this as
`/etc/systemd/system/zaks-print.service`:

```ini
[Unit]
Description=Zak's Sizzling Hub print service
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/print-service
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable it, and restart it after every change to `server.js`:

```bash
sudo systemctl enable --now zaks-print
```

```bash
sudo systemctl restart zaks-print
```

## Test prints

Run these on the device itself. A customer receipt (kiosk's Pi):

```bash
curl -X POST http://127.0.0.1:4000/print -H "Content-Type: application/json" -d '{"orderNumber":"TEST-1","items":[{"qty":2,"name":"Pork Sisig","price":240}],"total":240,"orderType":"dine_in","paid":false,"estimatedPrepMinutes":15}'
```

A counter receipt (counter computer), paid in cash with change:

```bash
curl -X POST http://127.0.0.1:4000/print -H "Content-Type: application/json" -d '{"orderNumber":"TEST-2","items":[{"qty":1,"name":"Beef Tapa","price":220}],"total":220,"orderType":"dine_in","paid":true,"paymentMethod":"counter","amountTendered":500,"change":280,"estimatedPrepMinutes":10}'
```

A kitchen ticket (kitchen device):

```bash
curl -X POST http://127.0.0.1:4000/print/kitchen -H "Content-Type: application/json" -d '{"orderNumber":"TEST-1","items":[{"qty":2,"name":"Pork Sisig","note":"Extra rice"}]}'
```

If the end of a slip stays inside the printer, add another `printer.newLine();` in
`endSlip` in `server.js`.
