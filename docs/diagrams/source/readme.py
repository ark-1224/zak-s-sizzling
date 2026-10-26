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
    "04": "Dish details popup: photo, price, stock and prep-time pills, allergens, instruction chips, note, quantity, Add to order.",
    "05": "Order review side panel: lines with quantity steppers and Remove, total, Review & pay.",
    "05b": "Order review after the last dish is removed.",
    "06": "“Still there?” popup shown after 60 seconds without a touch.",
    "07": "Review & pay: the order with the prep-time estimate, payment method, total and Place order.",
    "07b": "Review & pay with an empty order.",
    "07c": "QR Ph shown on the kiosk: the code, amount, steps, countdown and Pay at the counter instead.",
    "07d": "QR Ph code expired, with Get a new code.",
    "08": "Receipt for a pay-at-counter order: order number, order type, prep time, items, print status, Done.",
    "08b": "Receipt after a QR Ph payment (partial: not yet tested with PayMongo).",
    "09": "Return page from PayMongo's hosted checkout; no longer reached since QR Ph is shown on the kiosk.",
    "09b": "Return page when the order can't be loaded; no longer reached.",
    "10": "Staff & Admin sign-in form.",
    "10b": "Sign-in form showing the “Invalid email or password” message.",
    "11": "Admin's landing page: low-stock banner, four KPI tiles, stock level table.",
    "11b": "The same dashboard as Staff see it: no inventory value tile, admin-only menu items hidden.",
    "12": "Product list with search, category filter, Edit and Delete.",
    "12b": "Add-product popup with every field, counting stock in units.",
    "12c": "Edit-product popup using a recipe of raw materials, showing a field error.",
    "12d": "Confirmation before deleting a product.",
    "13": "Stock table with the low-stock banner and the adjustment log.",
    "13b": "Adjust-stock popup: add/remove or set exact, quick buttons, preview, reason, note.",
    "14": "Raw-material stock table, low-level banner and the stock-movement log.",
    "14b": "Raw-material adjust popup: add, remove or set exact amount, with a reason.",
    "14c": "Add-raw-material popup (Admin only).",
    "15": "Barcode lookup with a product found and the recent lookups.",
    "15b": "Barcode lookup when no product has the code, and when the lookup fails.",
    "16": "Bulk import with a loaded CSV and a preview that has an error row.",
    "16b": "Bulk import after importing: the result card.",
    "17": "Analytics: period switch, KPI tiles, sales chart, top products, profitability, inventory movement, exports.",
    "18": "Kitchen display with order cards and per-dish Start preparing / Mark done.",
    "18b": "Kitchen display with no active orders.",
    "19": "Counter payment queue: a normal order, a cancel confirmation and a stock-issue order.",
    "19b": "Counter payment queue with nothing waiting.",
    "20": "User accounts with role cards, role selectors and Suspend / Reactivate.",
    "20b": "Invite-a-new-user popup.",
    "20c": "Confirmation before suspending an account (also used for role changes).",
    "21": "Kiosk QR code page with the printable poster.",
    "21b": "Kiosk QR code page with an invalid address.",
}

FLOW_DESC = {
    "01": "How the customer, staff, admin, API and worker parts fit together; each box points to a detailed flow.",
    "02": "Kiosk-site block, saved-session check, sign-in checks (rate limit, active account, password), admin-only pages.",
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
        "They document the code as it is (October 2026); nothing in the app was changed to make them.",
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
        "- **Order status after cooking**: the database has `preparing`, `ready` and `completed`, but the code never sets them; an order stays "
        "`confirmed` after the kitchen finishes, and nothing tells the customer the order is ready (18, flow 06).",
        "- **Changing an order**: staff are told to change a short order with the customer, but no screen edits an existing order. The API has "
        "`PATCH`/`DELETE /api/orders/:id/items/:itemId` for staff, unused by the web app (19, flow 04).",
        "- **No admin screen** for categories, or for a dish's ingredients, allergens and nutrition, which the kiosk shows (04); these change only in the database.",
        "- **Orders awaiting payment** doesn't refresh by itself when an order is placed or paid; the server sends `payment:confirmed`, but no page listens (19).",
        "- **Low-stock emails** need email set up for the worker (Resend or SMTP); without it alerts wait in the database (flow 07).",
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
