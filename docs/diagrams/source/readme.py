"""Writes docs/diagrams/README.md from the diagram definitions, so names, routes and code
files always match the images. Run after build.py: python docs/diagrams/source/readme.py
"""

from pathlib import Path

import flows
import screens_admin
import screens_kiosk

ROOT = Path(__file__).resolve().parent.parent

WIREFRAME_DESC = {
    "01": "Attract screen between customers: logo, headline, picture, “Tap anywhere to start”, payment hints.",
    "02": "“Where will you eat today?” with the Dine in and Take out cards.",
    "03": "The menu: top bar (search, Start over), category rail, dish grid with price chips, order bar; includes a sold-out tile and the “Added” toast.",
    "03b": "Search with no results under a price filter; dimmed categories and the two recovery buttons.",
    "03c": "Placeholder shapes while the menu loads.",
    "03d": "Full-screen error when the menu can't load, with Try again.",
    "04": "Dish details popup: photo, price, stock and prep-time pills, allergens, the dish's own instruction chips, note, quantity, Add to order; nutrition marked as estimated.",
    "05": "Order review side panel: lines with quantity steppers and Remove, total, Review & pay.",
    "05b": "Order review after the last dish is removed.",
    "06": "“Still there?” popup shown after 60 seconds without a touch.",
    "07": "Review & pay: the order with the prep-time estimate, payment method, total and Place order.",
    "07b": "Review & pay with an empty order.",
    "07c": "QR Ph shown on the kiosk: the code, amount, steps, countdown and Pay at the counter instead.",
    "07d": "QR Ph code expired, with Get a new code.",
    "08": "Receipt for a pay-at-counter order: order number, order type, prep time (watch the counter screen), items, print status, Done.",
    "08b": "Receipt after a QR Ph payment (partial: not yet tested with PayMongo).",
    "09": "Return page from PayMongo's hosted checkout; no longer reached since QR Ph is shown on the kiosk.",
    "09b": "Return page when the order can't be loaded; no longer reached.",
    "10": "Staff & Admin sign-in form.",
    "10b": "Sign-in form showing the “Invalid email or password” message.",
    "10c": "Second sign-in step: the 6-digit code emailed to the account, a wrong-code message, Send a new code.",
    "11": "Admin's landing page: “X items at or below minimum stock” with See more, KPI tiles whose Needs restock and Out of stock open Raw materials filtered, servings per dish.",
    "11b": "The same dashboard as Staff see it: no inventory value tile, admin-only menu items hidden.",
    "12": "Product list with search, category filter, each dish's recipe (or Ready-made), servings or pieces, Edit and Delete.",
    "12b": "Add-product popup for a dish: the required recipe (bill of materials), the dish's special-instruction options, ingredients, allergens and nutrition.",
    "12c": "Edit-dish popup showing a field error; nutrition can be calculated from the recipe.",
    "12d": "Confirmation before deleting a product.",
    "12e": "Product form for a ready-made item (Ready-made category): pieces on hand and minimum instead of a recipe.",
    "13b": "Adjust-stock popup for a ready-made item: add/remove or set exact, quick buttons, preview, reason, note.",
    "14": "Raw materials tab: search, category filter, Needs restock / Out of stock chips, stock table with categories; the page's four tabs.",
    "14b": "Raw-material adjust popup: add, remove or set exact amount, with a reason.",
    "14c": "Add-raw-material popup with its category (Admin only).",
    "14d": "Raw-material nutrition per 100 g popup: USDA FoodData Central search, values, weight per piece (Admin only).",
    "14e": "Dishes (servings) tab: each dish's servings and the raw material that limits it, or NO RECIPE.",
    "14f": "Ready-made (pieces) tab: bottled drinks and other items counted in pieces, with Adjust.",
    "14g": "Stock movements tab: one filterable log of raw-material and ready-made stock changes.",
    "16": "Bulk import with Products and Recipes tables from one Excel file, and a preview with errors and a warning.",
    "16b": "Bulk import after importing: the result card with recipes set.",
    "17": "Analytics: period switch, KPI tiles (with average order value), sales chart, top products, profitability, inventory movement, exports.",
    "18": "Kitchen display: a READY card with Handed over, and order cards with per-dish Start preparing / Mark done (no cancelling).",
    "18b": "Kitchen display with no active orders.",
    "19": "The counter's point of sale, Queue tab: Take payment, a walk-in order being cancelled, a cancelled paid order to refund.",
    "19b": "Queue with nothing waiting.",
    "19c": "Take payment popup: cash with quick amounts and the change, or GCash / Maya with a reference number.",
    "19d": "Receipt after taking payment, with Print receipt on the counter computer's printer.",
    "19e": "New order tab: ring up a walk-in customer from a menu grid, with a cart, dine in / take out and Charge.",
    "19f": "Paid orders tab: paid orders in the kitchen with each dish's progress, Receipt, and Cancel order asking for a reason.",
    "20": "User accounts with role cards, role selectors, Edit, Test email and Suspend / Reactivate.",
    "20b": "Invite-a-new-user popup.",
    "20c": "Confirmation before suspending an account (also used for role changes).",
    "20d": "Edit-account popup: name, email (where sign-in codes go) and a new password.",
    "21": "Kiosk QR code page with the printable poster.",
    "21b": "Kiosk QR code page with an invalid address.",
    "22": "Categories (Admin): add form, the rail's order with ↑ ↓, Edit and Delete with confirmation, and the built-in Ready-made category.",
    "23": "Transactions (Admin): filters, totals with average order value, orders with one opened to its items and timeline.",
    "24": "Order status board on the screen at the counter: Preparing and Ready for pickup order numbers.",
}

FLOW_DESC = {
    "01": "How the customer, staff, admin, API and worker parts fit together; each box points to a detailed flow.",
    "02": "Kiosk-site block, saved-session check, sign-in checks (rate limit, active account, password), the emailed code, admin-only pages.",
    "03": "From walking up to the kiosk to a placed order: menu, dine in / take out, adding dishes, checkout, server checks.",
    "04": "Staff confirm a counter order (stock check and deduction in one transaction), collect payment, or cancel it.",
    "05": "QR Ph shown on the kiosk through PayMongo: code, status check, webhook, new code, pay at the counter instead, stock-issue flag (partial: not yet tested with PayMongo).",
    "06": "Paid orders on the kitchen display: Start preparing, Mark done, card leaves when all dishes are done.",
    "07": "Manual adjustments and automatic deduction, live sold-out updates, low-stock alert queue and emails.",
    "08": "Admin adds or edits a product (web and server checks, photo upload) or deletes one.",
    "09": "CSV / Excel upload, conversion, dry-run preview, fixing errors, importing.",
    "10": "Admin invites accounts, changes roles, suspends and reactivates, with the self-protection checks.",
    "11": "Scan or type a barcode; found, not found (admin can add) or failed.",
    "12": "Loading analytics for a period and exporting a report as CSV, Excel or PDF.",
    "13": "The 60 + 20 second idle timer that resets the kiosk for the next customer.",
    "14": "Generating, printing or downloading the kiosk QR code, and a customer scanning it.",
}


def main():
    lines = [
        "# Diagrams: Zak's Sizzling Hub",
        "",
        "Wireframes of every screen built in the code, and process flows of the system, for the thesis paper and the panel defense. "
        "They document the code as it is (the wireframes as of 13 November 2026, the process flows as of October 2026, so flows 01, 04, 06 to 09 and 11 still show barcode lookup, unit-counted dishes and cancelling from the kitchen); nothing in the app was changed to make them.",
        "",
        "- `png/` high-resolution images for the paper (at least ~3000 px wide, about 300 dpi across A4).",
        "- `svg/` the same diagrams as vector images (scale without blur; open in a browser, Inkscape or diagrams.net).",
        "- `source/` the Python files that draw them (standard library only).",
        "",
        "## How to read them",
        "",
        "**Wireframes** are low-fidelity grey boxes: a box with a cross is a picture (logo, dish photo, illustration, QR code); a small circle is an icon; "
        "dark buttons are the main action, dashed grey ones are disabled. Each one is labelled with its screen name, route, screen size, who can open it "
        "and the code files it comes from. Notes under each frame explain states and conditions the picture can't show. "
        "Dish, category and person data are placeholders (“Dish name”, “₱000.00”); labels, fields and buttons are the real ones from the code. "
        "Numbers with a letter (03b, 12c, …) are states or popups of the screen with the same number.",
        "",
        "The kiosk is drawn at its 1024 × 600 touchscreen size; the back office at a 1280 px wide desktop, at full page length.",
        "",
        "**Process flows** are swimlane activity diagrams: one column per actor, read top to bottom, with standard flowchart symbols "
        "(rounded = start/end, rectangle = process, diamond = decision, parallelogram = input/output, double-edged box = a step drawn in full in another flow). "
        "A dashed outline marks a step that is partial in the code. Numbers in brackets inside a flow, like (07), refer to wireframe numbers.",
        "",
        "## Wireframes",
        "",
        "| File | Screen | Route | What it shows | Based on |",
        "|---|---|---|---|---|",
    ]
    for module in (screens_kiosk, screens_admin):
        for make in module.SCREENS:
            f = make()
            name = f"{f.number}-{module.SLUGS[f.number]}"
            files = f.files.replace("apps/web/src/", "")
            lines.append(f"| [{name}.png](png/{name}.png) | {f.name} | `{f.route}` | {WIREFRAME_DESC[f.number]} | {files} |")
    lines += [
        "",
        "Code paths in the wireframe table are relative to `apps/web/src/`.",
        "",
        "## Process flows",
        "",
        "| File | Process | What it shows | Based on |",
        "|---|---|---|---|",
    ]
    for make in flows.FLOWS_DEF:
        fl = make()
        name = f"flow-{fl.number}-{fl.slug}"
        lines.append(f"| [{name}.png](png/{name}.png) | {fl.title} | {FLOW_DESC[fl.number]} | {fl.sources} |")
    lines += [
        "",
        "## What is partial or unclear in the code",
        "",
        "These are marked in the diagrams (dashed outlines or notes). They describe the code as found; nothing was changed.",
        "",
        "- **Online payment (QR Ph)** is coded but not yet tested with PayMongo keys: the QR Ph code is shown on the kiosk itself "
        "(07c), and QR Ph shows “Not set up yet” until the PayMongo keys are set (07c, 08b, flow 05).",
        "- **The PayMongo return page** (`/checkout/success`, 09 and 09b) is no longer reached since QR Ph is shown on the kiosk; it remains in the code.",
        "- **Ready notice on the phone**: the counter's status board (24) tells customers their order is ready; the receipt on a phone opened from "
        "the QR code does not update by itself (a limitation; could be added later).",
        "- **Changing an order**: staff are told to change a short order with the customer, but no screen edits an existing order. The API has "
        "`PATCH`/`DELETE /api/orders/:id/items/:itemId` for staff, unused by the web app (19, flow 04).",
        "- **Nutrition lookup** needs `USDA_API_KEY` (a free data.gov key) on the API; without it the USDA search says it isn't set up (12b, 14d). "
        "Values are estimates: “Calculate from recipe” uses raw ingredients and doesn't count cooking.",
        "- **Low-stock emails** need email set up for the worker (Brevo, Resend or SMTP); without it alerts wait in the database (flow 07).",
        "- **No custom “page not found”**: staff pages on the kiosk site show Next.js's default 404, so it has no wireframe.",
        "- **Printing** needs `print-service/` running next to each printer, switched on once per device with `?printer=1`: "
        "the kiosk's Raspberry Pi prints the customer receipt (08, flow 03), and the kitchen display's device prints a kitchen ticket "
        "with the order number and dishes once the order is paid (18, flow 06). Phones opened from the QR code don't print.",
        "",
        "## Rebuilding",
        "",
        "Nothing needs installing: the scripts use Python's standard library, and the PNGs are made with Microsoft Edge in headless mode "
        "(set `EDGE_PATH` if Edge is elsewhere). From the repository root:",
        "",
        "```bash",
        "python docs/diagrams/source/build.py",
        "```",
        "",
        "`build.py wireframes 12` or `build.py flows 05` rebuilds only the matching diagrams; `readme.py` rewrites this file.",
        "",
        "| Source file | Draws |",
        "|---|---|",
        "| `source/wf.py` | wireframe building blocks (boxes, buttons, inputs, tables, popups) |",
        "| `source/screens_kiosk.py` | wireframes 01–09 |",
        "| `source/screens_admin.py` | wireframes 10–21 |",
        "| `source/swimlane.py` | swimlane layout, symbols and connector routing |",
        "| `source/flows.py`, `source/flows_more.py` | process flows 01–14 |",
        "| `source/export.py` | writes the SVG and makes the PNG with headless Edge |",
        "| `source/crop.py` | close-up of part of a PNG, for checking by eye |",
        "",
    ]
    (ROOT / "README.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print("README.md written")


if __name__ == "__main__":
    main()
