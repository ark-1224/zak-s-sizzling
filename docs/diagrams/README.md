# Diagrams: Zak's Sizzling Hub

Wireframes of every screen built in the code, and process flows of the system, for the thesis paper and the panel defense. They document the code as it is (October 2026); nothing in the app was changed to make them.

- `png/` high-resolution images for the paper (at least ~3000 px wide, about 300 dpi across A4).
- `svg/` the same diagrams as vector images (scale without blur; open in a browser, Inkscape or diagrams.net).
- `source/` the Python files that draw them (standard library only).

## How to read them

**Wireframes** are low-fidelity grey boxes: a box with a cross is a picture (logo, dish photo, illustration, QR code); a small circle is an icon; dark buttons are the main action, dashed grey ones are disabled. Each one is labelled with its screen name, route, screen size, who can open it and the code files it comes from. Notes under each frame explain states and conditions the picture can't show. Dish, category and person data are placeholders (“Dish name”, “₱000.00”); labels, fields and buttons are the real ones from the code. Numbers with a letter (03b, 12c, …) are states or popups of the screen with the same number.

The kiosk is drawn at its 1024 × 600 touchscreen size; the back office at a 1280 px wide desktop, at full page length.

**Process flows** are swimlane activity diagrams: one column per actor, read top to bottom, with standard flowchart symbols (rounded = start/end, rectangle = process, diamond = decision, parallelogram = input/output, double-edged box = a step drawn in full in another flow). A dashed outline marks a step that is partial in the code. Numbers in brackets inside a flow, like (07), refer to wireframe numbers.

## Wireframes

| File | Screen | Route | What it shows | Based on |
|---|---|---|---|---|
| [01-welcome.png](png/01-welcome.png) | Welcome screen | `/  (first stage of the kiosk page)` | Attract screen between customers: logo, headline, picture, “Tap anywhere to start”, payment hints. | components/kiosk/WelcomeScreen.tsx, app/page.tsx |
| [02-dine-in-take-out.png](png/02-dine-in-take-out.png) | Dine in / Take out | `/  (second stage of the kiosk page)` | “Where will you eat today?” with the Dine in and Take out cards. | components/kiosk/OrderTypeScreen.tsx, components/kiosk/OrderTypeArt.tsx |
| [03-menu.png](png/03-menu.png) | Menu | `/  (third stage of the kiosk page)` | The menu: top bar (search, Start over), category rail, dish grid with price chips, order bar; includes a sold-out tile and the “Added” toast. | app/page.tsx, components/kiosk/TopBar.tsx, CategoryRail.tsx, MenuGrid.tsx, ItemTile.tsx, OrderBar.tsx, Toast.tsx |
| [03b-menu-no-results.png](png/03b-menu-no-results.png) | Menu: search with no results | `/` | Search with no results under a price filter; dimmed categories and the two recovery buttons. | app/page.tsx, components/kiosk/MenuGrid.tsx (EmptyGrid), CategoryRail.tsx |
| [03c-menu-loading.png](png/03c-menu-loading.png) | Menu: loading | `/` | Placeholder shapes while the menu loads. | app/page.tsx, components/kiosk/MenuGrid.tsx (MenuGridSkeleton), OrderBar.tsx |
| [03d-menu-load-error.png](png/03d-menu-load-error.png) | Menu: couldn't load | `/` | Full-screen error when the menu can't load, with Try again. | app/page.tsx (error branch) |
| [04-item-details.png](png/04-item-details.png) | Item details sheet (popup) | `/  (popup over the menu)` | Dish details popup: photo, price, stock and prep-time pills, allergens, instruction chips, note, quantity, Add to order. | components/kiosk/ProductModal.tsx, QtyStepper.tsx, NutritionGrid.tsx, lib/instructionChips.ts |
| [05-order-review.png](png/05-order-review.png) | Order review (side panel) | `/  (panel over the menu)` | Order review side panel: lines with quantity steppers and Remove, total, Review & pay. | components/kiosk/CartDrawer.tsx |
| [05b-order-review-empty.png](png/05b-order-review-empty.png) | Order review: empty | `/  (panel over the menu)` | Order review after the last dish is removed. | components/kiosk/CartDrawer.tsx |
| [06-idle-popup.png](png/06-idle-popup.png) | “Still there?” idle popup | `/, /checkout, /checkout/success` | “Still there?” popup shown after 60 seconds without a touch. | components/kiosk/IdleTimeoutOverlay.tsx, hooks/useIdleTimer.ts |
| [07-checkout.png](png/07-checkout.png) | Review & pay (checkout) | `/checkout` | Review & pay: the order with the prep-time estimate, payment method, total and Place order. | app/checkout/page.tsx |
| [07b-checkout-empty.png](png/07b-checkout-empty.png) | Review & pay: empty order | `/checkout` | Review & pay with an empty order. | app/checkout/page.tsx (empty branch) |
| [08-receipt-counter.png](png/08-receipt-counter.png) | Receipt: pay at counter | `/checkout  (after Place order)` | Receipt for a pay-at-counter order: order number, order type, prep time, items, print status, Done. | components/kiosk/ReceiptModal.tsx, app/checkout/page.tsx, lib/receiptPrinter.ts |
| [08b-receipt-paid.png](png/08b-receipt-paid.png) | Receipt: paid online | `/checkout/success  (after PayMongo)` | Receipt after an online payment (partial: online payment isn't live). | components/kiosk/ReceiptModal.tsx, app/checkout/success/page.tsx |
| [09-payment-return.png](png/09-payment-return.png) | Payment return: confirming | `/checkout/success?order=…` | Return page from PayMongo while the payment is being confirmed (partial). | app/checkout/success/page.tsx |
| [09b-payment-return-error.png](png/09b-payment-return-error.png) | Payment return: no order to show | `/checkout/success` | Return page when the order can't be loaded. | app/checkout/success/page.tsx |
| [10-login.png](png/10-login.png) | Staff & Admin Login | `/login` | Staff & Admin sign-in form. | app/login/page.tsx, lib/auth.ts |
| [10b-login-error.png](png/10b-login-error.png) | Staff & Admin Login: wrong details | `/login` | Sign-in form showing the “Invalid email or password” message. | app/login/page.tsx, lib/auth.ts |
| [11-dashboard.png](png/11-dashboard.png) | Live stock dashboard | `/admin` | Admin's landing page: low-stock banner, four KPI tiles, stock level table. | app/admin/page.tsx, components/admin/AdminShell.tsx |
| [11b-dashboard-staff.png](png/11b-dashboard-staff.png) | Live stock dashboard (signed in as Staff) | `/admin` | The same dashboard as Staff see it: no inventory value tile, admin-only menu items hidden. | app/admin/page.tsx, components/admin/AdminShell.tsx |
| [12-products.png](png/12-products.png) | Products | `/admin/products` | Product list with search, category filter, Edit and Delete. | app/admin/products/page.tsx, components/admin/AdminShell.tsx |
| [12b-product-form-add.png](png/12b-product-form-add.png) | Product form: add (count units) | `/admin/products  (popup)` | Add-product popup with every field, counting stock in units. | components/admin/ProductForm.tsx, components/admin/AdminShell.tsx |
| [12c-product-form-recipe.png](png/12c-product-form-recipe.png) | Product form: edit (use a recipe), with a field error | `/admin/products  (popup)` | Edit-product popup using a recipe of raw materials, showing a field error. | components/admin/ProductForm.tsx, components/admin/AdminShell.tsx |
| [12d-product-delete.png](png/12d-product-delete.png) | Products: delete confirmation | `/admin/products  (popup)` | Confirmation before deleting a product. | components/admin/ConfirmDialog.tsx, app/admin/products/page.tsx, components/admin/AdminShell.tsx |
| [13-inventory.png](png/13-inventory.png) | Inventory | `/admin/inventory` | Stock table with the low-stock banner and the adjustment log. | app/admin/inventory/page.tsx, components/admin/AdminShell.tsx |
| [13b-adjust-stock.png](png/13b-adjust-stock.png) | Adjust stock (popup) | `/admin/inventory, /admin/barcode  (popup)` | Adjust-stock popup: add/remove or set exact, quick buttons, preview, reason, note. | components/admin/AdjustStockModal.tsx, components/admin/AdminShell.tsx |
| [14-raw-materials.png](png/14-raw-materials.png) | Raw materials | `/admin/raw-materials` | Raw-material stock table, low-level banner and the stock-movement log. | app/admin/raw-materials/page.tsx, components/admin/AdminShell.tsx |
| [14b-raw-material-adjust.png](png/14b-raw-material-adjust.png) | Adjust raw material (popup) | `/admin/raw-materials  (popup)` | Raw-material adjust popup: add, remove or set exact amount, with a reason. | components/admin/RawMaterialAdjustModal.tsx, components/admin/AdminShell.tsx |
| [14c-raw-material-form.png](png/14c-raw-material-form.png) | Add raw material (popup) | `/admin/raw-materials  (popup)` | Add-raw-material popup (Admin only). | components/admin/RawMaterialForm.tsx, components/admin/AdminShell.tsx |
| [15-barcode-found.png](png/15-barcode-found.png) | Barcode lookup: product found | `/admin/barcode` | Barcode lookup with a product found and the recent lookups. | app/admin/barcode/page.tsx, hooks/useBarcodeScanner.ts, components/admin/AdminShell.tsx |
| [15b-barcode-not-found.png](png/15b-barcode-not-found.png) | Barcode lookup: not found / couldn't look up | `/admin/barcode` | Barcode lookup when no product has the code, and when the lookup fails. | app/admin/barcode/page.tsx, components/admin/AdminShell.tsx |
| [16-bulk-import-preview.png](png/16-bulk-import-preview.png) | Bulk import: preview with an error | `/admin/import` | Bulk import with a loaded CSV and a preview that has an error row. | app/admin/import/page.tsx, components/admin/AdminShell.tsx |
| [16b-bulk-import-result.png](png/16b-bulk-import-result.png) | Bulk import: after importing | `/admin/import` | Bulk import after importing: the result card. | app/admin/import/page.tsx, components/admin/AdminShell.tsx |
| [17-analytics.png](png/17-analytics.png) | Analytics | `/admin/analytics` | Analytics: period switch, KPI tiles, sales chart, top products, profitability, inventory movement, exports. | app/admin/analytics/page.tsx, components/admin/AdminShell.tsx |
| [18-kitchen-display.png](png/18-kitchen-display.png) | Kitchen display | `/kitchen` | Kitchen display with order cards and per-dish Start preparing / Mark done. | app/kitchen/page.tsx, components/admin/AdminShell.tsx |
| [18b-kitchen-display-empty.png](png/18b-kitchen-display-empty.png) | Kitchen display: no active orders | `/kitchen` | Kitchen display with no active orders. | app/kitchen/page.tsx, components/admin/AdminShell.tsx |
| [19-orders-awaiting-payment.png](png/19-orders-awaiting-payment.png) | Orders awaiting payment | `/staff/orders` | Counter payment queue: a normal order, a cancel confirmation and a stock-issue order. | app/staff/orders/page.tsx, components/admin/AdminShell.tsx |
| [19b-orders-awaiting-payment-empty.png](png/19b-orders-awaiting-payment-empty.png) | Orders awaiting payment: nothing waiting | `/staff/orders` | Counter payment queue with nothing waiting. | app/staff/orders/page.tsx, components/admin/AdminShell.tsx |
| [20-users-roles.png](png/20-users-roles.png) | Users & roles | `/admin/users` | User accounts with role cards, role selectors and Suspend / Reactivate. | app/admin/users/page.tsx, components/admin/AdminShell.tsx |
| [20b-invite-user.png](png/20b-invite-user.png) | Invite a new user (popup) | `/admin/users  (popup)` | Invite-a-new-user popup. | app/admin/users/page.tsx (CreateUserModal), components/admin/AdminShell.tsx |
| [20c-confirm-user-change.png](png/20c-confirm-user-change.png) | Users: confirm a change (popup) | `/admin/users  (popup)` | Confirmation before suspending an account (also used for role changes). | components/admin/ConfirmDialog.tsx, app/admin/users/page.tsx, components/admin/AdminShell.tsx |
| [21-kiosk-qr.png](png/21-kiosk-qr.png) | Kiosk QR code | `/admin/kiosk-qr` | Kiosk QR code page with the printable poster. | app/admin/kiosk-qr/page.tsx, components/admin/AdminShell.tsx |
| [21b-kiosk-qr-invalid.png](png/21b-kiosk-qr-invalid.png) | Kiosk QR code: invalid address | `/admin/kiosk-qr` | Kiosk QR code page with an invalid address. | app/admin/kiosk-qr/page.tsx, components/admin/AdminShell.tsx |

Code paths in the wireframe table are relative to `apps/web/src/`.

## Process flows

| File | Process | What it shows | Based on |
|---|---|---|---|
| [flow-01-system-overview.png](png/flow-01-system-overview.png) | System overview | How the customer, staff, admin, API and worker parts fit together; each box points to a detailed flow. | apps/web/src/app/**, apps/api/src/modules/**, apps/worker/src/index.ts and jobs/* (each double-edged box points to its detailed flow) |
| [flow-02-staff-admin-login.png](png/flow-02-staff-admin-login.png) | Staff and admin sign-in and page access | Kiosk-site block, saved-session check, sign-in checks (rate limit, active account, password), admin-only pages. | apps/web/src/proxy.ts, apps/web/src/components/StaffGuard.tsx, apps/web/src/components/admin/AdminRouteGuard.tsx, apps/web/src/app/login/page.tsx, apps/web/src/lib/auth.ts, apps/api/src/modules/auth/routes.ts, apps/api/src/modules/auth/service.ts, apps/api/src/middleware/rateLimit.ts, authorize.ts |
| [flow-03-customer-ordering.png](png/flow-03-customer-ordering.png) | Customer ordering at the kiosk | From walking up to the kiosk to a placed order: menu, dine in / take out, adding dishes, checkout, server checks. | apps/web/src/app/page.tsx, apps/web/src/components/kiosk/*.tsx, apps/web/src/hooks/useCart.tsx, apps/web/src/app/checkout/page.tsx, apps/api/src/modules/orders/routes.ts, apps/api/src/modules/orders/service.ts, apps/api/src/modules/orders/prepTime.ts, apps/api/src/modules/inventory/fulfillment.ts (assertStockForNewOrder) |
| [flow-04-counter-payment.png](png/flow-04-counter-payment.png) | Counter payment, confirmation and cancelling | Staff confirm a counter order (stock check and deduction in one transaction), collect payment, or cancel it. | apps/web/src/app/staff/orders/page.tsx, apps/api/src/modules/payments/routes.ts, apps/api/src/modules/payments/service.ts (confirmCounterPayment), apps/api/src/modules/inventory/fulfillment.ts (deductStockForOrder), apps/api/src/modules/orders/service.ts (listOrders, cancelOrder), apps/api/src/modules/kitchen/service.ts |
| [flow-05-online-payment.png](png/flow-05-online-payment.png) | Online payment with QR Ph (partial) | QR Ph through PayMongo: payment link, fallbacks, webhook, stock-issue flag (partial: not live). | apps/web/src/app/checkout/page.tsx, apps/web/src/app/checkout/success/page.tsx, apps/api/src/modules/payments/routes.ts, apps/api/src/modules/payments/service.ts (createGatewayPaymentIntent, handleWebhook), apps/api/src/lib/paymongo.ts, apps/api/src/modules/inventory/fulfillment.ts |
| [flow-06-kitchen-fulfilment.png](png/flow-06-kitchen-fulfilment.png) | Kitchen fulfilment | Paid orders on the kitchen display: Start preparing, Mark done, card leaves when all dishes are done. | apps/web/src/app/kitchen/page.tsx, apps/api/src/modules/kitchen/routes.ts, apps/api/src/modules/kitchen/service.ts, apps/api/src/modules/orders/prepTime.ts (setEstimateOnReachingKitchen) |
| [flow-07-stock-management.png](png/flow-07-stock-management.png) | Stock adjustments, live sold-out and low-stock alerts | Manual adjustments and automatic deduction, live sold-out updates, low-stock alert queue and emails. | apps/web/src/components/admin/AdjustStockModal.tsx, apps/web/src/components/admin/RawMaterialAdjustModal.tsx, apps/api/src/modules/inventory/service.ts, apps/api/src/modules/raw-materials/service.ts, apps/api/src/modules/inventory/fulfillment.ts, apps/api/prisma/migrations/*low_stock_alerts*, apps/worker/src/index.ts, apps/worker/src/jobs/sendLowStockAlerts.ts, lowStockSweep.ts |
| [flow-08-product-management.png](png/flow-08-product-management.png) | Adding, editing and deleting products (Admin) | Admin adds or edits a product (web and server checks, photo upload) or deletes one. | apps/web/src/app/admin/products/page.tsx, apps/web/src/components/admin/ProductForm.tsx, apps/web/src/lib/imageResize.ts, apps/api/src/modules/products/routes.ts, apps/api/src/modules/products/service.ts, apps/api/src/modules/products/image.ts |
| [flow-09-bulk-import.png](png/flow-09-bulk-import.png) | Bulk product import from CSV or Excel (Admin) | CSV / Excel upload, conversion, dry-run preview, fixing errors, importing. | apps/web/src/app/admin/import/page.tsx, apps/api/src/modules/products/routes.ts, apps/api/src/modules/products/bulkImport.ts, apps/api/src/modules/products/xlsxImport.ts |
| [flow-10-user-management.png](png/flow-10-user-management.png) | Managing user accounts (Admin) | Admin invites accounts, changes roles, suspends and reactivates, with the self-protection checks. | apps/web/src/app/admin/users/page.tsx, apps/web/src/components/admin/ConfirmDialog.tsx, apps/api/src/modules/users/routes.ts, apps/api/src/modules/users/schema.ts, apps/api/src/modules/users/service.ts, apps/api/src/modules/auth/service.ts (refreshAccessToken) |
| [flow-11-barcode-lookup.png](png/flow-11-barcode-lookup.png) | Barcode lookup | Scan or type a barcode; found, not found (admin can add) or failed. | apps/web/src/app/admin/barcode/page.tsx, apps/web/src/hooks/useBarcodeScanner.ts, apps/api/src/modules/products/routes.ts (GET /barcode/:code) |
| [flow-12-reports.png](png/flow-12-reports.png) | Analytics and report export (Admin) | Loading analytics for a period and exporting a report as CSV, Excel or PDF. | apps/web/src/app/admin/analytics/page.tsx, apps/web/src/lib/download.ts, apps/api/src/modules/reports/routes.ts, apps/api/src/modules/reports/service.ts, apps/api/src/modules/reports/export.ts |
| [flow-13-kiosk-idle-reset.png](png/flow-13-kiosk-idle-reset.png) | Kiosk idle reset | The 60 + 20 second idle timer that resets the kiosk for the next customer. | apps/web/src/hooks/useIdleTimer.ts, apps/web/src/components/kiosk/IdleTimeoutOverlay.tsx, apps/web/src/app/page.tsx, apps/web/src/app/checkout/page.tsx, apps/web/src/app/checkout/success/page.tsx |
| [flow-14-kiosk-qr-code.png](png/flow-14-kiosk-qr-code.png) | Kiosk QR code (Admin) | Generating, printing or downloading the kiosk QR code, and a customer scanning it. | apps/web/src/app/admin/kiosk-qr/page.tsx (qrcode package, generated in the browser) |

## What is partial or unclear in the code

These are marked in the diagrams (dashed outlines or notes). They describe the code as found; nothing was changed.

- **Online payment (QR Ph)** is coded but not yet tested with PayMongo: QR Ph is the one online method (it replaced GCash and Maya), and it shows “Not set up yet” until the PayMongo keys are set (08b, 09, flow 05).
- **Cancelling on PayMongo's page** returns to `/checkout?order=…&cancelled=1`, which the checkout page doesn't handle; the order was already emptied, so the customer sees “Your order is empty” (flow 05).
- **A payment not confirmed within 5 checks** shows the receipt with the counter wording, although the customer paid online (flow 05).
- **Order status after cooking**: the database has `preparing`, `ready` and `completed`, but the code never sets them; an order stays `confirmed` after the kitchen finishes, and nothing tells the customer the order is ready (18, flow 06).
- **Changing an order**: staff are told to change a short order with the customer, but no screen edits an existing order. The API has `PATCH`/`DELETE /api/orders/:id/items/:itemId` for staff, unused by the web app (19, flow 04).
- **No admin screen** for categories, or for a dish's ingredients, allergens and nutrition, which the kiosk shows (04); these change only in the database.
- **Orders awaiting payment** doesn't refresh by itself when an order is placed or paid; the server sends `payment:confirmed`, but no page listens (19).
- **Low-stock emails** need email set up for the worker (Resend or SMTP); without it alerts wait in the database (flow 07).
- **No custom “page not found”**: staff pages on the kiosk site show Next.js's default 404, so it has no wireframe.
- **Receipt printing** works only through the print service on the kiosk's Raspberry Pi, whose code isn't in this repository; it currently prints the order number, date, items and total, always with “Please pay at the counter” (08, flow 03). Receipts after an online payment (08b) don't print yet.

## Rebuilding

Nothing needs installing: the scripts use Python's standard library, and the PNGs are made with Microsoft Edge in headless mode (set `EDGE_PATH` if Edge is elsewhere). From the repository root:

```bash
python docs/diagrams/source/build.py
```

`build.py wireframes 12` or `build.py flows 05` rebuilds only the matching diagrams; `readme.py` rewrites this file.

| Source file | Draws |
|---|---|
| `source/wf.py` | wireframe building blocks (boxes, buttons, inputs, tables, popups) |
| `source/screens_kiosk.py` | wireframes 01–09 |
| `source/screens_admin.py` | wireframes 10–21 |
| `source/swimlane.py` | swimlane layout, symbols and connector routing |
| `source/flows.py`, `source/flows_more.py` | process flows 01–14 |
| `source/export.py` | writes the SVG and makes the PNG with headless Edge |
| `source/crop.py` | close-up of part of a PNG, for checking by eye |
