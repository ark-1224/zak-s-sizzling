# Print service (kiosk receipt printer)

A small program that runs on the in-store kiosk's Raspberry Pi. It prints each order on the
58 mm thermal printer (RP21UB-Y, USB) as two slips:

- **Customer receipt**: restaurant name, order number, dine in / take out, date and time,
  items with prices, total, "PAID - QR Ph" or "Please pay at the counter", and the
  estimated preparation time.
- **Kitchen copy**: a large order number, dine in / take out, time, items and quantities
  (no prices), and whether the order is paid. A "tear here" line separates it from the
  receipt.

The kiosk page sends `POST http://127.0.0.1:4000/print` once an order is placed, or once a
QR Ph payment is received (`apps/web/src/lib/receiptPrinter.ts`). It listens on the Pi
itself (127.0.0.1) only, so phones that open the kiosk from the QR code can't reach it.

It is deliberately not an npm workspace: the root `npm install` and the Railway builds
don't install its packages. It is installed on the Pi only.

## Request

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

`price` is the line's amount (qty × unit price). Only `orderNumber` and `items` are
required. The answer is `{ "ok": true }` once both slips are sent to the printer, or
`{ "ok": false, "error": "…" }` with status 400 or 500.

## Setup on the Pi

1. Copy this folder to the Pi (for example `~/print-service`), then install its packages:

   ```bash
   cd ~/print-service && npm install
   ```

2. Check that the printer is at `/dev/usb/lp0` and that the Pi's user can write to it
   (the user usually needs to be in the `lp` group):

   ```bash
   ls -l /dev/usb/lp0
   ```

3. Start it:

   ```bash
   npm start
   ```

4. Open the kiosk on the Pi once with `?printer=1` at the end of the address, so that
   device prints (`?printer=0` switches it off again).

Settings, as environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `KIOSK_ORIGINS` | `https://web-production-ba868.up.railway.app,http://localhost:3000` | Comma-separated sites allowed to print. Requests from any other site are refused (403), so another page open in the Pi's browser can't print. Set it if the kiosk's address changes (for example a custom domain) |
| `PRINTER_INTERFACE` | `/dev/usb/lp0` | Where the printer is connected |
| `PORT` | `4000` | Port to listen on. If you change it, set `NEXT_PUBLIC_PRINT_SERVICE_URL` on the kiosk site to match |

## Start it when the Pi boots

As a systemd service, change `User` and the paths to match the Pi, then save this as
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

## Test print

Prints both slips without placing an order (run it on the Pi):

```bash
curl -X POST http://127.0.0.1:4000/print -H "Content-Type: application/json" -d '{"orderNumber":"TEST-1","items":[{"qty":2,"name":"Pork Sisig","price":240}],"total":240,"orderType":"dine_in","paid":false,"estimatedPrepMinutes":15}'
```

If the end of the kitchen copy stays inside the printer, add another
`printer.newLine();` in `endSlip` in `server.js`.
