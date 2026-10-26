# Print service (receipt and kitchen printers)

A small program that drives a 58 mm thermal printer (RP21UB-Y, USB). The same program runs
on two devices, each with its own printer:

| Device | Printer prints | Sent by |
|---|---|---|
| The in-store kiosk's Raspberry Pi | **Customer receipt** (`POST /print`) once an order is placed, or once a QR Ph payment arrives: restaurant name, order number, dine in / take out, date and time, items with prices, total, "PAID - QR Ph" or "Please pay at the counter", and the estimated preparation time | The kiosk page (`apps/web/src/lib/receiptPrinter.ts`) |
| The device in the kitchen that shows the kitchen display (`/kitchen`) | **Kitchen ticket** (`POST /print/kitchen`): a large order number and the dishes with their quantities and special instructions, nothing else | The kitchen display (`apps/web/src/app/kitchen/page.tsx`) |

The kitchen ticket prints when an order first appears on the kitchen display, which is
once it is paid (a counter order after staff confirm it, a QR Ph order once the payment
arrives), so the kitchen never gets a ticket for an unpaid order. Each order prints once:
the kitchen display remembers on its device which tickets have printed, so reloading the
page doesn't print them again. If a ticket can't print, the display says so and tries
again with the next update or within 30 seconds.

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
  "estimatedPrepMinutes": 15,
  "createdAt": "2026-10-26T04:30:00.000Z"
}
```

`price` is the line's amount (qty × unit price).

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

The steps are the same on the kiosk's Pi and on the kitchen device (a Raspberry Pi or
another Linux computer with Node.js).

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

   `?printer=0` switches it off again. Only switch it on for one kitchen display, or each
   ticket prints once per display.

Settings, as environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PRINTER_INTERFACE` | `/dev/usb/lp0` | Where the printer is connected |
| `PORT` | `4000` | Port to listen on. If you change it, set `NEXT_PUBLIC_PRINT_SERVICE_URL` on the kiosk and admin sites to match |
| `ALLOWED_ORIGINS` | `https://web-production-ba868.up.railway.app,https://zaks-sizzling-hub-admin.up.railway.app,http://localhost:3000` | Comma-separated sites allowed to print. Requests from any other site are refused (403), so another page open in the browser can't print. Set it if a site's address changes (for example a custom domain) |

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

A kitchen ticket (kitchen device):

```bash
curl -X POST http://127.0.0.1:4000/print/kitchen -H "Content-Type: application/json" -d '{"orderNumber":"TEST-1","items":[{"qty":2,"name":"Pork Sisig","note":"Extra rice"}]}'
```

If the end of a slip stays inside the printer, add another `printer.newLine();` in
`endSlip` in `server.js`.
