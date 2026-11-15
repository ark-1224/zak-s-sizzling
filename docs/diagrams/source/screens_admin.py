"""Back-office wireframes (10-24), drawn at a 1280 px wide desktop. Pages are drawn at
their full length, so content below the fold is shown too.

Layout, labels, fields and buttons follow the files named in each header. Row data are
placeholders.
"""

from wf import DARK, FILL2, FILL3, FILL4, INK, INK2, INK3, LINE, LINE_SOFT, WHITE, Wireframe, text_width

W = 1280
SIZE = "1280 px wide desktop browser"
BOTH = "Admin and Staff (admin site, signed in)"
ADMIN = "Admin only (admin site, signed in)"
CX, CW = 280, 976  # content column beside the 256 px sidebar
A = "apps/web/src/app/"
C = "apps/web/src/components/admin/"

NAV = [
    ("Operations", [("Dashboard", "/admin", False), ("Products", "/admin/products", True), ("Categories", "/admin/categories", True),
                    ("Raw materials", "/admin/raw-materials", False), ("Market purchases", "/admin/purchases", True), ("Bulk import", "/admin/import", True)]),
    ("Sales", [("Analytics", "/admin/analytics", True), ("Transactions", "/admin/transactions", True)]),
    ("Front of house", [("Kitchen display", "/kitchen", False), ("Orders awaiting payment", "/staff/orders", False)]),
    ("Administration", [("Users & roles", "/admin/users", True), ("Kiosk QR code", "/admin/kiosk-qr", True)]),
]


def admin_page(number, name, route, files, h=800, access=BOTH, role="admin", active=None):
    h = max(h, 900)  # room for the whole sidebar menu above the signed-in box
    f = Wireframe(number, name, route, files + ", " + C + "AdminShell.tsx", W, h, SIZE, access)
    f.rect(0, 0, W, h, fill=FILL2, stroke=None)
    f.view_role = role
    sidebar(f, role, (active or route).split("?")[0].split("  ")[0])
    return f


def sidebar(f, role, active):
    f.rect(0, 0, 256, f.h, fill=WHITE, stroke=None)
    f.line(256, 0, 256, f.h, stroke=LINE)
    f.img(20, 20, 32, 32, r=6)
    f.text(62, 33, "Zak's Sizzling Hub", size=14, bold=True)
    f.text(62, 49, "STOCK INVENTORY", size=11, fill=INK3)
    y = 92
    for group, items in NAV:
        shown = [i for i in items if role == "admin" or not i[2]]
        if not shown:
            continue
        f.text(24, y, group.upper(), size=11, fill=INK3, bold=True)
        y += 12
        for label, href, _ in shown:
            if href == active:
                f.rect(12, y, 232, 38, fill=FILL3, stroke=None, r=6)
            f.icon(36, y + 19, 8)
            f.text(56, y + 24, label, size=14, bold=href == active, fill=INK if href == active else INK2)
            y += 40
        y += 16
    by = f.h - 156
    f.rect(12, by, 232, 140, fill=WHITE, stroke=LINE, r=6)
    f.text(24, by + 22, "SIGNED IN AS", size=11, fill=INK3, bold=True)
    f.circle(40, by + 52, 16, fill=FILL3, stroke=LINE)
    f.text(40, by + 56, "AB", size=11, anchor="middle", bold=True, fill=INK2)
    f.text(64, by + 48, "Full name", size=14, bold=True)
    f.text(64, by + 66, "Admin" if role == "admin" else "Staff", size=12, fill=INK3)
    f.btn(24, by + 84, 208, 40, "Log out", kind="secondary", size=13)
    f.icon(84, by + 104, 7)


def page_header(f, eyebrow, title, actions=(), y=24):
    f.text(CX, y + 12, eyebrow.upper(), size=11, fill=INK3, bold=True)
    f.text(CX, y + 46, title, size=26, bold=True)
    if actions:
        f.btn_row(CX + CW, y + 18, actions, h=36)
    return y + 70


def card(f, x, y, w, h, title=None, actions=None):
    f.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=6)
    if title:
        f.text(x + 18, y + 30, title, size=14, bold=True)
        if actions and w < 700:
            # A narrow card's header wraps: the actions drop onto their own line (Card in ui.tsx).
            actions(x + w - 18, y + 44)
            f.line(x, y + 86, x + w, y + 86, stroke=LINE)
            return y + 86
        f.line(x, y + 48, x + w, y + 48, stroke=LINE)
        if actions:
            actions(x + w - 18, y + 9)
        return y + 48
    return y


def select_action(f, label, width=170):
    return lambda right, top: f.inp(right - width, top, width, 30, value=label, select=True, size=12)


def export_buttons(f):
    def draw(right, top):
        f.btn_row(right, top, [("CSV", "secondary"), ("Excel", "secondary"), ("PDF", "secondary")], h=30, gap=6, size=12)
        f.text(right - 214, top + 20, "Export", size=12, fill=INK3, anchor="end")
    return draw


def kpi(f, x, y, w, label, value, sub):
    f.rect(x, y, w, 116, fill=WHITE, stroke=LINE, r=6)
    f.text(x + 16, y + 26, label.upper(), size=11, fill=INK3, bold=True)
    f.text(x + 16, y + 62, value, size=26, bold=True)
    f.wrap(x + 16, y + 86, w - 32, sub, size=12, fill=INK3)


def banner(f, y, title, detail, h=64, chips=()):
    f.rect(CX, y, CW, h, fill=WHITE, stroke=INK2, r=6, sw=1.5)
    f.circle(CX + 20, y + 22, 4, fill=INK2, stroke=INK2)
    f.text(CX + 34, y + 27, title, size=14, bold=True)
    if detail:
        f.text(CX + 34, y + 48, detail, size=13, fill=INK2)
    x = CX + 34
    for chip in chips:
        x += f.pill(x, y + 38, chip, size=10) + 6


def success_msg(f, y, text):
    f.rect(CX, y, CW, 40, fill=WHITE, stroke=INK2, r=6)
    f.text(CX + 16, y + 25, "✓", size=14, bold=True)
    f.text(CX + 36, y + 25, text, size=13)
    f.text(CX + CW - 18, y + 25, "×", size=16, anchor="end", fill=INK3)
    return y + 54


def P(f, label, filled=False):
    """Table cell: a status pill."""
    return lambda x, y, w, h: f.pill(x + 12, y + h / 2 - 10, label, size=10, filled=filled)


def B(f, *labels):
    """Table cell: small buttons, right-aligned."""
    def draw(x, y, w, h):
        f.btn_row(x + w - 14, y + h / 2 - 15, [(l, "danger" if l == "Delete" else "secondary") for l in labels], h=30, gap=8, size=12)
    return draw


def T2(f, top, bottom):
    """Table cell: two lines of text."""
    def draw(x, y, w, h):
        f.text(x + 12, y + h / 2 - 3, top, size=13, bold=True)
        f.text(x + 12, y + h / 2 + 14, bottom, size=11, fill=INK3)
    return draw


def level_cell(f, pct, label):
    def draw(x, y, w, h):
        f.rect(x + 12, y + h / 2 - 3, w - 90, 6, fill=FILL3, stroke=None, r=3)
        f.rect(x + 12, y + h / 2 - 3, (w - 90) * pct, 6, fill=DARK, stroke=None, r=3)
        f.pill(x + w - 70, y + h / 2 - 10, label, size=10)
    return draw


def modal(f, w, h, y=None):
    f.dim()
    x = (f.w - w) / 2
    y = (f.h - h) / 2 if y is None else y
    f.rect(x, y, w, h, fill=WHITE, stroke=INK2, r=8, sw=2)
    return x + 28, y + 28, w - 56


def modal_actions(f, right, y, buttons):
    f.btn_row(right, y, buttons, h=38)


def segmented_bar(f, x, y, w, labels, selected):
    f.segmented(x, y, w, 40, labels, selected, size=13)


# --- 10 login ----------------------------------------------------------------------------
def login_page(error):
    f = Wireframe("10b" if error else "10", "Staff & Admin Login" + (": wrong details" if error else ""), "/login",
                  A + "login/page.tsx, apps/web/src/lib/auth.ts", W, 800, SIZE, "Anyone on the admin site (signs in Staff and Admin)")
    f.rect(0, 0, W, 800, fill=FILL2, stroke=None)
    x, y, w = 448, 210 if error else 226, 384
    h = 388 if error else 352
    f.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=16)
    f.text(x + 32, y + 52, "Staff & Admin Login", size=24, bold=True)
    f.text(x + 32, y + 78, "Zak's Sizzling Hub back office", size=15, fill=INK2)
    f.inp(x + 32, y + 132, w - 64, 44, label="Email", value="name@example.com" if error else "")
    f.inp(x + 32, y + 212, w - 64, 44, label="Password", value="••••••••" if error else "")
    by = y + 280
    if error:
        f.text(x + 32, by + 6, "Invalid email or password", size=15, bold=True)
        by += 30
    f.btn(x + 32, by, w - 64, 48, "Sign in", kind="primary", r=24, size=16)
    if error:
        f.add_note("The API answers 401 “Invalid email or password” for an unknown email, a suspended account or a wrong password (the same message for all three). Too many failed attempts are rate limited: “Too many failed sign-in attempts. Try again in …”.")
    else:
        f.add_note("Both fields are required. A correct password emails a 6-digit code to the account and opens the code step (10c); only the code starts the session (with LOGIN_CODES=off the password alone does, and the dashboard (11) opens).")
        f.add_note("Staff pages (/admin, /staff, /kitchen) send anyone not signed in back here, and after signing in return them to that page with its address (e.g. /kitchen?printer=1); signing in directly opens the dashboard. On the kiosk site this page doesn't exist (page not found).")
    return f


def login():
    return login_page(False)


def login_error():
    return login_page(True)


def login_code():
    f = Wireframe("10c", "Staff & Admin Login: emailed code", "/login",
                  A + "login/page.tsx (CodeStep), apps/web/src/lib/auth.ts", W, 800, SIZE, "Anyone on the admin site (signs in Staff and Admin)")
    f.rect(0, 0, W, 800, fill=FILL2, stroke=None)
    x, y, w, h = 448, 196, 384, 418
    f.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=16)
    f.text(x + 32, y + 52, "Check your email", size=24, bold=True)
    f.wrap(x + 32, y + 80, w - 64, "We sent a 6-digit code to ma•••@gmail.com. It works for 10 minutes.", size=15, fill=INK2)
    f.inp(x + 32, y + 160, w - 64, 56, label="Sign-in code", value="0 4 2 7 1 9", size=26, mono=True)
    f.text(x + 32, y + 238, "Not there? Check the spam folder.", size=13, fill=INK3)
    f.text(x + 32, y + 270, "That code isn't right. 4 tries left.", size=15, bold=True)
    f.btn(x + 32, y + 290, w - 64, 48, "Sign in", kind="primary", r=24, size=16)
    f.text(x + 32, y + 376, "Send a new code in 42s", size=14, fill=INK3)
    f.text(x + w - 32, y + 376, "Use a different account", size=14, fill=INK2, anchor="end")
    f.add_note("Shown after a correct password (10). The code arrives by email (Brevo) and is checked as soon as six digits are typed or pasted; spaces or a dash are ignored. A wrong code shows how many of the 5 tries are left.")
    f.add_note("“Send a new code” is available 60 seconds after each email, at most 3 times. An expired code, 5 wrong tries or the most codes go back to the password with the reason. If the email can't be sent the password step says “We couldn't send your sign-in code”. Use a different account goes back to 10.")
    return f


# --- 11 dashboard ------------------------------------------------------------------------
def tabbar(f, x, y, labels, selected, h=36):
    """A tab list in one frame (Raw materials tabs, Orders awaiting payment tabs); returns the y below it."""
    widths = [text_width(l, 13, True) + 32 for l in labels]
    f.rect(x, y, sum(widths) + 8, h + 8, fill=WHITE, stroke=LINE, r=6)
    cx = x + 4
    for label, w, i in zip(labels, widths, range(len(labels))):
        f.btn(cx, y + 4, w, h, label, kind="primary" if i == selected else "ghost", size=13)
        cx += w
    return y + h + 8


def chip_row(f, x, y, labels, selected=0, h=30, size=12):
    """Round filter chips (All / Needs restock / Out of stock, categories); returns the x after the last."""
    for i, label in enumerate(labels):
        w = text_width(label, size, True) + 28
        f.btn(x, y, w, h, label, kind="primary" if i == selected else "secondary", r=h / 2, size=size)
        x += w + 8
    return x


def kpi_link(f, x, y, w, label, value, sub):
    """A dashboard tile that is a link: the arrow after the label."""
    kpi(f, x, y, w, label, value, sub)
    f.text(x + w - 16, y + 26, "→", size=14, anchor="end", fill=INK2)


def dashboard_page(role):
    staff = role == "staff"
    f = admin_page("11b" if staff else "11", "Live stock dashboard" + (" (signed in as Staff)" if staff else ""), "/admin",
                   A + "admin/page.tsx, " + C + "ui.tsx (KpiTile)", h=900, role=role, active="/admin")
    y = page_header(f, "Realtime stock tracking", "Live stock dashboard")
    f.rect(CX, y, CW, 56, fill=WHITE, stroke=INK2, r=6, sw=1.5)
    f.circle(CX + 20, y + 28, 4, fill=INK2, stroke=INK2)
    f.text(CX + 34, y + 33, "5 items at or below minimum stock", size=14, bold=True)
    f.btn(CX + CW - 120, y + 11, 104, 34, "See more", size=13)
    y += 66
    f.rect(CX, y, CW, 64, fill=WHITE, stroke=INK2, r=6, sw=1.5)
    f.text(CX + 18, y + 24, "2 items to use soon · 1 past its fresh days", size=14, bold=True)
    f.text(CX + 18, y + 46, "Raw material (2.4 kg): went off Nov 13, bought Nov 7. Check it before using.  ·  Ready-made item (12 pc): goes off Nov 20 (printed date), in 5 days.", size=12, fill=INK2)
    f.btn(CX + CW - 120, y + 15, 104, 34, "See items", size=13)
    y += 82
    tiles = [("Active SKUs", "20", "6 categories", False)]
    if not staff:
        tiles.append(("Inventory value", "₱00,000", "At cost · 30 of 34 items have a cost", False))
    tiles += [("Needs restock", "5", "Items at or below minimum", True), ("Out of stock", "1", "Items with none left", True)]
    tw = (CW - 14 * (len(tiles) - 1)) / len(tiles)
    for i, (label, value, sub, link) in enumerate(tiles):
        (kpi_link if link else kpi)(f, CX + i * (tw + 14), y, tw, label, value, sub)
    y += 134
    top = card(f, CX, y, CW, 900 - y - 24, "Servings available per dish (pieces for ready-made items)")
    rows = []
    for i in range(9):
        qty, level = [("12 servings", (1, "OK")), ("0 servings", (0.02, "OUT")), ("24 pieces", (1, "OK")), ("4 pieces", (0.35, "LOW"))][i % 4]
        rows.append(["Dish name" if "serv" in qty else "Ready-made item", "Ready-made" if "piece" in qty else "Category", qty, level_cell(f, *level)])
    f.table(CX, top, CW, [("Product", 0.38, "left"), ("Category", 0.22, "left"), ("Servings / pieces", 0.14, "right"), ("Level", 0.26, "left")],
            rows, rowh=46)
    if staff:
        f.add_note("Staff see the same page without the Inventory value tile (costs are admin-only) and without the admin-only menu items: Products, Categories, Bulk import, Analytics, Transactions, Users & roles and Kiosk QR code.")
    else:
        f.add_note("Landing page after sign-in. Every dish is made from a bill of materials (panel feedback), so stock is counted in raw materials, plus the ready-made items (sold as they are, counted in pieces). The notice and the Needs restock / Out of stock tiles count both.")
        f.add_note("The notice shows only when something is at or below its minimum. See more and Needs restock open Raw materials filtered to what needs restocking (14, ?filter=low), Out of stock to what has none left (?filter=out); when only ready-made items match, they open the Ready-made tab (14f).")
        f.add_note("Level: OK, LOW (a ready-made item at or below its minimum) or OUT. A dish runs low when one of its raw materials does, which the notice reports. Inventory value is the raw materials and ready-made items at cost.")
        f.add_note("The second notice (GET /api/inventory/freshness) lists items to use soon: the oldest stock on hand (assuming the oldest is used first) near or past the days it stays fresh, counted from its market purchase, or a packaged item within 7 days of its printed date. See items opens Raw materials, which shows the same notice.")
    return f


def dashboard():
    return dashboard_page("admin")


def dashboard_staff():
    return dashboard_page("staff")


# --- 12 products -------------------------------------------------------------------------
def products_base(f):
    y = page_header(f, "Product catalog management", "Products", [("Bulk import", "secondary"), ("+ Add product", "primary")])
    f.inp(CX, y, 384, 38, placeholder="Search name or category")
    f.inp(CX + 396, y, 240, 38, value="All categories", select=True)
    f.text(CX + 652, y + 24, "20 products", size=13, fill=INK3)
    y += 56
    top = card(f, CX, y, CW, f.h - y - 24)
    recipe = ["3 raw materials", "5 raw materials", "No recipe yet", "Ready-made (pieces)"]
    rows = [["Product name", "Ready-made" if i % 4 == 3 else "Category", recipe[i % 4], "₱000.00", "₱00.00" if i % 3 else "—",
             "0" if i % 4 == 2 else str(12 - i), P(f, "SOLD OUT" if i % 4 == 2 else "IN STOCK"), B(f, "Edit", "Delete")] for i in range(12)]
    f.table(CX, top, CW, [("Product", 0.18, "left"), ("Category", 0.12, "left"), ("Recipe", 0.15, "left"), ("Price", 0.09, "right"),
                          ("Cost", 0.08, "right"), ("Servings / pieces", 0.11, "right"), ("Status", 0.1, "left"), ("Actions", 0.17, "right")],
            rows, rowh=46)


def products():
    f = admin_page("12", "Products", "/admin/products", A + "admin/products/page.tsx", h=800, access=ADMIN)
    products_base(f)
    f.add_note("Search matches name or category and works together with the category filter. With no match: “No products match … ” and a Clear search / Show all categories button.")
    f.add_note("Recipe: how many raw materials the dish's bill of materials has, “No recipe yet” (the dish is sold out until it gets one), or “Ready-made (pieces)” for an item in the Ready-made category. Servings / pieces: what the raw materials can make, or a ready-made item's pieces.")
    f.add_note("+ Add product and Edit open the product form (12b, 12c, 12e); Delete asks first (12d). After a save a confirmation bar appears above the table. Bulk import opens 16.")
    return f


def instructions_box(f, x, y, w, chips=("Extra spicy", "No onions", "Extra rice")):
    """Special instructions on the kiosk, set per dish (ProductForm.tsx, InstructionOptionsField)."""
    f.rect(x, y, w, 150, fill=FILL2, stroke=LINE, r=6)
    f.text(x + 12, y + 22, "Special instructions on the kiosk", size=12, bold=True, fill=INK2)
    f.checkbox(x + w - 190, y + 10, checked=True, size=14)
    f.text(x + w - 170, y + 22, "Offer special instructions", size=12)
    f.wrap(x + 12, y + 44, w - 24, "Quick options customers can tap, sent to the kitchen with the order. Customers can also type a note.", size=11, fill=INK3)
    cx = x + 12
    if not chips:
        f.text(x + 12, y + 91, "No quick options: customers can only type a note.", size=12, fill=INK3)
    for name in chips:
        cw = text_width(name, 12) + 34
        f.rect(cx, y + 74, cw, 26, fill=WHITE, stroke=LINE, r=13)
        f.text(cx + 10, y + 91, name + "  ×", size=12)
        cx += cw + 6
    f.inp(x + 12, y + 110, w - 100, 30, placeholder="e.g. No onions", size=12)
    f.btn(x + w - 80, y + 110, 68, 30, "Add", size=12)
    return y + 168


def product_form_fields(f, x, y, w, mode):
    """mode: "add" (a dish with its recipe), "edit" (a dish, with a field error) or "ready" (a ready-made item)."""
    edit, ready = mode == "edit", mode == "ready"
    f.text(x, y + 12, "EDIT PRODUCT" if edit else "NEW PRODUCT", size=11, fill=INK3, bold=True)
    f.text(x, y + 38, "Dish name" if edit else "Add a product", size=18, bold=True)
    f.text(x, y + 60, "Fields marked * are required.", size=12, fill=INK3)
    y += 100
    f.inp(x, y, w, 38, label="Name *", value="Dish name" if edit else "Ready-made item" if ready else "")
    y += 66
    half = (w - 12) / 2
    f.inp(x, y, half, 38, label="Category *", value="Ready-made" if ready else "Sizzling Plates", select=True)
    f.inp(x + half + 12, y, half, 38, label="Icon (emoji)", value="(emoji)")
    y += 62
    f.text(x, y + 4, "Photo", size=12, bold=True, fill=INK2)
    f.img(x, y + 14, 80, 80, r=6, label="Icon")
    f.btn(x + 96, y + 38, 124, 32, "Choose photo", size=12)
    f.wrap(x + 96, y + 90, w - 96, "Optional. Without a photo, the kiosk shows the icon. JPEG, PNG or WebP; it's made smaller before uploading.", size=11, fill=INK3)
    y += 136
    f.inp(x, y, half, 38, label="Price (₱) *", value="" if edit else "000.00", invalid=edit)
    if ready:
        f.inp(x + half + 12, y, half, 38, label="Cost per piece (₱)", value="00.00")
    else:
        f.inp(x + half + 12, y, half, 38, label="Cost from the recipe", value="₱000.00 · margin 00%")
        f.rect(x + half + 12, y + 18, half, 38, fill=FILL2, stroke=LINE_SOFT, r=4, opacity=0.5)
    if edit:
        f.text(x, y + 56, "Enter a price.", size=12, bold=True)
        y += 18
    y += 66
    f.inp(x, y, 160, 38, label="Preparation time (minutes) *", value="0" if ready else "10")
    f.wrap(x, y + 56, w, "For one serving. Use 0 for items served as they are, like bottled drinks. Orders use it to estimate when they'll be ready.", size=11, fill=INK3)
    y += 92
    if ready:
        f.rect(x, y - 8, w, 196, fill=FILL2, stroke=LINE, r=6)
        f.text(x + 12, y + 14, "Stock (counted in pieces)", size=12, bold=True, fill=INK2)
        f.wrap(x + 12, y + 34, w - 24, "Ready-made items are sold as they are, so they have no recipe. Each order takes one piece, and the item shows as sold out at 0. Restock it on Raw materials › Ready-made.", size=12, fill=INK2)
        hw = (w - 36) / 2
        f.inp(x + 12, y + 96, hw, 36, label="Pieces on hand *", value="24")
        f.inp(x + 24 + hw, y + 96, hw, 36, label="Minimum *", value="6")
        f.text(x + 12, y + 160, "At or below the minimum, it counts as needing restock on the dashboard.", size=11, fill=INK3)
        y += 202
    else:
        f.rect(x, y - 8, w, 236, fill=FILL2, stroke=LINE, r=6)
        f.text(x + 12, y + 14, "Recipe (bill of materials) *", size=12, bold=True, fill=INK2)
        f.wrap(x + 12, y + 34, w - 24, "Raw materials used by one serving. The dish's stock is the servings these can make: paying for an order deducts them, and the dish shows as sold out when they can't make another serving.", size=12, fill=INK2)
        ry = y + 66
        for name, qty, unit in [("Raw material", "150", "g"), ("Raw material", "1", "pc")]:
            f.inp(x + 12, ry, w - 160, 36, value=name, select=True, size=12)
            f.inp(x + w - 140, ry, 72, 36, value=qty, size=12)
            f.text(x + w - 60, ry + 23, unit, size=12, fill=INK3)
            f.btn(x + w - 46, ry + 2, 32, 32, "×", size=14)
            ry += 44
        f.btn(x + 12, ry + 2, 150, 30, "+ Add raw material", size=12)
        f.text(x + w - 12, ry + 22, "Current stock makes 12 servings", size=12, anchor="end", fill=INK2)
        f.text(x + 12, ry + 54, "Per serving: Raw material 150 g, Raw material 1 pc", size=12, fill=INK3)
        y += 242
    y = instructions_box(f, x, y, w, chips=() if ready else ("Extra spicy", "No onions", "Extra rice"))
    f.textarea(x, y + 18, w, 64, label="Description")
    y += 104
    y = details_fields(f, x, y, w, not ready)
    f.btn_row(x + w, y, [("Cancel", "secondary"), ("Save changes" if edit else "Add product", "primary")], h=38)
    return y + 38


def details_fields(f, x, y, w, recipe):
    """Ingredients, allergens and nutrition per serving (ProductDetailsFields.tsx)."""
    top = y
    h = 408 if recipe else 386
    f.rect(x, y, w, h, fill=FILL2, stroke=LINE, r=6)
    f.text(x + 12, y + 20, "Ingredients, allergens and nutrition", size=12, bold=True, fill=INK2)
    y += 40
    f.text(x + 12, y, "Ingredients", size=12, bold=True, fill=INK2)
    cx = x + 12
    for name in ["Ingredient", "Ingredient", "Soy sauce"]:
        cw = text_width(name, 12) + 34
        f.rect(cx, y + 8, cw, 26, fill=WHITE, stroke=LINE, r=13)
        f.text(cx + 10, y + 25, name + "  ×", size=12)
        cx += cw + 6
    y += 42
    f.inp(x + 12, y, w - 100, 34, placeholder="Type an ingredient, then Enter", size=12)
    f.btn(x + w - 80, y, 68, 34, "Add", size=12)
    y += 40
    if recipe:
        f.text(x + 12, y + 10, "Add the recipe's raw materials as ingredients", size=12, fill=INK2)
        y += 22
    f.text(x + 12, y + 14, "Allergens", size=12, bold=True, fill=INK2)
    y += 22
    allergens = ["Milk", "Egg", "Fish", "Shellfish", "Peanuts", "Tree nuts", "Gluten", "Soy", "Sesame"]
    col = (w - 24) / 3
    for i, a in enumerate(allergens):
        ax, ay = x + 12 + (i % 3) * col, y + (i // 3) * 22
        f.checkbox(ax, ay, checked=a == "Egg", size=14)
        f.text(ax + 20, ay + 12, a, size=12)
    y += 84
    f.text(x + 12, y, "Suggested from the ingredients:", size=12, fill=INK2)
    f.btn(x + 206, y - 16, 136, 24, "+ Soy (Soy sauce)", size=11)
    y += 18
    f.text(x + 12, y + 14, "Nutrition per serving", size=12, bold=True, fill=INK2)
    y += 40
    nw = (w - 24 - 18) / 4
    for i, label in enumerate(["Calories (kcal)", "Protein (g)", "Carbs (g)", "Sugar (g)"]):
        f.inp(x + 12 + i * (nw + 6), y, nw, 32, label=label, value=["420", "26", "8", "2"][i], size=12)
    y += 46
    f.btn(x + 12, y, 176, 28, "Look up the dish (USDA)", size=11)
    if recipe:
        f.btn(x + 196, y, 150, 28, "Calculate from recipe", size=11)
    f.text(x + 12, top + h - 10, "The kiosk shows these as estimated values. Leave a value blank if it isn't known.", size=11, fill=INK3)
    return top + h + 18


def form_height(mode, w=456):
    """How tall the product form is, measured by drawing it once off-page."""
    probe = Wireframe("x", "x", "x", "x", 10, 10, "x", "x")
    return product_form_fields(probe, 0, 0, w, mode) + 28


def product_form_page(number, name, mode):
    h = form_height(mode) + 56
    f = admin_page(number, name, "/admin/products  (popup)", C + "ProductForm.tsx, " + C + "ProductDetailsFields.tsx", h=h + 80, access=ADMIN)
    products_base(f)
    x, y, w = modal(f, 512, h, y=40)
    product_form_fields(f, x, y, w, mode)
    return f


def product_form():
    f = product_form_page("12b", "Product form: add a dish with its recipe", "add")
    f.add_note("Every dish is made from a bill of materials (panel feedback): the recipe is required to save, and there is no stock count of its own. Each raw material can be used once per recipe; saving a recipe puts its raw materials back in use.")
    f.add_note("Special instructions on the kiosk: the dish's own quick options (up to 8, 30 characters each; × removes, Add or Enter adds). A new dish starts with its category's usual options. Untick Offer special instructions to hide the section on the kiosk (04) for this dish.")
    f.add_note("On shorter screens the popup scrolls. The photo is uploaded after the product is saved; if only the photo fails, the form stays open and says so. Ingredients are tags; allergens a checklist with suggestions from the ingredients; nutrition per serving typed, looked up in USDA FoodData Central, or calculated from the recipe.")
    return f


def product_form_recipe():
    f = product_form_page("12c", "Product form: edit a dish, with a field error", "edit")
    f.add_note("Checks on Save, each shown under its field and focusing the first problem: name required; price ₱0.00 or more; cost blank or ₱0.00 or more; prep time whole minutes 0–120; a recipe with at least one complete row.")
    f.add_note("“Calculate from recipe” (POST /api/nutrition/estimate): each raw material's grams per serving ÷ 100 × its values per 100 g (set in 14d), added up. Raw materials without nutrition, or pieces without a weight, are left out and named.")
    return f


def product_form_ready():
    f = product_form_page("12e", "Product form: a ready-made item (counted in pieces)", "ready")
    f.add_note("Choosing the built-in Ready-made category swaps the recipe for Pieces on hand and Minimum (whole pieces, 0–100,000). The count is sent only when it was changed here, so a sale made while the form was open isn't written over; the logged way to restock is Adjust stock on Raw materials › Ready-made (13b).")
    f.add_note("A dish moved into Ready-made loses its recipe (“Saving removes this dish's recipe.”); moving an item out of Ready-made needs a recipe again. A recipe sent for a ready-made item is refused by the API.")
    return f


def product_delete():
    f = admin_page("12d", "Products: delete confirmation", "/admin/products  (popup)", C + "ConfirmDialog.tsx, " + A + "admin/products/page.tsx", h=800, access=ADMIN)
    products_base(f)
    x, y, w = modal(f, 448, 230)
    f.text(x, y + 22, "Delete Product name?", size=18, bold=True)
    f.wrap(x, y + 52, w, "It disappears from the menu and the kiosk, and this can't be undone. A product that has already been ordered can't be deleted; mark it unavailable instead.", size=13, fill=INK2)
    f.btn_row(x + w, y + 134, [("Cancel", "secondary"), ("Yes, delete", "danger")], h=38)
    f.add_note("If the API refuses (for example the product has been ordered before), its message shows above the table.")
    return f


# --- 14 raw materials (the inventory) ----------------------------------------------------
RAW_TABS = ["Raw materials", "Dishes (servings)", "Ready-made (pieces)", "Stock movements", "Stock count"]
RAW_FILES = A + "admin/raw-materials/page.tsx"


def raw_base(f, role="admin", tab=0):
    admin = role == "admin"
    y = page_header(f, "Inventory · bill of materials", "Raw materials", [("+ Add raw material", "primary")] if admin else ())
    y = tabbar(f, CX, y, RAW_TABS, min(tab, 4)) + 16
    if tab == 0:
        banner(f, y, "2 raw materials at or below minimum level", "Raw material (1.2 kg left), Raw material (800 g left)")
        y += 80
        f.inp(CX, y, 288, 38, placeholder="Search raw materials")
        f.inp(CX + 300, y, 250, 38, value="All categories", select=True)
        y += 52
        chip_row(f, CX, y, ["All (24)", "Needs restock (2)", "Out of stock (1)"])
        y += 46
        top = card(f, CX, y, CW, 30 + 6 * 50)
        status = ["OK", "LOW", "OK", "OUT", "LOW", "OK"]
        cats = ["Meat & seafood", "Meat & seafood", "Dairy & eggs", "Vegetables & fruit", "Sauces & seasonings", "Oils & fats"]
        rows = [[T2(f, "Raw material", cats[i]), ["5 kg", "1.2 kg", "24 pc", "0 g", "800 ml", "3 L"][i], ["1 kg", "2 kg", "10 pc", "500 g", "1 L", "1 L"][i],
                 P(f, status[i]), "Dish name (150 g), Dish name (100 g)" if i in (0, 4) else "Dish name (1 pc)" if i == 2 else "—",
                 B(f, "Adjust", "Edit", "Nutrition ✓" if i in (0, 2) else "Nutrition") if admin else B(f, "Adjust")] for i in range(6)]
        f.table(CX, top, CW, [("Raw material", 0.17, "left"), ("On hand", 0.09, "right"), ("Min", 0.08, "right"), ("Status", 0.08, "left"),
                              ("Used in", 0.28, "left"), ("Actions", 0.3, "right")], rows, rowh=50)
    elif tab == 1:
        top = card(f, CX, y, CW, 60 + 6 * 50)
        f.wrap(CX + 18, y + 24, CW - 36, "A dish has no stock of its own: it can be made as long as every raw material in its recipe has enough for a serving. Restock the limiting raw material to make more.", size=12, fill=INK2)
        f.line(CX, y + 56, CX + CW, y + 56, stroke=LINE)
        rows = [[T2(f, "Dish name", "Category"), "0", "Raw material (100 g left)", "Raw material 150 g, Raw material 1 pc"],
                [T2(f, "Dish name", "Category"), "4", "Raw material (600 g left)", "Raw material 150 g, Raw material 20 ml"],
                [T2(f, "Dish name", "Category"), "12", "Raw material (12 pc left)", "Raw material 1 pc, Raw material 200 g"],
                [T2(f, "Dish name", "Category"), "25", "Raw material (5 kg left)", "Raw material 200 g"],
                [T2(f, "Dish name", "Category"), P(f, "NO RECIPE", filled=True), "Add its recipe in Products" if admin else "Ask an administrator to add its recipe", "—"]]
        f.table(CX, y + 56, CW, [("Dish", 0.22, "left"), ("Servings", 0.1, "right"), ("Limited by", 0.28, "left"), ("Recipe", 0.4, "left")], rows, rowh=50)
    elif tab == 2:
        chip_row(f, CX, y, ["All (4)", "Needs restock (1)", "Out of stock (0)"])
        y += 46
        top = card(f, CX, y, CW, 56 + 30 + 4 * 46)
        f.wrap(CX + 18, y + 24, CW - 36, "Sold as they are, so they have no recipe: each order takes one piece, and the item shows as sold out at 0." + (" Add one on the Products page in the Ready-made category." if admin else ""), size=12, fill=INK2)
        f.line(CX, y + 56, CX + CW, y + 56, stroke=LINE)
        rows = [["Ready-made item", "24 pcs", "6 pcs", P(f, "OK"), B(f, "Adjust")], ["Ready-made item", "4 pcs", "6 pcs", P(f, "LOW"), B(f, "Adjust")],
                ["Ready-made item", "36 pcs", "10 pcs", P(f, "OK"), B(f, "Adjust")], ["Ready-made item", "12 pcs", "5 pcs", P(f, "OK"), B(f, "Adjust")]]
        f.table(CX, y + 56, CW, [("Item", 0.4, "left"), ("On hand", 0.13, "right"), ("Min", 0.13, "right"), ("Status", 0.14, "left"), ("Actions", 0.2, "right")], rows, rowh=46)
    elif tab == 4:
        stock_count_body(f, y, result=False, admin=admin)
    elif tab == 5:
        stock_count_body(f, y, result=True, admin=admin)
    else:
        fw = 170
        for i, (label, value) in enumerate([("Show", "Raw materials and ready-made"), ("Item", "All items"), ("Change", "All changes")]):
            f.inp(CX + i * (fw + 46 + 12), y + 20, fw + 46, 36, label=label, value=value, select=True, size=12)
        f.inp(CX + 3 * (fw + 58), y + 20, 130, 36, label="From", value="mm/dd/yyyy", size=12)
        f.inp(CX + 3 * (fw + 58) + 142, y + 20, 130, 36, label="To", value="mm/dd/yyyy", size=12)
        y += 74
        top = card(f, CX, y, CW, f.h - y - 24, "45 movements")
        rows = [["Nov 13, 9:36 PM", "Raw material", "+360 g  (3.64 kg→4 kg)", "Customer return", "Order ZK-XXXXXX cancelled while in the kitchen", "Full name"],
                ["Nov 13, 9:36 PM", "Ready-made item (ready-made)", "+1 pc  (13 pc→14 pc)", "Customer return", "Order ZK-XXXXXX cancelled while in the kitchen", "Full name"],
                ["Nov 13, 9:35 PM", "Raw material", "−360 g  (4 kg→3.64 kg)", "Sale · ZK-XXXXXX", "—", "Sale"],
                ["Nov 13, 9:35 PM", "Ready-made item (ready-made)", "−1 pc", "Sale · ZK-XXXXXX", "—", "Sale"],
                ["Nov 13, 1:30 AM", "Ready-made item (ready-made)", "+10 pc  (4 pc→14 pc)", "Restock / delivery received", "—", "Full name"],
                ["Nov 12, 9:00 AM", "Raw material", "+5 kg  (0 g→5 kg)", "Restock / delivery received", "Delivery from the supplier", "Full name"],
                ["Nov 11, 9:40 PM", "Raw material", "−200 g  (1 kg→800 g)", "Spoilage", "—", "Full name"]]
        f.table(CX, top, CW, [("When", 0.12, "left"), ("Item", 0.19, "left"), ("Change", 0.17, "right"), ("Why", 0.17, "left"),
                              ("Note", 0.25, "left"), ("By", 0.1, "left")], rows, rowh=42)


def raw_materials():
    f = admin_page("14", "Raw materials", "/admin/raw-materials", RAW_FILES + ", apps/web/src/lib/rawMaterialCategories.ts", h=900)
    raw_base(f)
    f.add_note("The whole inventory (panel feedback: every dish is made from a bill of materials). Four tabs: Raw materials, Dishes (servings) (14e), Ready-made (pieces) (14f) and Stock movements (14g); the old Inventory page (/admin/inventory) opens the Dishes tab.")
    f.add_note("Search finds raw materials by name and the category filter by category (Meat & seafood, Vegetables & fruit, Rice & noodles, Sauces & seasonings, Oils & fats, Dairy & eggs, Drinks & ice, Others, each with its count); they combine with the All / Needs restock / Out of stock chips, whose counts follow them. No match: “No raw material matches “…”.” with Clear the search.")
    f.add_note("The chips are in the address (?filter=low or ?filter=out), so the dashboard (11) links straight to them; with a chip on, ready-made items that also match are named with a link to their tab. Admin and Staff can Adjust (14b). Only an Admin sees + Add raw material, Edit (14c) and Nutrition (14d; “✓” when set). A material not in use is dimmed with “(not in use)”.")
    return f


def raw_materials_staff():
    f = admin_page("14l", "Raw materials (signed in as Staff)", "/admin/raw-materials", RAW_FILES + ", apps/web/src/lib/rawMaterialCategories.ts", h=900, role="staff")
    raw_base(f, role="staff")
    f.add_note("The Raw materials tab as Staff see it: the same search, category filter, chips and stock table as the Administrator (14), with Adjust (14b) on each row, but without + Add raw material, Edit and Nutrition, which are admin-only. Staff use this page to restock, record waste and take the stock count (14j).")
    f.add_note("Staff see quantities only: costs, prices and peso values are admin-only throughout the system.")
    return f


def stock_count_result_staff():
    f = admin_page("14m", "Raw materials: the count's variance (signed in as Staff)", "/admin/raw-materials?tab=count", C + "StockCountTab.tsx, apps/api/src/modules/inventory/counts.ts", h=1060, role="staff", active="/admin/raw-materials")
    raw_base(f, role="staff", tab=5)
    f.add_note("The variance after Staff save a count: expected against counted and the difference in quantities, with what was bought, sold and wasted since the item's previous count. The peso value of each difference and the total are left out; the Administrator sees them (14k).")
    return f


def raw_dishes():
    f = admin_page("14e", "Raw materials: Dishes (servings)", "/admin/raw-materials?tab=dishes", RAW_FILES + " (DishServings)", h=800, role="staff", active="/admin/raw-materials")
    raw_base(f, tab=1, role="staff")
    f.add_note("Each dish's servings: for every raw material in its recipe, the stock divided by the amount one serving uses, and the smallest of those; the raw material that runs out first is the one that limits it. Lowest first. Built from the raw materials' “used in” lists, so Staff see it too (recipes themselves are admin-only).")
    f.add_note("A dish without a recipe shows NO RECIPE (sold out on the kiosk) with “Add its recipe in Products” for an Admin, or “Ask an administrator to add its recipe” for Staff. Ready-made items are on their own tab.")
    return f


def raw_ready():
    f = admin_page("14f", "Raw materials: Ready-made (pieces)", "/admin/raw-materials?tab=ready-made", RAW_FILES + " (ReadyMadeStock)", h=800, role="staff", active="/admin/raw-materials")
    raw_base(f, tab=2, role="staff")
    f.add_note("Items in the built-in Ready-made category (bottled drinks sold as they are): pieces on hand, minimum and status (LOW at or below the minimum, OUT at 0), with the same All / Needs restock / Out of stock chips. Adjust opens 13b, which logs who changed it and why; the changes appear in Stock movements (14g).")
    return f


def raw_movements():
    f = admin_page("14g", "Raw materials: Stock movements", "/admin/raw-materials?tab=movements", RAW_FILES + " (StockMovements), apps/api/src/modules/inventory/movements.ts", h=820, role="staff", active="/admin/raw-materials")
    raw_base(f, tab=3, role="staff")
    f.add_note("One log of every stock change, newest first, for raw materials and ready-made items together (GET /api/inventory/movements): sales (a dish's raw materials, a ready-made item's pieces), restocks, corrections, spoilage and cancelled orders put back, with who made each change and why. It replaced the separate logs on the Raw materials and Ready-made tabs.")
    f.add_note("Filters: Show (raw materials, ready-made items or both), Item (one raw material or ready-made item), Change (sales, restocks, other adjustments) and From / To (Manila dates, both included); Clear filters resets them. Up to the latest 150 are shown. A ready-made item's sale shows the pieces sold, but not the count before and after, which isn't recorded.")
    return f


def adjust_stock():
    f = admin_page("13b", "Adjust stock of a ready-made item (popup)", "/admin/raw-materials?tab=ready-made  (popup)", C + "AdjustStockModal.tsx, " + RAW_FILES, h=800, role="staff", active="/admin/raw-materials")
    raw_base(f, role="staff", tab=2)
    x, y, w = modal(f, 448, 560)
    f.text(x, y + 12, "ADJUST STOCK", size=11, fill=INK3, bold=True)
    f.icon(x + 10, y + 38, 9)
    f.text(x + 26, y + 44, "Ready-made item", size=18, bold=True)
    segmented_bar(f, x, y + 66, w, ["Add / remove", "Set exact count"], 0)
    f.text(x, y + 134, "Change by", size=12, bold=True, fill=INK2)
    f.btn(x, y + 144, 40, 40, "−", size=18)
    f.inp(x + 50, y + 144, w - 100, 40, placeholder="e.g. 5 or -2")
    f.btn(x + w - 40, y + 144, 40, 40, "+", size=18)
    bw = (w - 24) / 4
    for i, n in enumerate(["-5", "-1", "+1", "+5"]):
        f.btn(x + i * (bw + 8), y + 194, bw, 32, n, size=13)
    f.rect(x, y + 242, w, 46, fill=FILL2, stroke=LINE_SOFT, r=6)
    f.text(x + w / 2, y + 271, "4   →   4", size=16, bold=True, anchor="middle")
    f.inp(x, y + 324, w, 38, label="Reason", value="Choose a reason…", select=True)
    f.inp(x, y + 400, w, 38, label="Note (optional)", placeholder="e.g. Recounted during closing shift")
    f.btn_row(x + w, y + 460, [("Cancel", "secondary"), ("Save adjustment", "disabled")], h=38)
    f.add_note("Used for ready-made items (counted in pieces); raw materials have their own popup (14b). Starts empty: Save adjustment stays disabled until there is an amount that changes the stock and a reason. Reasons: Restock / delivery received, Customer return, Damaged goods, Spoilage, Manual correction (recount), Other.")
    f.add_note("Damaged goods and Spoilage can only lower stock; stock never goes below 0. The preview shows old → new count and the change. Every save is logged with who made it and shows in Stock movements (14g).")
    return f


def raw_adjust():
    f = admin_page("14b", "Adjust raw material (popup)", "/admin/raw-materials  (popup)", C + "RawMaterialAdjustModal.tsx", h=900, role="staff", active="/admin/raw-materials")
    raw_base(f, role="staff")
    x, y, w = modal(f, 448, 480)
    f.text(x, y + 12, "ADJUST RAW MATERIAL", size=11, fill=INK3, bold=True)
    f.text(x, y + 42, "Raw material", size=18, bold=True)
    segmented_bar(f, x, y + 62, w, ["Add (restock)", "Remove", "Set exact amount"], 0)
    f.inp(x, y + 140, w, 38, label="Amount (g)", placeholder="e.g. 2500")
    f.rect(x, y + 196, w, 46, fill=FILL2, stroke=LINE_SOFT, r=6)
    f.text(x + w / 2, y + 225, "1.2 kg   →   1.2 kg", size=16, bold=True, anchor="middle")
    f.inp(x, y + 278, w, 38, label="Reason", value="Choose a reason…", select=True)
    f.inp(x, y + 354, w, 38, label="Note (optional)", placeholder="e.g. Delivery from the supplier")
    f.btn_row(x + w, y + 406, [("Cancel", "secondary"), ("Save change", "disabled")], h=38)
    f.add_note("Amounts are in the material's base unit (g, ml or pc). Save change needs an amount that changes the stock, a reason, and a result of 0 or more (“Only 1.2 kg is in stock.”). Damaged goods and Spoilage are disabled while Add is chosen.")
    f.add_note("A change updates the kiosk's sold-out state for every dish that uses this material, and shows in Stock movements (14g).")
    return f


def raw_nutrition():
    f = admin_page("14d", "Raw material nutrition (popup)", "/admin/raw-materials  (popup)",
                   C + "RawMaterialNutritionModal.tsx, " + C + "UsdaFoodSearch.tsx", h=900, access=ADMIN)
    raw_base(f)
    x, y, w = modal(f, 640, 660, y=60)
    f.text(x, y + 12, "NUTRITION PER 100 G", size=11, fill=INK3, bold=True)
    f.text(x, y + 38, "Raw material", size=18, bold=True)
    f.text(x, y + 60, "Used to calculate a recipe dish's nutrition. Values are for the raw ingredient.", size=12, fill=INK3)
    y += 80
    f.rect(x, y, w, 220, fill=WHITE, stroke=LINE, r=6)
    f.inp(x + 12, y + 12, w - 120, 36, value="Raw material")
    f.btn(x + w - 98, y + 12, 86, 36, "Search")
    ry = y + 60
    for i in range(3):
        f.text(x + 12, ry + 16, "USDA food description, raw", size=12, bold=True)
        f.text(x + 12, ry + 34, "Per 100 g: 000 kcal · protein 0.0 g · carbs 0 g · sugar 0 g · SR Legacy", size=11, fill=INK3)
        f.btn(x + w - 62, ry + 8, 50, 28, "Use", size=12)
        ry += 44
    f.text(x + 12, y + 208, "Source: U.S. Department of Agriculture, FoodData Central (public domain).", size=10, fill=INK3)
    y += 256
    fw = (w - 36) / 4
    for i, label in enumerate(["Calories (kcal)", "Protein (g)", "Carbs (g)", "Sugar (g)"]):
        f.inp(x + i * (fw + 12), y, fw, 36, label=label, value="")
    y += 64
    f.inp(x, y, 180, 36, label="Grams in one piece", placeholder="e.g. 50 for an egg")
    f.text(x, y + 54, "Needed: without it, this raw material is left out of the calculation.", size=11, fill=INK3)
    y += 80
    f.btn_row(x + w, y, [("Cancel", "secondary"), ("Save", "primary")], h=38)
    f.add_note("Admin only. Search sends the name to GET /api/nutrition/search (USDA FoodData Central; the API keeps the key). “Use” fills the four values per 100 g; they can also be typed from a label. Saving PUTs them to /api/raw-materials/:id.")
    f.add_note("Pieces (pc) need a weight per piece; ml may have grams per ml (blank = 1 g per ml; oil is about 0.92). When nutrition is already set, the popup shows “Linked to USDA food: …” with Change, and a Remove nutrition button.")
    f.add_note("Without USDA_API_KEY the search answers “Nutrition lookup isn't set up: add USDA_API_KEY to the API's environment”. Over USDA's hourly limit: “USDA's lookup limit was reached. Try again in an hour.”")
    return f


def raw_form():
    f = admin_page("14c", "Add raw material (popup)", "/admin/raw-materials  (popup)", C + "RawMaterialForm.tsx, apps/web/src/lib/rawMaterialCategories.ts", h=900, access=ADMIN)
    raw_base(f)
    x, y, w = modal(f, 448, 700, y=40)
    f.text(x, y + 12, "NEW RAW MATERIAL", size=11, fill=INK3, bold=True)
    f.text(x, y + 40, "Add a raw material", size=18, bold=True)
    half = (w - 12) / 2
    f.inp(x, y + 82, w, 38, label="Name", placeholder="e.g. Pork belly")
    f.inp(x, y + 150, w, 38, label="Category", value="Meat & seafood", select=True)
    f.inp(x, y + 218, half, 38, label="Measured in", value="grams (g)", select=True)
    f.inp(x + half + 12, y + 218, half, 38, label="Opening stock (g)", value="0")
    f.inp(x, y + 286, half, 38, label="Minimum level (g)", value="0")
    f.inp(x + half + 12, y + 286, half, 38, label="Cost per g (₱)", placeholder="Optional")
    planning_fieldset(f, x, y + 344, w, "g")
    f.btn_row(x + w, y + 612, [("Cancel", "secondary"), ("Add raw material", "primary")], h=38)
    f.add_note("Category is one of a fixed list (Meat & seafood, Vegetables & fruit, Rice & noodles, Sauces & seasonings, Oils & fats, Dairy & eggs, Drinks & ice, Others), Others by default; raw materials that existed before were sorted by their names when categories were added.")
    f.add_note("Market trip: the units it's bought in at the palengke (unit conversion, here 1 kg = 1000 g; + Add a market unit), the par level (the most to keep), the safety stock (a buffer), how it's stored and the days it stays fresh. They feed the shopping list (25), shelf-life warnings (11) and the purchase form (25b). A ready-made item's form (12e) has the same section, in pieces.")
    f.add_note("Edit is the same popup (14h): the unit is locked, there is no opening stock, and it adds an In use tick box and Remove item. Stock itself is changed only through Adjust (14b). “Measured in” offers grams (g), millilitres (ml) or pieces (pc).")
    return f


def raw_form_edit():
    f = admin_page("14h", "Edit raw material (popup): Remove item refused", "/admin/raw-materials  (popup)", C + "RawMaterialForm.tsx", h=900, access=ADMIN)
    raw_base(f)
    x, y, w = modal(f, 448, 540, y=140)
    f.text(x, y + 12, "EDIT RAW MATERIAL", size=11, fill=INK3, bold=True)
    f.text(x, y + 40, "Raw material name", size=18, bold=True)
    half = (w - 12) / 2
    f.inp(x, y + 82, w, 38, label="Name", value="Raw material name")
    f.inp(x, y + 150, w, 38, label="Category", value="Vegetables & fruit", select=True)
    f.inp(x, y + 218, w, 38, label="Measured in", value="grams (g)")
    f.rect(x, y + 218, w, 38, fill=FILL2, stroke=LINE_SOFT, r=4, opacity=0.6)
    f.inp(x, y + 286, half, 38, label="Minimum level (g)", value="000")
    f.inp(x + half + 12, y + 286, half, 38, label="Cost per g (₱)", value="0.00")
    f.checkbox(x, y + 338, checked=True, size=16)
    f.text(x + 26, y + 351, "In use (unticked materials can't be added to new recipes)", size=13)
    f.wrap(x, y + 382, w, "Raw material name is in the recipe of Dish A, Dish B, Dish C. Take it out of those recipes first (Products → Edit), or untick In use.", size=13, fill=INK, bold=True)
    f.btn(x, y + 462, 128, 38, "Remove item", kind="danger")
    f.btn_row(x + w, y + 462, [("Cancel", "secondary"), ("Save changes", "primary")], h=38)
    f.add_note("Remove item (Admin only) on a raw material that a dish's recipe still uses doesn't ask: it names the dishes, as here, and nothing is removed. The server refuses it too (DELETE /api/raw-materials/:id answers 409 with the dishes), even if a recipe gains it at the same moment.")
    f.add_note("On a raw material no recipe uses, Remove item asks first (14i). Unticking In use keeps the raw material and its history but stops it being added to new recipes.")
    return f


def raw_remove():
    f = admin_page("14i", "Remove raw material: confirmation", "/admin/raw-materials  (popup)", C + "ConfirmDialog.tsx, " + C + "RawMaterialForm.tsx", h=800, access=ADMIN)
    raw_base(f)
    x, y, w = modal(f, 448, 212)
    f.text(x, y + 22, "Remove Raw material name?", size=18, bold=True)
    f.wrap(x, y + 52, w, "It leaves the raw materials list with its 0 g on hand, and its stock movement history is deleted too. This can't be undone. To keep the history, untick In use instead.", size=13, fill=INK2)
    f.btn_row(x + w, y + 120, [("Cancel", "secondary"), ("Yes, remove", "danger")], h=38)
    f.add_note("Opened by Remove item in the Edit popup (14h) for a raw material no recipe uses. Yes, remove deletes it (DELETE /api/raw-materials/:id), closes the popup and shows “… removed”; its name can then be used for a new raw material. Cancel goes back to the Edit popup.")
    f.add_note("If the server refuses (for example a recipe gained it meanwhile), the confirmation closes and the message shows in the Edit popup.")
    return f


# --- 16 bulk import ----------------------------------------------------------------------
def import_page(result):
    f = admin_page("16b" if result else "16", "Bulk import" + (": after importing" if result else ": preview with an error"), "/admin/import",
                   A + "admin/import/page.tsx", h=1060 if not result else 900, access=ADMIN)
    y = page_header(f, "Bulk product import", "Import from CSV or Excel")
    mw = CW - 318
    sx = CX + mw + 18
    card(f, CX, y, mw, 92)
    f.rect(CX + 12, y + 12, mw - 24, 68, fill=WHITE, stroke=LINE, r=4, dash="6 4")
    f.rect(CX + 26, y + 25, 42, 42, fill=WHITE, stroke=INK2, r=5)
    f.text(CX + 47, y + 50, "XLSX", size=10, anchor="middle", bold=True)
    f.text(CX + 82, y + 42, "menu.xlsx", size=14, bold=True)
    f.text(CX + 82, y + 62, "Read from “Products” (12 rows) and “Recipes” (40 rows)", size=12, fill=INK3)
    f.btn_row(CX + mw - 26, y + 27, [("Clear", "secondary"), ("Browse file", "secondary")], h=38)
    y2 = y + 110
    half = (mw - 18) / 2
    for i, (title, lines) in enumerate([("Products", ["name,category,price,cost,description", "Dish name,Sizzling Plates,000,00,…", "…"]),
                                        ("Recipes (bill of materials)", ["product,rawMaterial,qtyPerServing", "Dish name,Raw material,150", "…"])]):
        top = card(f, CX + i * (half + 18), y2, half, 170, title)
        f.rect(CX + i * (half + 18) + 1, top, half - 2, 120, fill=FILL2, stroke=None)
        for j, line in enumerate(lines):
            f.text(CX + i * (half + 18) + 14, top + 24 + j * 20, line, size=11.5, fill=INK2)
    y3 = y2 + 188
    if not result:
        top = card(f, CX, y3, mw, f.h - y3 - 24, "Preview — nothing is saved until you press Import")
        px = CX + 16
        for label in ["10 NEW", "1 UPDATE", "11 RECIPES", "1 ERROR"]:
            px += f.pill(px, top + 14, label, size=10) + 8
        f.text(CX + 16, top + 62, "Fix the 1 row marked ERROR, in the boxes above or in your file, and the preview updates.", size=12, fill=INK2)
        f.text(CX + 16, top + 96, "PRODUCTS", size=11, fill=INK3, bold=True)
        rows = [["2", "Dish name", P(f, "NEW"), ""], ["3", "Dish name", P(f, "UPDATE"), ""],
                ["4", "Dish name", P(f, "ERROR", filled=True), "Fix this dish's rows in Recipes first"]]
        ry = f.table(CX, top + 106, mw, [("Row", 60, "left"), ("Name", 0.35, "left"), ("Will", 0.2, "left"), ("Problem or warning", 0.45, "left")], rows, rowh=36)
        f.text(CX + 16, ry + 30, "RECIPES", size=11, fill=INK3, bold=True)
        rows = [["2", "Dish name", "Raw material", ""], ["5", "Dish name", "Raw material", "Unknown raw material “…”. Add it on the Raw materials page first."],
                ["9", "Dish name", "Raw material", "Warning: … is marked “not in use”; importing puts it back in use"]]
        f.table(CX, ry + 40, mw, [("Row", 60, "left"), ("Dish", 0.25, "left"), ("Raw material", 0.22, "left"), ("Problem or warning", 0.53, "left")], rows, rowh=36)
    else:
        top = card(f, CX, y3, mw, 200, "Import result")
        px = CX + 16
        for label in ["11 CREATED", "1 UPDATED", "12 RECIPES SET", "0 ERRORS"]:
            px += f.pill(px, top + 14, label, size=10) + 8
        f.line(CX, top + 52, CX + mw, top + 52, stroke=LINE)
        f.text(CX + 16, top + 84, "(Rows that failed are listed here with their row, dish and problem.)", size=12, fill=INK3, italic=True)
    top = card(f, sx, y, 300, 300, "Template")
    yy = f.wrap(sx + 16, top + 24, 268, "Products: name, category (an existing category), price; optional cost and description.", size=12, fill=INK2)
    yy = f.wrap(sx + 16, yy + 6, 268, "Recipes: product, rawMaterial (an existing raw material), qtyPerServing (in its unit: g, ml or pc). One row per raw material of a dish.", size=12, fill=INK2)
    yy = f.wrap(sx + 16, yy + 6, 268, "The Excel template holds both sheets, with lists of your categories and raw materials to pick from.", size=12, fill=INK2)
    for i, name in enumerate(["product_import_template.xlsx ↓", "product_import_template.csv ↓", "recipe_import_template.csv ↓"]):
        f.text(sx + 16, yy + 12 + i * 22, name, size=12, bold=True)
    top = card(f, sx, y + 318, 300, 250, "How matching works")
    yy = f.wrap(sx + 16, top + 24, 268, "A dish whose name matches an existing product (ignoring capitals) updates it. Any other name adds a new dish.", size=12, fill=INK2)
    yy = f.wrap(sx + 16, yy + 6, 268, "Every dish's stock comes from its recipe, so a new dish needs its rows in Recipes. Recipe rows replace that dish's whole recipe.", size=12, fill=INK2)
    f.wrap(sx + 16, yy + 6, 268, "Items in the Ready-made category are counted in pieces, so they take no recipe.", size=12, fill=INK2)
    f.btn(sx, y + 586, 300, 42, "Imported" if result else "Import 12 dishes · 40 recipe rows", kind="disabled")
    if not result:
        f.text(sx, y + 652, "Import turns on once no row has an error.", size=12, fill=INK3)
        f.add_note("Two tables (panel feedback: every dish has a bill of materials): Products and Recipes, as two sheets of one Excel file or two CSV texts. An .xlsx is converted by the server, each table taken from the sheet that holds it, whatever the order; a CSV goes to whichever table its header matches. Both can be edited in the boxes.")
        f.add_note("Half a second after any change the server checks every row without saving (a dry run). A dish with a bad recipe row isn't saved at all, rather than with half a recipe; recipe rows of a dish whose Products row has an error point to it. A raw material marked not in use is a warning, not an error.")
        f.add_note("File checks: an old .xls is refused with instructions; an .xlsx over 2 MB is refused. Template download failures show their reason under the links.")
    else:
        f.add_note("After Import the result card replaces the preview and the button reads “Imported” until the tables change. Dishes are matched by name: existing ones updated, the rest created; recipe rows set each dish's whole recipe and put its raw materials back in use.")
    return f


def bulk_import():
    return import_page(False)


def bulk_import_result():
    return import_page(True)


# --- 17 analytics ------------------------------------------------------------------------
def bars(f, x, y, w, h, n, horizontal=False):
    f.line(x, y + h, x + w, y + h, stroke=LINE)
    f.line(x, y, x, y + h, stroke=LINE)
    heights = [0.4, 0.7, 0.55, 0.9, 0.3, 0.65, 0.8, 0.5, 0.6, 0.45, 0.75, 0.35, 0.85, 0.5]
    if horizontal:
        bh = h / n
        for i in range(n):
            f.rect(x + 1, y + i * bh + 4, (w - 10) * heights[i] , bh - 8, fill=FILL4, stroke=None)
            f.text(x - 8, y + i * bh + bh / 2 + 4, "Product", size=11, anchor="end", fill=INK3)
    else:
        bw = w / n
        for i in range(n):
            bh = (h - 6) * heights[i]
            f.rect(x + i * bw + 6, y + h - bh, bw - 12, bh, fill=FILL4, stroke=None)


def analytics():
    f = admin_page("17", "Analytics", "/admin/analytics", A + "admin/analytics/page.tsx", h=1414, access=ADMIN)
    y = page_header(f, "Visual analytics & reports", "Performance")
    f.text(CX, y + 25, "Sales period", size=13, bold=True, fill=INK2)
    f.segmented(CX + 96, y, 300, 40, ["Daily", "Weekly", "Monthly"], 0)
    f.text(CX + 412, y + 25, "Last 14 days, by day", size=13, fill=INK3)
    y += 58
    tw = (CW - 28) / 3
    tiles = [("Revenue", "₱0,000.00", "Last 14 days"), ("Orders", "00", "Paid orders · last 14 days"),
             ("Average order value", "₱000.00", "Revenue ÷ paid orders · last 14 days"),
             ("Top product", "Product name", "All time · 00 sold"), ("Needs restock", "5", "Right now · at or below minimum")]
    for i, (label, value, sub) in enumerate(tiles):
        kpi(f, CX + (i % 3) * (tw + 14), y + (i // 3) * 134, tw, label, value, sub)
    y += 268
    top = card(f, CX, y, CW, 320, "Sales · last 14 days, by day", export_buttons(f))
    bars(f, CX + 50, top + 20, CW - 80, 230, 14)
    y += 338
    half = (CW - 18) / 2
    top = card(f, CX, y, half, 360, "Top-selling products · all time", export_buttons(f))
    bars(f, CX + 110, top + 18, half - 140, 240, 8, horizontal=True)
    top = card(f, CX + half + 18, y, half, 360, "Profitability per item · all-time sales", export_buttons(f))
    f.table(CX + half + 18, top, half, [("Item", 0.36, "left"), ("Cost", 0.16, "right"), ("Price", 0.16, "right"), ("Margin", 0.16, "right"), ("Gross", 0.16, "right")],
            [["Product name", "₱00.00", "₱000.00", "00.0%", "₱0,000"] for _ in range(6)], rowh=38)
    y += 378
    top = card(f, CX, y, CW, f.h - y - 24, "Inventory movement · sold all time, stock now", export_buttons(f))
    f.table(CX, top, CW, [("Product", 0.6, "left"), ("Units sold", 0.2, "right"), ("Current stock", 0.2, "right")],
            [["Product name", "00", "00"] for _ in range(4)], rowh=38)
    f.add_note("Daily / Weekly / Monthly changes the sales chart and the Revenue, Orders and Average order value tiles (last 14 days / 8 weeks / 6 months). Average order value = revenue ÷ paid orders (“—” with none); the chart's hover shows each period's revenue, orders and average. Top products, profitability and movement are all-time; Needs restock is right now.")
    f.add_note("The sales export (CSV, Excel, PDF) has an Average order value column.")
    f.add_note("Each card exports its report as CSV, Excel or PDF (GET /api/reports/export). Empty states: “No sales in this period” (with “Try a longer period above.”), “No sales yet”, and “No products have a cost recorded yet — add one in Products to see margins here.”")
    return f


def planning_fieldset(f, x, y, w, unit):
    """The Market trip section of a raw material or ready-made item's form (PlanningFields.tsx)."""
    f.rect(x, y, w, 250, fill=WHITE, stroke=LINE_SOFT, r=6)
    f.text(x + 12, y + 20, "Market trip", size=12, bold=True, fill=INK2)
    f.text(x + 12, y + 44, "Bought at the market in", size=12, bold=True, fill=INK2)
    f.text(x + 12, y + 76, "1", size=13, fill=INK3)
    f.inp(x + 28, y + 56, 90, 32, value="kg", size=12)
    f.text(x + 128, y + 76, "=", size=13, fill=INK3)
    f.inp(x + 144, y + 56, 90, 32, value="1000", size=12)
    f.text(x + 244, y + 76, unit, size=13, fill=INK3)
    f.btn(x + w - 46, y + 56, 34, 32, "×", size=13)
    f.btn(x + 12, y + 96, 150, 26, "+ Add a market unit", size=11)
    half = (w - 36) / 2
    f.inp(x + 12, y + 140, half, 32, label="Par level (" + unit + ")", value="8000", size=12)
    f.inp(x + 24 + half, y + 140, half, 32, label="Safety stock (" + unit + ")", value="1000", size=12)
    f.inp(x + 12, y + 210, half, 30, value="Frozen (freezer)", select=True, size=11)
    f.inp(x + 24 + half, y + 210, half, 30, value="30 days fresh", size=11)


def stock_count_body(f, y, result, admin=True):
    if result:
        top = card(f, CX, y, CW, 386, "Variance · counted Nov 15, 8:10 AM · 2 of 5 off")
        if admin:
            f.text(CX + 18, top + 26, "Value of the difference: −₱000.00 missing that no sale or recorded waste explains.", size=13, bold=True)
        else:
            f.text(CX + 18, top + 26, "2 items differ from what sales, purchases and recorded waste left.", size=13, bold=True)
        rows = [["Raw material", "24.6 kg", "24.5 kg", "−100 g  (−₱5.00)" if admin else "−100 g", "first count · bought 25 kg · sold 400 g · wasted 0 g"],
                ["Raw material", "6.25 kg", "6.1 kg", "−150 g  (−₱54.00)" if admin else "−150 g", "counted 6.3 kg · bought 2 kg · sold 1.9 kg · wasted 250 g"],
                ["Ready-made item", "24 pc", "24 pc", P(f, "MATCHES"), "first count · bought 24 pc · sold 0 pc · wasted 0 pc"],
                ["Raw material", "30 pc", "30 pc", P(f, "MATCHES"), "first count · bought 30 pc · sold 0 pc · wasted 0 pc"],
                ["Raw material", "1.2 L", "1.2 L", P(f, "MATCHES"), "counted 2 L · bought 0 ml · sold 800 ml · wasted 0 ml"]]
        f.table(CX, top + 44, CW, [("Item", 0.16, "left"), ("Expected", 0.11, "right"), ("Counted", 0.11, "right"), ("Difference", 0.18, "right"), ("Since the last count", 0.44, "left")], rows, rowh=46)
        y += 404
    f.wrap(CX, y + 4, CW, "Count what's actually there, before each market trip. Leave an item blank to skip it. The system's figure shows after saving, so it doesn't sway the count; saving sets the stock to what you counted.", size=13, fill=INK2)
    y += 36
    h = 300 if result else 420
    top = card(f, CX, y, CW, h, "Count sheet · 2 of 34 counted")
    f.inp(CX + 18, top + 14, 300, 36, placeholder="Search items")
    ry = top + 64
    for name, val, unit in [("Raw material", "24500", "g"), ("Raw material", "", "g"), ("Ready-made item  ready-made", "24", "pc"), ("Raw material", "", "pc"), ("Raw material", "", "ml")][: 3 if result else 5]:
        f.text(CX + 18, ry + 24, name, size=13)
        f.inp(CX + CW - 220, ry + 4, 150, 34, value=val, size=12)
        f.text(CX + CW - 60, ry + 26, unit, size=12, fill=INK3)
        f.line(CX, ry + 44, CX + CW, ry + 44, stroke=LINE_SOFT)
        ry += 46
    f.btn(CX + CW - 140, top + h - 92 + (0 if result else 40), 122, 36, "Save count", kind="primary")


def stock_count():
    f = admin_page("14j", "Raw materials: Stock count (count sheet)", "/admin/raw-materials?tab=count", C + "StockCountTab.tsx, " + RAW_FILES, h=860, role="staff", active="/admin/raw-materials")
    raw_base(f, tab=4, role="staff")
    f.add_note("The count sheet, done before each market trip (about every two weeks): Staff and the Administrator type what's actually there for each raw material and ready-made item (whole pieces for ready-made). The system's figure is hidden while counting, so it doesn't sway the count.")
    f.add_note("Save count asks first, then sets each counted item's stock to the count (a correction in Stock movements, “Stock count”) and records the expected figure: POST /api/inventory/counts. The variance shows next (14k). Past counts are listed below the sheet with Variance to open one.")
    return f


def stock_count_result():
    f = admin_page("14k", "Raw materials: the count's variance", "/admin/raw-materials?tab=count", C + "StockCountTab.tsx, apps/api/src/modules/inventory/counts.ts", h=1060)
    raw_base(f, tab=5)
    f.add_note("Variance (inventory record inaccuracy): expected (what sales, purchases and recorded waste left) against counted. Negative is stock missing that nothing recorded explains: portioning, unrecorded waste or loss. Since the last count shows what was bought, sold and wasted since the item's previous count, to trace a gap.")
    f.add_note("The peso value of each difference and the total use the cost per unit when counted, and are shown to the Administrator only; Staff see the quantities.")
    return f


# --- 25 market purchases (the palengke cycle) --------------------------------------------
MARKET_FILES = A + "admin/purchases/page.tsx, " + C + "purchasing/PurchasingViews.tsx"


def market_header(f, tab, form=False):
    y = page_header(f, "Inventory · palengke restocking", "Market purchases", () if form else [("+ Record a purchase", "primary")])
    return y, tab


def market_tabs(f, y, tab):
    return tabbar(f, CX, y, ["Shopping list", "Purchases", "Price history"], tab) + 16


def shopping_list():
    f = admin_page("25", "Market purchases: Shopping list", "/admin/purchases", MARKET_FILES + ", apps/api/src/modules/purchasing/shoppingList.ts", h=900, access=ADMIN, active="/admin/purchases")
    y, _ = market_header(f, 0)
    y = market_tabs(f, y, 0)
    f.inp(CX, y + 18, 176, 38, label="Days until the next trip", value="14")
    f.btn_row(CX + CW, y + 18, [("Print list", "secondary"), ("Record the trip from this list", "primary")], h=38)
    y += 74
    f.wrap(CX, y, CW, "For each item: what sales and waste used per day over the last 28 days × the days to cover, plus the safety stock, never above the par level, minus what's on hand, rounded up to market units. A rule over recent usage, not a forecast.", size=13, fill=INK2)
    y += 44
    top = card(f, CX, y, CW, 84 + 6 * 50, "Shopping list · 6 items · about ₱0,000.00 to bring")
    rows = [["Raw material", "1.1 kg", "420 g", T2(f, "6 kg", "needs 5.4 kg"), "₱0,000.00"],
            ["Raw material", "3.2 kg", "1.6 kg", T2(f, "1 sack", "needs 21.6 kg"), "₱0,000.00"],
            [T2(f, "Raw material", "Stays fresh 3 days: bought for 3 days only. Plan a top-up."), "100 g", "350 g", T2(f, "2 kg", "needs 1.05 kg"), "₱000.00"],
            ["Raw material", "6 pc", "9 pc", T2(f, "5 tray", "needs 132 pc"), "₱0,000.00"],
            ["Ready-made item", "4 pc", "3 pc", T2(f, "2 case", "needs 44 pc"), "₱000.00"],
            ["Raw material", "200 ml", "40 ml", T2(f, "1 bottle", "needs 760 ml"), "no price yet"]]
    f.table(CX, top, CW, [("Item", 0.36, "left"), ("On hand", 0.12, "right"), ("Used / day", 0.12, "right"), ("Buy", 0.22, "left"), ("About", 0.18, "right")], rows, rowh=50)
    f.add_note("Before each market trip (the owner goes about every two weeks): GET /api/purchases/shopping-list?days=14. Days until the next trip is remembered on the device. Items whose stock covers the trip aren't listed; an item with no price yet is left out of the total.")
    f.add_note("An item that won't stay fresh until the next trip (not frozen) is bought only for its fresh days, with a reminder to plan a top-up. Print list prints the page; Record the trip from this list opens the purchase form (25b) with each line's planned amount filled in.")
    return f


def purchase_form():
    f = admin_page("25b", "Market purchases: recording the trip", "/admin/purchases", C + "purchasing/PurchaseForm.tsx, apps/api/src/modules/purchasing/service.ts", h=960, access=ADMIN, active="/admin/purchases")
    y, _ = market_header(f, 0, form=True)
    top = card(f, CX, y, CW, 610, "Record the market trip (from the shopping list)")
    q = (CW - 36 - 36) / 4
    f.inp(CX + 18, top + 32, q, 38, label="Date bought", value="11/15/2026")
    f.inp(CX + 30 + q, top + 32, q, 38, label="Kind", value="Market trip", select=True)
    f.inp(CX + 42 + 2 * q, top + 32, 2 * q, 38, label="Store or stall (optional)", placeholder="e.g. Bacoor public market")
    ty = top + 96
    cols = [("Item", 0.3, "left"), ("Bought", 0.16, "left"), ("Unit", 0.13, "left"), ("Paid (₱)", 0.15, "left"), ("Printed expiry", 0.18, "left"), ("", 0.08, "right")]

    def inp_cell(value, select=False, under=None):
        def draw(x, yy, w, h):
            f.inp(x + 6, yy + (4 if under else 10), w - 12, 30 if under else 32, value=value, select=select, size=12)
            if under:
                f.text(x + 8, yy + h - 3, under, size=10, fill=INK3)
        return draw

    rows = [[T2(f, "Raw material", "Planned 6 kg"), inp_cell("6", under="= 6000 g"), inp_cell("kg", True), inp_cell("2,160.00"), inp_cell("mm/dd/yyyy"), B(f, "×")],
            [T2(f, "Raw material", "Planned 1 sack"), inp_cell("1"), inp_cell("sack", True), inp_cell("1,250.00"), inp_cell("mm/dd/yyyy"), B(f, "×")],
            [T2(f, "Raw material", "Planned 5 tray"), inp_cell("4", under="= 120 pc"), inp_cell("tray", True), inp_cell("960.00"), inp_cell("mm/dd/yyyy"), B(f, "×")],
            [T2(f, "Ready-made item", "Planned 2 case"), inp_cell("2"), inp_cell("case", True), inp_cell("960.00"), inp_cell("11/30/2026"), B(f, "×")],
            [T2(f, "Raw material", "Planned 1 bottle"), inp_cell("0"), inp_cell("bottle", True), inp_cell("0.00"), inp_cell("mm/dd/yyyy"), B(f, "×")]]
    end = f.table(CX + 18, ty, CW - 36, cols, rows, rowh=52)
    f.btn(CX + 18, end + 14, 110, 30, "+ Add a line", size=12)
    f.text(CX + CW - 18, end + 34, "Receipt total ₱5,330.00", size=14, bold=True, anchor="end")
    f.btn_row(CX + CW - 18, end + 64, [("Cancel", "secondary"), ("Save purchase", "primary")], h=38)
    f.add_note("After the trip the owner enters each resibo: one line per item, in the unit it was bought in (its market units, or g / ml / pc), with what was paid for the line; “= 6000 g” shows the conversion. A line with 0 bought records an item that wasn't found (here the bottle). A printed expiry date can be added for packaged goods.")
    f.add_note("Save purchase (POST /api/purchases, Administrator only) adds each item's stock, logged as a restock linked to the purchase, and makes the price paid its cost per unit, so recipe costs and food cost follow the market. Refused: a unit the item doesn't have, part of a piece, a future date, a price with nothing bought, or a dish (its stock is its raw materials). A purchase isn't edited afterwards; a mistake is corrected with Adjust.")
    return f


def purchase_list():
    f = admin_page("25c", "Market purchases: Purchases (planned against bought)", "/admin/purchases?tab=purchases", MARKET_FILES, h=860, access=ADMIN, active="/admin/purchases")
    y, _ = market_header(f, 1)
    y = market_tabs(f, y, 1)
    top = card(f, CX, y, CW, 470)
    f.text(CX + 18, top + 30, "Nov 15", size=14, bold=True)
    px = CX + 80 + f.pill(CX + 80, top + 16, "MARKET TRIP", size=10) + 10
    f.text(px, top + 30, "Bacoor public market", size=13, fill=INK2)
    f.text(CX + CW - 18, top + 30, "₱5,330.00", size=14, bold=True, anchor="end")
    f.text(CX + 18, top + 52, "5 lines · recorded by Full name", size=12, fill=INK3)
    rows = [["Raw material", "6 kg", "6 kg", "₱360.00/kg", "₱2,160.00"], ["Raw material", "1 sack", "1 sack", "₱1,250.00/sack", "₱1,250.00"],
            [T2(f, "Raw material", ""), "5 tray", T2(f, "4 tray", "less than planned"), "₱240.00/tray", "₱960.00"],
            [T2(f, "Ready-made item", "expires Nov 30"), "2 case", "2 case", "₱480.00/case", "₱960.00"], ["Raw material", "1 bottle", "not found", "—", "₱0.00"]]
    end = f.table(CX + 18, top + 70, CW - 36, [("Item", 0.3, "left"), ("Planned", 0.15, "left"), ("Bought", 0.2, "left"), ("Price", 0.18, "right"), ("Paid", 0.17, "right")], rows, rowh=44)
    f.line(CX, end + 18, CX + CW, end + 18, stroke=LINE_SOFT)
    f.text(CX + 18, end + 48, "Nov 9", size=14, bold=True)
    px = CX + 80 + f.pill(CX + 80, end + 34, "TOP-UP", size=10) + 10
    f.text(px, end + 48, "—", size=13, fill=INK2)
    f.text(CX + CW - 18, end + 48, "₱720.00", size=14, bold=True, anchor="end")
    f.add_note("The receipts recorded so far, newest first (GET /api/purchases); a row opens to its lines with planned against bought (from the shopping list), the price per market unit and any printed expiry date. Market trip or top-up between trips.")
    return f


def price_history():
    f = admin_page("25d", "Market purchases: Price history", "/admin/purchases?tab=prices", MARKET_FILES, h=820, access=ADMIN, active="/admin/purchases")
    y, _ = market_header(f, 2)
    y = market_tabs(f, y, 2)
    f.inp(CX, y + 18, 320, 38, label="Item", value="Raw material", select=True)
    y += 74
    top = card(f, CX, y, CW, 380, "Raw material · price per g over time")
    pts = [(0, 40), (80, 36), (160, 30), (240, 34), (320, 22), (400, 14)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        f.line(CX + 30 + x1, top + 10 + y1, CX + 30 + x2, top + 10 + y2, stroke=INK, sw=2)
    rows = [[T2(f, "Nov 15", "Bacoor public market"), "6 kg", "₱360.00/kg", "▲ 12.5%"], ["Nov 1", "5 kg", "₱320.00/kg", "▲ 3.2%"],
            ["Oct 18", "5 kg", "₱310.00/kg", "▼ 1.6%"], ["Oct 4", "6 kg", "₱315.00/kg", "—"]]
    f.table(CX, top + 70, CW, [("Bought", 0.34, "left"), ("Amount", 0.2, "left"), ("Price", 0.24, "right"), ("Change", 0.22, "right")], rows, rowh=44)
    f.add_note("Each item's price on every purchase, newest first, with the change from the purchase before (GET /api/purchases/prices); the line above shows the trend per base unit, so purchases in different market units compare. A rise shows ▲, a drop ▼.")
    return f


def analytics_stock():
    f = admin_page("17b", "Analytics: food cost, and usage and waste", "/admin/analytics", C + "StockReports.tsx, apps/api/src/modules/reports/stockReports.ts", h=1000, access=ADMIN, active="/admin/analytics")
    y = page_header(f, "Visual analytics & reports", "Performance")
    f.text(CX, y + 4, "(sales chart, top products and profitability above, as in 17)", size=12, fill=INK3)
    y += 20
    f.inp(CX, y + 18, 160, 38, label="From", value="11/02/2026")
    f.inp(CX + 172, y + 18, 160, 38, label="To", value="11/15/2026")
    y += 74
    top = card(f, CX, y, CW, 330, "Food cost · Nov 2 to Nov 15")
    w3 = (CW - 36) / 3
    for i, (label, value, sub) in enumerate([("From recipes", "31.4%", "₱0,000.00 cost of ₱00,000.00 sold"), ("From market purchases", "36.8%", "₱0,000.00 spent · ₱00,000.00 sales"), ("Sales without a cost", "₱000.00", "Dishes sold before their prices were known")]):
        f.text(CX + 18 + i * w3, top + 26, label.upper(), size=11, fill=INK3, bold=True)
        f.text(CX + 18 + i * w3, top + 60, value, size=24, bold=True)
        f.text(CX + 18 + i * w3, top + 82, sub, size=12, fill=INK3)
    f.table(CX, top + 106, CW, [("Market trip", 0.34, "left"), ("Spent (with top-ups)", 0.22, "right"), ("Sales until next trip", 0.22, "right"), ("Spent ÷ sales", 0.22, "right")],
            [["Nov 1 to Nov 15", T2(f, "₱0,000.00", "incl. ₱720.00 top-ups"), "₱00,000.00", "34.9%"], ["Nov 15 (current)", "₱0,000.00", "₱0,000.00", "—"]], rowh=48)
    y += 348
    top = card(f, CX, y, CW, f.h - y - 24, "Usage and waste · 14 days · waste ₱000.00")
    f.text(CX + 18, top + 24, "Waste by reason: Spoilage ₱000.00 · Dropped ₱00.00 · Over-prepped ₱00.00", size=13)
    rows = [["Raw material", T2(f, "6.4 kg", "₱0,000.00"), "457 g", T2(f, "250 g", "₱90.00"), "7 kg", "1.1 kg"],
            ["Raw material", T2(f, "22 kg", "₱0,000.00"), "1.6 kg", "0 g", "25 kg", "3.2 kg"],
            ["Ready-made item", T2(f, "40 pc", "₱800.00"), "3 pc", "0 pc", "48 pc", "8 pc"],
            ["Raw material", T2(f, "126 pc", "₱000.00"), "9 pc", T2(f, "6 pc", "₱48.00"), "120 pc", "6 pc"]]
    f.table(CX, top + 40, CW, [("Item", 0.28, "left"), ("Used", 0.15, "right"), ("Per day", 0.13, "right"), ("Wasted", 0.15, "right"), ("Bought", 0.14, "right"), ("On hand", 0.15, "right")], rows, rowh=48)
    f.add_note("Two reports for the palengke cycle over a period of days (default the last 14, one market cycle): GET /api/reports/food-cost and /api/reports/usage. Food cost from recipes uses each sale's cost saved when it was paid; from market purchases, what was actually spent. A purchase figure well above the recipe one points to waste, over-portioning or stock not yet used.")
    f.add_note("Market trip rows (puhunan vs benta): each trip plus its top-ups until the next trip, against the sales in the same days. Usage and waste: used by sales, the average per day, wasted (damaged, spoiled, dropped, over-prepped, with its value at today's cost), bought, and on hand.")
    return f


# --- 18 kitchen display ------------------------------------------------------------------
def kitchen_page(empty):
    f = admin_page("18b" if empty else "18", "Kitchen display" + (": no active orders" if empty else ""), "/kitchen", A + "kitchen/page.tsx", h=800, role="staff", active="/kitchen")
    f.rect(CX, 24, CW, 752, fill=FILL4, stroke=None, r=6)
    f.text(CX + 24, 66, "Kitchen Display", size=24, bold=True)
    f.text(CX + 24, 90, "0 active orders" if empty else "3 active orders · 1 ready to hand over", size=13, fill=INK2)
    if empty:
        f.text(CX + 24, 138, "No active orders — the kitchen is caught up.", size=15, fill=INK2)
        f.add_note("Shown only after a successful load. If the queue can't load, an alert “Couldn't load the kitchen queue.” with Retry appears instead, so a failure never looks like an empty kitchen.")
        return f
    cw = (CW - 48 - 32) / 3
    orders = [("TAKE OUT", "ready", ["completed", "completed"]), ("DINE IN", "in 6 min", ["in_progress", "pending"]), ("DINE IN", "2 min late", ["pending"])]
    for i, (otype, due, tasks) in enumerate(orders):
        x, y = CX + 24 + i * (cw + 16), 112
        ready = due == "ready"
        f.rect(x, y, cw, 90 + len(tasks) * 108 + (58 if ready else 0), fill=FILL3, stroke=INK if ready else LINE, r=12, sw=2.5 if ready else 1)
        f.text(x + 16, y + 30, "ZK-XXXXXX", size=17, bold=True)
        f.pill(x + 120, y + 15, otype, size=10, filled=otype == "TAKE OUT", r=10)
        f.text(x + cw - 16, y + 30, "12:30 PM", size=12, anchor="end", fill=INK2)
        if ready:
            f.text(x + 16, y + 54, "READY · waiting for pickup", size=13, bold=True)
            f.btn(x + 12, y + 80 + len(tasks) * 108 + 6, cw - 24, 40, "Handed over", kind="primary", r=20)
        else:
            f.text(x + 16, y + 54, f"Ready by 12:45 PM · {due}", size=13, bold="late" in due, fill=INK2)
        f.line(x + 16, y + 68, x + cw - 16, y + 68, stroke=LINE)
        ty = y + 80
        for j, status in enumerate(tasks):
            f.rect(x + 12, ty, cw - 24, 100, fill=WHITE, stroke=LINE_SOFT, r=8)
            f.text(x + 26, ty + 26, f"{j + 1}× Dish name", size=14, bold=True)
            if j == 0:
                f.text(x + 26, ty + 46, "“Extra spicy”", size=12, italic=True, fill=INK2)
            f.pill(x + cw - 26, ty + 12, {"pending": "Pending", "in_progress": "In Progress", "completed": "Completed"}[status], size=10, anchor="end", r=10)
            if status != "completed":
                f.btn(x + 26, ty + 56, cw - 52, 34, "Start preparing" if status == "pending" else "Mark done", kind="primary", r=17)
            ty += 108
    f.add_note("Only paid orders appear (a counter order once staff take its payment, an online order after the payment arrives), oldest first, one card per order with one row per dish. Updates live (order:created, kitchen:task_updated, orders:changed).")
    f.add_note("The kitchen doesn't cancel orders (panel feedback): staff cancel a paid order on Orders awaiting payment › Paid orders (19f), and it leaves this display.")
    f.add_note("On the kitchen's own device (opened once with ?printer=1, shown as “· Ticket printer on” after the order count) each order prints a kitchen ticket when it first appears: the order number and the dishes with special instructions, through print-service/. Each order prints once; a failed ticket shows “Couldn't print the kitchen ticket for ZK-XXXXXX …” and is tried again.")
    f.add_note("Each dish goes Pending → Start preparing → In Progress → Mark done. The order follows its dishes: preparing when the first dish is started, ready when the last is done. A ready order stays first, outlined, as “READY · waiting for pickup”, until the kitchen presses Handed over: the order is completed and leaves this display and the counter's status board (24).")
    return f


def kitchen():
    return kitchen_page(False)


def kitchen_empty():
    return kitchen_page(True)


# --- 19 orders awaiting payment: the counter's light POS --------------------------------
POS_FILES = A + "staff/orders/page.tsx"
SC = "apps/web/src/components/staff/"


def orders_header(f, tab, queue=3):
    y = page_header(f, "Billing & payment · point of sale", "Orders awaiting payment")
    return tabbar(f, CX, y, [f"Queue ({queue})", "New order", "Paid orders"], tab) + 16


def cancel_panel(f, bx, y, w, paid):
    """The panel Cancel order opens (CancelDishes.tsx): the dishes, all ticked at first, with
    how many of each; a reason for a paid order. Returns its height."""
    top = y
    yy = f.wrap(bx + 14, y + 22, w - 28, "Cancel which dishes of ZK-XXXXXX? Untick what the customer keeps.", size=12)
    rows = ([("Dish name · not started", True, "1 of 2"), ("Ready-made item · cooking", False, None)] if paid
            else [("Dish name", True, "2 of 3"), ("Ready-made item", False, None)])
    yy += 2
    for label, ticked, count in rows:
        f.rect(bx + 14, yy, w - 28, 36, fill=FILL2, stroke=LINE_SOFT, r=5)
        f.checkbox(bx + 24, yy + 10, checked=ticked, size=14)
        f.text(bx + 46, yy + 23, label, size=12)
        if count:
            sx = bx + w - 24 - 106
            f.btn(sx, yy + 6, 24, 24, "\u2212", size=12)
            f.text(sx + 53, yy + 23, count, size=12, anchor="middle")
            f.btn(sx + 82, yy + 6, 24, 24, "+", size=12)
        else:
            f.text(bx + w - 24, yy + 23, "1\u00d7", size=12, anchor="end", fill=INK3)
        yy += 42
    summary = ("Dishes not started go back into stock; refund the customer \u20b1000.00. The rest stays in the kitchen." if paid
               else "The total goes down by \u20b1000.00, to \u20b1000.00.")
    yy = f.wrap(bx + 14, yy + 14, w - 28, summary, size=12) + 4
    if paid:
        cx2 = bx + 14
        for reason in ("Customer left", "Customer changed their mind", "Ran out of an ingredient"):
            rw = text_width(reason, 12, True) + 24
            if cx2 + rw > bx + w - 14:
                cx2, yy = bx + 14, yy + 34
            f.btn(cx2, yy, rw, 28, reason, kind="selected" if reason == "Customer changed their mind" else "secondary", r=14, size=12)
            cx2 += rw + 6
        f.inp(bx + 14, yy + 56, w - 28, 34, label="Reason", value="Customer changed their mind", size=12)
        yy += 104
    f.btn_row(bx + w - 14, yy, [("Yes, cancel 1 dish" if paid else "Yes, cancel 2 dishes", "danger"), ("Keep order", "secondary")], h=30, size=12)
    yy += 44
    f.rect(bx, top, w, yy - top, fill="none", stroke=INK, r=6, sw=1.5)
    return yy - top


def queue_list(f, y, empty=False):
    y = f.wrap(CX, y + 4, CW, "Counter orders show up here as soon as they are placed; the list updates by itself. Take payment checks the stock first, so if something has run out you can take that dish off with Cancel order before keeping the money. Cancel order also removes an order the customer never came back to pay for.", size=13, fill=INK2)
    y += 8
    if empty:
        f.text(CX, y + 16, "Nothing awaiting payment right now.", size=14, fill=INK3)
        return
    f.inp(CX, y, 320, 38, placeholder="Search order number")
    f.text(CX + 334, y + 24, "3 orders waiting", size=13, fill=INK3)
    y += 54
    card(f, CX, y, CW, f.h - y - 24)
    f.text(CX + 18, y + 32, "ZK-XXXXXX", size=17, bold=True)
    f.pill(CX + 128, y + 17, "NEW", size=10)
    f.text(CX + 18, y + 54, "2× Dish name, 1× Dish name", size=13, fill=INK2)
    f.text(CX + 18, y + 74, "Dine in · Counter · ₱000.00 · placed 3 min ago · ready about 15 min after payment", size=12, fill=INK3)
    f.btn_row(CX + CW - 18, y + 30, [("Cancel order", "secondary"), ("Take payment", "primary")], h=38)
    y += 98
    f.line(CX, y, CX + CW, y, stroke=LINE_SOFT)
    f.text(CX + 18, y + 32, "ZK-XXXXXX", size=17, bold=True)
    f.pill(CX + 128, y + 17, "WALK-IN", size=10)
    f.text(CX + 18, y + 54, "3× Dish name, 1× Ready-made item", size=13, fill=INK2)
    f.text(CX + 18, y + 74, "Take out · Counter · ₱000.00 · placed 1 min ago", size=12, fill=INK3)
    ph = cancel_panel(f, CX + CW - 18 - 360, y + 12, 360, paid=False)
    y += ph + 26
    f.line(CX, y, CX + CW, y, stroke=LINE_SOFT)
    f.text(CX + 18, y + 32, "ZK-XXXXXX", size=17, bold=True)
    x = CX + 128 + f.pill(CX + 128, y + 17, "NEEDS ATTENTION", size=10, filled=True) + 6
    f.pill(x, y + 17, "CANCELLED", size=10)
    f.text(CX + 18, y + 54, "2× Dish name, 1× Dish name", size=13, fill=INK2)
    f.text(CX + 18, y + 74, "Dine in · Counter · ₱000.00 · paid · placed 40 min ago", size=12, fill=INK3)
    f.rect(CX + 18, y + 86, CW - 360, 108, fill=WHITE, stroke=INK, r=5, sw=1.5)
    f.text(CX + 30, y + 108, "Cancelled while in the kitchen: Customer left. Refund the customer ₱000.00 (paid in cash).", size=12)
    f.btn_row(CX + 30 + 236, y + 144, [("Refunded: mark as sorted out", "secondary")], h=30, size=12)


def orders():
    f = admin_page("19", "Orders awaiting payment: Queue (cancelling some dishes)", "/staff/orders", POS_FILES + ", " + SC + "CancelDishes.tsx", h=1000, role="staff", active="/staff/orders")
    y = orders_header(f, 0)
    queue_list(f, y)
    f.add_note("The counter's light point of sale (panel feedback), in three tabs kept in the address: Queue, New order (19e, ?tab=new) and Paid orders (19f, ?tab=paid). The Queue lists unpaid, not-cancelled orders plus orders flagged for attention (newest first, up to 50); search ignores spaces and dashes; a walk-in order rung up on New order is tagged WALK-IN.")
    f.add_note("Take payment opens the payment step (19c); paying shows the receipt (19d). Taking payment checks the stock, deducts it and sends the order to the kitchen in one step; if stock is short nothing changes and staff are told to hand the money back and take that dish off.")
    f.add_note("Cancel order (second row) asks which dishes to cancel: every dish starts ticked, staff untick what the customer keeps and set how many of a dish (− / +). Some dishes: they come off the order and the total, and the payment waiting for it, goes down (POST /api/orders/:id/cancel-items). Every dish left: the order is cancelled and leaves the Queue. Refused for an order being paid by QR Ph, whose code was made for its total.")
    f.add_note("NEEDS ATTENTION marks an order staff must sort out, with the note on what happened and what to do: paid online after the stock ran out or after the order was cancelled, a wrong amount, paid twice, or a paid order cancelled from Paid orders (third row). Refunded: mark as sorted out records the payment as refunded; the note stays in Transactions (23).")
    return f


def orders_empty():
    f = admin_page("19b", "Orders awaiting payment: nothing waiting", "/staff/orders", POS_FILES, h=800, role="staff", active="/staff/orders")
    y = orders_header(f, 0, queue=0)
    queue_list(f, y, empty=True)
    f.add_note("Shown only after a successful load. If loading fails, an alert “Couldn't load the orders.” with Retry appears instead. The list reloads by itself (orders:changed) when an order is placed, paid, edited or cancelled anywhere.")
    return f


def payment_panel():
    f = admin_page("19c", "Take payment (popup)", "/staff/orders  (popup)", SC + "PaymentPanel.tsx, " + POS_FILES, h=1000, role="staff", active="/staff/orders")
    y = orders_header(f, 0)
    queue_list(f, y)
    x, y, w = modal(f, 448, 470, y=170)
    f.text(x, y + 12, "TAKE PAYMENT", size=11, fill=INK3, bold=True)
    f.text(x, y + 42, "ZK-XXXXXX", size=18, bold=True)
    f.text(x + w, y + 44, "₱325.00", size=24, bold=True, anchor="end")
    f.text(x, y + 66, "2× Dish name, 1× Ready-made item · Take out", size=12, fill=INK3)
    f.segmented(x, y + 82, w, 40, ["Cash", "GCash", "Maya"], 0)
    f.inp(x, y + 160, w, 42, label="Cash received", value="500", size=16)
    bx = x
    for label in ["Exact", "₱340", "₱350", "₱400", "₱500"]:
        bx += f.btn_auto(bx, y + 214, label, h=30, size=12, r=15) + 8
    f.rect(x, y + 262, w, 50, fill=FILL2, stroke=LINE_SOFT, r=6)
    f.text(x + 14, y + 292, "Change", size=13, fill=INK2)
    f.text(x + w - 14, y + 294, "₱175.00", size=20, bold=True, anchor="end")
    f.btn_row(x + w, y + 350, [("Not now", "secondary"), ("Confirm cash payment", "primary")], h=38)
    f.add_note("Cash: Cash received (typed, or a quick amount: Exact and the next round amounts), with the change worked out; an amount short of the total says “₱… short” and can't be confirmed. The cash received is saved for the receipt.")
    f.add_note("GCash or Maya: paid to the shop's own account; the field becomes “GCash reference number”, from the customer's payment confirmation (“Check that ₱… reached the shop's GCash account before confirming”). A reference number can be recorded once (409 names the order that has it). No PayMongo is involved.")
    f.add_note("Confirm checks the stock first (“Checking stock…”): if something has run out, nothing is saved and the panel says to hand the money back and change the order with the customer. Not now closes it; the order waits in the Queue unpaid.")
    return f


def counter_receipt():
    f = admin_page("19d", "Counter receipt (popup)", "/staff/orders  (popup)", SC + "CounterReceipt.tsx, apps/web/src/lib/receiptPrinter.ts", h=1000, role="staff", active="/staff/orders")
    y = orders_header(f, 0)
    queue_list(f, y)
    x, y, w = modal(f, 384, 560, y=150)
    f.text(x + w / 2, y + 12, "RECEIPT · PAID", size=11, fill=INK3, bold=True, anchor="middle")
    f.text(x + w / 2, y + 46, "ZK-XXXXXX", size=24, bold=True, anchor="middle")
    f.text(x + w / 2, y + 68, "Nov 13, 9:35 PM · Take out", size=12, fill=INK3, anchor="middle")
    f.line(x, y + 84, x + w, y + 84, stroke=LINE_SOFT)
    for i, (item, price, note) in enumerate([("2× Dish name", "₱290.00", "Extra rice"), ("1× Ready-made item", "₱35.00", None)]):
        ry = y + 108 + i * 46
        f.text(x, ry, item, size=13)
        f.text(x + w, ry, price, size=13, anchor="end")
        if note:
            f.text(x, ry + 18, note, size=12, fill=INK3)
    f.line(x, y + 186, x + w, y + 186, stroke=LINE_SOFT)
    for i, (label, value, bold) in enumerate([("TOTAL", "₱325.00", True), ("Paid by", "Cash", False), ("Cash received", "₱500.00", False), ("Change", "₱175.00", False)]):
        ry = y + 214 + i * 26
        f.text(x, ry, label, size=15 if bold else 13, bold=bold, fill=INK if bold else INK2)
        f.text(x + w, ry, value, size=15 if bold else 13, bold=bold, anchor="end")
    f.rect(x, y + 330, w, 60, fill=FILL2, stroke=None, r=6)
    f.wrap(x + 14, y + 354, w - 28, "Sent to the kitchen. Tell the customer it will be ready at about 9:56 PM.", size=12)
    f.btn_row(x + w, y + 414, [("Done", "secondary"), ("Print receipt", "primary")], h=38)
    f.add_note("Shown after a payment is taken (and from Receipt on Paid orders, 19f). Items with their instructions, the total, how it was paid, the cash received and change (cash) or the reference number (GCash, Maya), and the ready time.")
    f.add_note("Print receipt prints on the counter's thermal receipt printer (58 mm, through print-service/ on the counter computer) once Orders awaiting payment has been opened there with ?printer=1: the dishes, total, “PAID - Cash” with the cash received and change, or “PAID - GCash / Maya” with the reference number. It then says “Printed on the receipt printer.”; if the printer doesn't answer, it says so and offers Try again and Print with this computer.")
    f.add_note("Without ?printer=1 (any other computer), Print receipt prints only the receipt (a 72 mm-wide page) through the computer's own printer and the browser's print dialog.")
    return f


def counter_receipt_cancelled():
    f = admin_page("19g", "Counter receipt after a dish is cancelled (printed)", "/staff/orders?tab=paid  (popup)", SC + "CounterReceipt.tsx, apps/web/src/lib/receiptPrinter.ts", h=1000, role="staff", active="/staff/orders")
    y = orders_header(f, 2)
    paid_list(f, y, cancelling=False)
    x, y, w = modal(f, 384, 540, y=150)
    f.text(x + w / 2, y + 12, "RECEIPT · PAID", size=11, fill=INK3, bold=True, anchor="middle")
    f.text(x + w / 2, y + 46, "ZK-XXXXXX", size=24, bold=True, anchor="middle")
    f.text(x + w / 2, y + 68, "Nov 15, 2:23 AM · Dine in", size=12, fill=INK3, anchor="middle")
    f.line(x, y + 84, x + w, y + 84, stroke=LINE_SOFT)
    f.text(x, y + 108, "1× Dish name", size=13)
    f.text(x + w, y + 108, "₱145.00", size=13, anchor="end")
    f.text(x, y + 146, "Ready-made item (cancelled)", size=13, fill=INK3)
    f.line(x, y + 141, x + text_width("Ready-made item (cancelled)", 13), y + 141, stroke=INK3)
    f.text(x + w, y + 146, "₱0.00", size=13, anchor="end", fill=INK3)
    f.line(x, y + 164, x + w, y + 164, stroke=LINE_SOFT)
    for i, (label, value, bold) in enumerate([("Charged", "₱180.00", False), ("Cancelled dishes (refund)", "−₱35.00", False), ("TOTAL", "₱145.00", True),
                                              ("Paid by", "Cash", False), ("Cash received", "₱200.00", False), ("Change", "₱20.00", False)]):
        ry = y + 192 + i * 26
        f.text(x, ry, label, size=15 if bold else 13, bold=bold, fill=INK if bold else INK2)
        f.text(x + w, ry, value, size=15 if bold else 13, bold=bold, anchor="end")
    f.rect(x, y + 356, w, 60, fill=FILL2, stroke=None, r=6)
    f.wrap(x + 14, y + 380, w - 28, "Sent to the kitchen. Tell the customer it will be ready at about 2:43 AM.", size=12)
    f.text(x + w / 2, y + 448, "Printed on the receipt printer.", size=13, fill=INK2, anchor="middle")
    f.btn_row(x + w, y + 470, [("Done", "secondary"), ("Print receipt", "primary")], h=38)
    f.add_note("The receipt of a paid order some of whose dishes were cancelled (Receipt on Paid orders, 19f): the cancelled dish is struck through, Charged is what the customer paid, Cancelled dishes (refund) what is owed back, and TOTAL what is left. The change is worked out from what was charged.")
    f.add_note("Printed on the counter's receipt printer (?printer=1): the slip shows “Cancelled (refund) -35.00” above the total, then the cash received and the change. Dishes cancelled whole aren't printed.")
    return f


def new_order():
    f = admin_page("19e", "Orders awaiting payment: New order (walk-in)", "/staff/orders?tab=new", SC + "PosNewOrder.tsx, " + POS_FILES, h=900, role="staff", active="/staff/orders")
    y = orders_header(f, 1)
    mw = CW - 18 - 340
    f.inp(CX, y, 300, 38, placeholder="Search dishes")
    y += 50
    chip_row(f, CX, y, ["All", "Sizzling Plates", "Rice & Noodles", "Drinks", "Ready-made"], selected=1, h=30)
    y += 46
    tw = (mw - 3 * 10) / 4
    for i in range(12):
        tx, ty = CX + (i % 4) * (tw + 10), y + (i // 4) * 112
        out = i in (2, 7)
        f.rect(tx, ty, tw, 100, fill=FILL2 if out else WHITE, stroke=LINE_SOFT if out else LINE, r=6, dash="4 3" if out else None)
        f.img(tx + 10, ty + 10, 34, 34, r=4)
        f.text(tx + 52, ty + 26, "Dish name", size=13, bold=True, fill=INK3 if out else INK)
        f.text(tx + 10, ty + 86, "₱000.00", size=13, fill=INK3 if out else INK)
        f.text(tx + tw - 10, ty + 86, "SOLD OUT" if out else f"{[12, 8, 5, 22][i % 4]} left", size=10, anchor="end", fill=INK3, bold=out)
    cx = CX + mw + 18
    top = card(f, cx, y - 96, 340, 520, "Order · 3 items")
    ly = top + 16
    for name, note, qty, price in [("Dish name", "Extra rice", "2", "₱290.00"), ("Ready-made item", None, "1", "₱35.00")]:
        f.text(cx + 16, ly + 14, name, size=13, bold=True)
        f.text(cx + 324, ly + 14, price, size=13, anchor="end")
        if note:
            f.text(cx + 16, ly + 32, note, size=12, fill=INK3)
        f.btn(cx + 16, ly + 42, 30, 30, "−", size=14)
        f.text(cx + 62, ly + 62, qty, size=14, anchor="middle")
        f.btn(cx + 78, ly + 42, 30, 30, "+", size=14)
        f.text(cx + 324, ly + 62, "Remove", size=12, anchor="end", fill=INK3)
        ly += 88
        f.line(cx, ly - 6, cx + 340, ly - 6, stroke=LINE_SOFT)
    f.segmented(cx + 16, ly + 10, 308, 38, ["Dine in", "Take out"], 1)
    f.text(cx + 16, ly + 88, "Total", size=13, fill=INK2)
    f.text(cx + 324, ly + 90, "₱325.00", size=22, bold=True, anchor="end")
    f.btn(cx + 16, ly + 110, 308, 42, "Charge ₱325.00", kind="primary")
    f.text(cx + 170, ly + 178, "Clear order", size=12, anchor="middle", fill=INK3)
    f.add_note("Staff ring up a walk-in customer who doesn't use the kiosk. The menu: search, category chips, a tile per dish with its price and what's left (servings, or pieces for a ready-made item); sold-out dishes are greyed out and can't be added, and the menu reloads as stock changes (inventory:updated).")
    f.add_note("Tapping a dish opens a small sheet: quantity, the dish's own special-instruction options and a note for the kitchen (140 characters together), Add N · ₱…. The same dish with the same instructions adds to its line; lines can be changed with − / + or removed.")
    f.add_note("Charge places a counter order (POST /api/orders as staff: source “counter”, no kiosk session) and opens the payment step (19c). Closing that without paying leaves the order in the Queue, unpaid. If a dish ran out meanwhile, the error says so and the menu reloads.")
    return f


def paid_list(f, y, cancelling=True):
    y = f.wrap(CX, y + 4, CW, "Paid orders the kitchen hasn't handed over yet. Cancel the order, or only some of its dishes, if the customer leaves or a dish can't be made: dishes not started go back into stock, and the amount moves to the Queue until you refund the customer.", size=13, fill=INK2)
    y += 8
    f.inp(CX, y, 320, 38, placeholder="Search order number")
    y += 54
    card(f, CX, y, CW, f.h - y - 24)
    for i, (status, walkin, dishes, meta) in enumerate([
        ("PREPARING", False, ["1× Dish name · cooking", "1× Ready-made item · not started"], "Dine in · ₱000.00 · Cash · paid 6 min ago"),
        ("IN THE KITCHEN", True, ["2× Dish name · not started", "1× Ready-made item · cooking"], "Take out · ₱000.00 · GCash · paid just now"),
    ]):
        f.text(CX + 18, y + 32, "ZK-XXXXXX", size=17, bold=True)
        px = CX + 128 + f.pill(CX + 128, y + 17, status, size=10) + 6
        if walkin:
            f.pill(px, y + 17, "WALK-IN", size=10)
        for j, d in enumerate(dishes):
            f.text(CX + 18, y + 56 + j * 20, d, size=13, fill=INK2)
        f.text(CX + 18, y + 64 + len(dishes) * 20, meta, size=12, fill=INK3)
        if i == 0 or not cancelling:
            f.btn_row(CX + CW - 18, y + 30, [("Receipt", "secondary"), ("Cancel order", "danger")], h=38)
            y += 112
        else:
            cancel_panel(f, CX + CW - 18 - 380, y + 12, 380, paid=True)
        f.line(CX, y, CX + CW, y, stroke=LINE_SOFT)


def paid_orders():
    f = admin_page("19f", "Orders awaiting payment: Paid orders (cancelling some dishes)", "/staff/orders?tab=paid", SC + "PaidOrders.tsx, " + SC + "CancelDishes.tsx, " + POS_FILES, h=960, role="staff", active="/staff/orders")
    y = orders_header(f, 2)
    paid_list(f, y)
    f.add_note("Paid orders not yet handed over (GET /api/orders?inKitchen=1), oldest first, each dish with its kitchen progress (not started, cooking, done), the order's status and how it was paid; updates live as the kitchen works. Receipt shows the receipt again (19d, 19g).")
    f.add_note("Cancel order (moved here from the kitchen display, per the panel) asks which dishes, all ticked at first, and how many of each (− / +), and a reason, a quick choice or typed (the button stays disabled until there is one); POST /api/orders/:id/cancel-items. Dishes chosen that the kitchen hasn't started go back into stock, logged under the person who cancelled with the reason “return”; a started or done dish counts as used.")
    f.add_note("Some dishes: the rest stays on the kitchen display (a dish cancelled whole leaves it; the order is ready once every dish left is done), the total goes down, and the Queue shows NEEDS ATTENTION with a note to refund their amount; Mark as sorted out keeps the payment as paid. Every dish left: the whole order is cancelled, as before, and Refunded: mark as sorted out records the payment as refunded (19). Reasons and refunds show in Transactions (23).")
    return f


# --- 20 users & roles --------------------------------------------------------------------
def users_base(f):
    y = page_header(f, "Authentication & authorization", "Users & roles", [("+ Invite user", "primary")])
    half = (CW - 14) / 2
    for i, (name, count, desc) in enumerate([
        ("Administrator", "2 ACCOUNTS", "Everything staff can do, plus products, prices and costs, bulk import, analytics and reports, and user administration."),
        ("Staff", "3 ACCOUNTS", "Orders, counter payment confirmation, kitchen display, and stock adjustments. No product, price, report, or user administration."),
    ]):
        x = CX + i * (half + 14)
        f.rect(x, y, half, 96, fill=WHITE, stroke=LINE, r=6)
        f.text(x + 16, y + 28, name, size=14, bold=True)
        f.text(x + half - 16, y + 28, count, size=11, anchor="end", fill=INK3, bold=True)
        f.wrap(x + 16, y + 52, half - 32, desc, size=12, fill=INK2)
    y += 114
    top = card(f, CX, y, CW, 30 + 5 * 52 + 48, "Accounts")

    def user(me):
        def draw(x, yy, w, h):
            f.circle(x + 28, yy + h / 2, 14, fill=FILL3, stroke=LINE)
            f.text(x + 52, yy + h / 2 - 2, "Full name", size=13, bold=True)
            if me:
                f.pill(x + 128, yy + h / 2 - 17, "YOU", size=9)
            f.text(x + 52, yy + h / 2 + 15, "name@example.com", size=11, fill=INK3)
        return draw

    def role(value, me):
        return lambda x, yy, w, h: f.inp(x + 12, yy + h / 2 - 15, 110, 30, value=value, select=True, size=12) if not me else (
            f.rect(x + 12, yy + h / 2 - 15, 110, 30, fill=FILL3, stroke=LINE_SOFT, r=4, dash="4 3"),
            f.text(x + 22, yy + h / 2 + 5, value, size=12, fill=INK3))

    def action(label, me):
        def draw(x, yy, w, h):
            right = x + w - 14
            f.btn(right - 96, yy + h / 2 - 15, 96, 30, label, kind="disabled" if me else "secondary", size=12)
            f.btn(right - 96 - 8 - 96, yy + h / 2 - 15, 96, 30, "Test email", size=12)
            f.btn(right - 2 * (96 + 8) - 56, yy + h / 2 - 15, 56, 30, "Edit", size=12)
        return draw

    rows = [[user(True), role("Admin", True), P(f, "ACTIVE"), action("Suspend", True)],
            [user(False), role("Admin", False), P(f, "ACTIVE"), action("Suspend", False)],
            [user(False), role("Staff", False), P(f, "ACTIVE"), action("Suspend", False)],
            [user(False), role("Staff", False), P(f, "SUSPENDED", filled=True), action("Reactivate", False)],
            [user(False), role("Staff", False), P(f, "ACTIVE"), action("Suspend", False)]]
    f.table(CX, top, CW, [("User", 0.36, "left"), ("Role", 0.17, "left"), ("Status", 0.13, "left"), ("Actions", 0.34, "right")], rows, rowh=52)


def users():
    f = admin_page("20", "Users & roles", "/admin/users", A + "admin/users/page.tsx", h=800, access=ADMIN)
    users_base(f)
    f.add_note("The signed-in admin's own row (YOU) has its role and Suspend disabled: “You can't suspend your own account or change its role. Another admin can.” The API refuses it too.")
    f.add_note("Changing a role or suspending asks first (20c); Reactivate happens straight away. A suspended user can't sign in and loses access within 15 minutes. + Invite user opens 20b.")
    f.add_note("Edit (20d) changes the name, email or password. Test email sends the account a test message, so its address is known to work before sign-in codes (10c) rely on it; the message says when it was sent, or why Brevo refused it.")
    return f


def edit_user():
    f = admin_page("20d", "Users: edit an account (popup)", "/admin/users  (popup)", A + "admin/users/page.tsx (EditUserModal)", h=800, access=ADMIN)
    users_base(f)
    x, y, w = modal(f, 384, 400)
    f.text(x, y + 20, "Edit Full name", size=18, bold=True)
    f.inp(x, y + 70, w, 38, label="Name", value="Full name")
    f.inp(x, y + 138, w, 38, label="Email", value="name@gmail.com")
    f.wrap(x, y + 190, w, "Sign-in codes go here, so use a real inbox. Send a test email after changing it.", size=12, fill=INK3)
    f.inp(x, y + 252, w, 38, label="New password", placeholder="Leave empty to keep the current one", mono=True)
    f.btn_row(x + w, y + 312, [("Cancel", "secondary"), ("Save", "primary")], h=38)
    f.add_note("Only what changed is sent (PATCH /api/users/:id). The email is saved in lowercase and must not belong to another account (“A user with that email already exists”); a new password needs at least 8 characters.")
    f.add_note("A sign-in code already emailed stops working when the email or password changes (or the account is suspended). An admin can edit their own account too.")
    return f


def invite_user():
    f = admin_page("20b", "Invite a new user (popup)", "/admin/users  (popup)", A + "admin/users/page.tsx (CreateUserModal)", h=800, access=ADMIN)
    users_base(f)
    x, y, w = modal(f, 384, 420)
    f.text(x, y + 20, "Invite a new user", size=18, bold=True)
    f.inp(x, y + 70, w, 38, label="Name")
    f.inp(x, y + 138, w, 38, label="Email")
    f.inp(x, y + 206, w, 38, label="Temporary password", placeholder="At least 8 characters")
    f.inp(x, y + 274, w, 38, label="Role", value="Staff", select=True)
    f.btn_row(x + w, y + 330, [("Cancel", "secondary"), ("Create account", "primary")], h=38)
    f.add_note("All four fields are required; the email must be valid and the password at least 8 characters (checked by the browser and again by the API). An API error (e.g. “A user with that email already exists”) shows above the buttons.")
    f.add_note("On success the popup closes and “Account created for Full name (Staff)” appears. No email is sent: the admin gives the temporary password to the person.")
    return f


def confirm_change():
    f = admin_page("20c", "Users: confirm a change (popup)", "/admin/users  (popup)", C + "ConfirmDialog.tsx, " + A + "admin/users/page.tsx", h=800, access=ADMIN)
    users_base(f)
    x, y, w = modal(f, 448, 210)
    f.text(x, y + 22, "Suspend Full name?", size=18, bold=True)
    f.wrap(x, y + 52, w, "They won't be able to sign in, and they'll be signed out within 15 minutes. You can reactivate the account at any time.", size=13, fill=INK2)
    f.btn_row(x + w, y + 114, [("Cancel", "secondary"), ("Yes, suspend", "danger")], h=38)
    f.add_note("Role changes use the same popup: “Make Full name an Administrator?” / “Yes, make Administrator”, or “Change Full name to Staff?” / “Yes, change to Staff”, each with a sentence on what they gain or lose.")
    return f


# --- 21 kiosk QR code --------------------------------------------------------------------
def qr_page(invalid):
    f = admin_page("21b" if invalid else "21", "Kiosk QR code" + (": invalid address" if invalid else ""), "/admin/kiosk-qr",
                   A + "admin/kiosk-qr/page.tsx", h=1000, access=ADMIN)
    kind = "disabled" if invalid else None
    y = page_header(f, "Kiosk access", "Kiosk QR code", [("Download PNG", kind or "secondary"), ("Print poster", kind or "primary")])
    card(f, CX, y, CW, 120 if invalid else 96)
    f.inp(CX + 18, y + 38, CW - 170, 38, label="Kiosk address the code opens", value="kiosk-address" if invalid else "https://(kiosk site address)/", invalid=invalid)
    f.btn(CX + CW - 140, y + 38, 122, 38, "Use this site")
    if invalid:
        f.text(CX + 18, y + 100, "Enter a full web address starting with https:// or http://.", size=13, bold=True)
    y += (120 if invalid else 96) + 24
    px = CX + CW / 2 - 210
    f.rect(px, y, 420, 660, fill=WHITE, stroke=LINE, r=10)
    f.img(px + 170, y + 28, 80, 80, r=30, label="Logo")
    f.text(px + 210, y + 144, "Zak's Sizzling Hub", size=24, bold=True, anchor="middle")
    f.text(px + 210, y + 168, "Skip the line. Order from your phone.", size=14, anchor="middle", fill=INK2)
    f.text(px + 210, y + 212, "Scan to order", size=28, bold=True, anchor="middle")
    if invalid:
        f.rect(px + 60, y + 232, 300, 300, fill=WHITE, stroke=LINE, r=6, dash="6 4")
        f.text(px + 210, y + 386, "Enter a valid address", size=13, anchor="middle", fill=INK3)
    else:
        f.img(px + 60, y + 232, 300, 300, label="QR code")
    for i, step in enumerate(["1. Point your phone camera at the code.", "2. Choose your meal on the menu that opens.",
                              "3. Pay at the counter, or online with QR Ph."]):
        f.text(px + 60, y + 564 + i * 22, step, size=14)
    if not invalid:
        f.text(px + 210, y + 640, "https://(kiosk site address)/", size=11, anchor="middle", fill=INK3)
    if invalid:
        f.add_note("Download PNG and Print poster are disabled until the address is a valid http(s) address.")
        f.add_note("A localhost address shows a warning instead: “This address only works on this computer, so a phone that scans it won't open the kiosk…”.")
    else:
        f.add_note("The address starts as the kiosk site's address (NEXT_PUBLIC_KIOSK_URL, else this site) and is remembered on this device; Use this site resets it. The QR code is made in the browser; nothing is sent to an outside service.")
        f.add_note("Print poster prints only the poster on A4; Download PNG saves the code as zaks-kiosk-qr.png. Step 3 mentions QR Ph, the one online payment method.")
    return f


def kiosk_qr():
    return qr_page(False)


def kiosk_qr_invalid():
    return qr_page(True)


# --- 22 categories ------------------------------------------------------------------------
def categories():
    f = admin_page("22", "Categories", "/admin/categories", A + "admin/categories/page.tsx", h=900, access=ADMIN)
    y = page_header(f, "Product management", "Categories")
    y = f.wrap(CX, y, CW, "The order below is the order of the kiosk's category rail. Kiosks update as soon as you save.", size=13, fill=INK2)
    y += 10
    top = card(f, CX, y, CW, 186, "New category")
    f.inp(CX + 18, top + 30, 520, 38, label="Name", value="Category name")
    f.inp(CX + 552, top + 30, 128, 38, label="Icon (emoji)", value="(emoji)")
    f.checkbox(CX + 698, top + 41, checked=True)
    f.text(CX + 722, top + 54, "Mark as new", size=13)
    f.text(CX + 18, top + 104, "One emoji, shown on the kiosk's category tile. On Windows, press Win + . to pick one.", size=12, fill=INK3)
    f.btn_row(CX + CW - 18, top + 84, [("Add category", "primary"), ("Cancel", "secondary")], h=38)
    y += 204
    rows = 8
    card(f, CX, y, CW, rows * 64 + 8)
    for i in range(rows):
        ry = y + 8 + i * 64
        if i:
            f.line(CX, ry, CX + CW, ry, stroke=LINE_SOFT)
        f.text(CX + 34, ry + 36, str(i + 1), size=13, anchor="end", fill=INK3)
        f.rect(CX + 48, ry + 12, 40, 40, fill=FILL3, stroke=None, r=6)
        if i == 7:
            f.text(CX + 104, ry + 30, "Ready-made", size=14, bold=True)
            f.pill(CX + 194, ry + 16, "BUILT-IN", size=10)
            f.text(CX + 104, ry + 50, "2 products · sold as they are, counted in pieces (no recipe)", size=12, fill=INK3)
            f.btn_row(CX + CW - 18, ry + 15, [("↑", "secondary"), ("↓", "secondary"), ("Edit", "secondary")], h=34, size=12)
            continue
        f.text(CX + 104, ry + 30, "Category name", size=14, bold=True)
        if i == 5:
            f.pill(CX + 220, ry + 16, "NEW", size=10)
        f.text(CX + 104, ry + 50, "0 products" if i == 6 else f"{[5, 4, 2, 2, 3, 2][i]} products", size=12, fill=INK3)
        if i == 6:
            bx = CX + CW - 18 - 360
            f.text(bx, ry + 37, "Delete “Category name”?", size=13)
            f.btn_row(CX + CW - 18, ry + 15, [("Yes, delete", "danger"), ("Keep it", "secondary")], h=34, size=12)
        else:
            f.btn_row(CX + CW - 18, ry + 15, [("↑", "secondary"), ("↓", "secondary"), ("Edit", "secondary"), ("Delete", "danger")], h=34, size=12)
    f.add_note("Admin only. Uses the manuscript's category fields: name (unique, whatever the capitals), icon (one emoji), sort order and “new” (a NEW badge on the kiosk's category tile). Add category opens the form above; Edit turns a row into the same form.")
    f.add_note("↑ / ↓ change the kiosk rail's order (PUT /api/categories/order). Only an empty category can be deleted, after “Yes, delete” (last row); one with products says “… still has N products. Move them to another category on the Products page first.”")
    f.add_note("Ready-made (last row) is the built-in category for items sold as they are, such as bottled drinks: its items have no recipe and are counted in pieces (12e). Its name can't be changed (the Edit form shows it read-only) and it has no Delete; its icon, NEW badge and place on the rail can change.")
    f.add_note("Every change is sent to open kiosks (categories:changed), which reload their category rail at once.")
    return f


# --- 23 transactions ----------------------------------------------------------------------
def transactions():
    f = admin_page("23", "Transactions", "/admin/transactions", A + "admin/transactions/page.tsx", h=1000, access=ADMIN)
    y = page_header(f, "Sales", "Transactions")
    y = f.wrap(CX, y, CW, "Every order with its payment and status. Open an order to see its items and when it reached each step.", size=13, fill=INK2)
    y += 10
    card(f, CX, y, CW, 170)
    fw = (CW - 36 - 24) / 3
    fields = [("From", "10/28/2026"), ("To", "10/28/2026"), ("Status", "Any status"), ("Payment method", "Any method"),
              ("Payment", "Paid or unpaid"), ("Order number", "")]
    for i, (label, value) in enumerate(fields):
        fx, fy = CX + 18 + (i % 3) * (fw + 12), y + 34 + (i // 3) * 68
        f.inp(fx, fy, fw, 36, label=label, value=value, placeholder="e.g. ZK-LTLY9N" if not value else "", select=i in (2, 3, 4))
    y += 188
    f.text(CX, y + 14, "4 orders · 2026-10-28", size=13, fill=INK2)
    f.text(CX + 180, y + 14, "Sales ₱000.00 from 2 paid orders", size=13, fill=INK2)
    f.text(CX + 430, y + 14, "Average order value ₱000.00", size=13, fill=INK2)
    y += 30
    rows = [("UNPAID", "Dine in · Counter · unpaid"), ("CONFIRMED", "Take out · Counter · paid"),
            ("HANDED OVER", "Take out · QR Ph · paid"), ("CANCELLED", "Dine in · Counter · unpaid")]
    top = y
    card(f, CX, y, CW, 4 * 66 + 150)
    for i, (status, meta) in enumerate(rows):
        f.text(CX + 18, y + 28, "ZK-XXXXXX", size=15, bold=True)
        f.pill(CX + 116, y + 13, status, size=10)
        f.text(CX + 18, y + 50, "2× Dish name, 1× Dish name", size=13, fill=INK2)
        f.text(CX + CW - 18, y + 28, "₱000.00", size=15, bold=True, anchor="end")
        f.text(CX + CW - 18, y + 50, "Oct 28, 2:26 AM · " + meta, size=12, fill=INK3, anchor="end")
        y += 66
        if i == 2:
            f.rect(CX + 1, y, CW - 2, 150, fill=FILL2, stroke=None)
            f.text(CX + 18, y + 22, "ITEMS", size=11, fill=INK3, bold=True)
            f.text(CX + 18, y + 44, "2× Dish name", size=13)
            f.text(CX + 18, y + 62, "“Extra rice”", size=12, fill=INK3, italic=True)
            f.text(CX + CW / 2 - 24, y + 44, "₱000.00", size=13, anchor="end")
            tx = CX + CW / 2
            f.text(tx, y + 22, "TIMELINE", size=11, fill=INK3, bold=True)
            for j, step in enumerate(["Placed", "Paid", "Preparing", "Ready", "Handed over"]):
                f.text(tx, y + 44 + j * 20, step, size=12)
                f.text(CX + CW - 18, y + 44 + j * 20, "Oct 28, 2:2" + str(6 + j // 3) + " AM", size=12, anchor="end", fill=INK2)
            y += 150
        if i < 3:
            f.line(CX, y, CX + CW, y, stroke=LINE_SOFT)
    f.add_note("Admin only. GET /api/orders/history: the orders in the date range (Manila days, today by default), newest first, 25 a page (Previous / Next with “Page 1 of N”). Filters: status (Unpaid, Confirmed, Preparing, Ready, Handed over, Cancelled), payment method, paid or unpaid, and order number (ignores spaces and dashes).")
    f.add_note("The totals cover every matching order: how many, sales from the paid ones (confirmed to handed over, as in Analytics) and their average order value. Clicking a row opens its items, instructions, timeline (placed, paid, preparing, ready, handed over or cancelled, refunded), the reason if the kitchen cancelled it, and the PayMongo reference for QR Ph.")
    f.add_note("Reloads by itself when an order changes (orders:changed). Empty: “No orders match these filters.”")
    return f


# --- 24 order status board ------------------------------------------------------------------
def status_board():
    bw, bh = 1280, 720
    f = Wireframe("24", "Order status board (screen at the counter)", "/board", A + "board/page.tsx",
                  bw, bh, "1280 × 720 screen at the counter (TV or monitor), landscape", "Anyone (no login; kiosk or admin site)")
    f.rect(0, 0, bw, bh, fill=DARK, stroke=None)
    f.text(40, 52, "Order status", size=34, bold=True, fill=WHITE)
    f.text(290, 50, "Zak's Sizzling Hub", size=16, fill=FILL3)
    f.btn(bw - 260, 24, 220, 40, "Tap to turn on sound", size=13)
    f.line(0, 84, bw, 84, stroke=FILL3, sw=2)
    f.text(40, 136, "Preparing", size=26, bold=True, fill=WHITE)
    for i in range(5):
        x, y = 40 + (i % 2) * 220, 160 + (i // 2) * 70
        f.rect(x, y, 204, 56, fill=DARK, stroke=FILL3, r=10, sw=1.5)
        f.text(x + 102, y + 37, "ZK-XXXXXX", size=22, bold=True, anchor="middle", fill=WHITE)
    rx, rw = 520, 720
    f.rect(rx, 110, rw, 570, fill=WHITE, stroke=None, r=18)
    f.text(rx + 32, 160, "Ready for pickup", size=34, bold=True)
    f.text(rx + 32, 192, "Please collect your order at the counter.", size=16, fill=INK2)
    for i in range(3):
        x, y = rx + 32 + (i % 2) * 336, 226 + (i // 2) * 116
        f.rect(x, y, 320, 96, fill=INK if i == 0 else WHITE, stroke=None if i == 0 else LINE, r=12, sw=1.5)
        f.text(x + 160, y + 62, "ZK-XXXXXX", size=40, bold=True, anchor="middle", fill=WHITE if i == 0 else INK)
    f.add_note("The customer's ready notice. Paid orders show under Preparing while the kitchen works on them (oldest first), then move to Ready for pickup when their last dish is done (newest first, highlighted for 15 seconds, with a two-note chime). They leave when the kitchen presses Handed over (18).")
    f.add_note("No sign-in: GET /api/orders/board returns order numbers only, from the last 12 hours. It updates live (orders:changed), re-checks every minute, and shows “Reconnecting…” if the server can't be reached. Empty columns say “No orders being prepared.” / “Nothing waiting right now.”")
    f.add_note("Browsers play sound only after a tap, hence “Tap to turn on sound” (hidden once sound is on); a kiosk browser can be started with --autoplay-policy=no-user-gesture-required instead. Text is larger on a TV-sized screen.")
    return f


SCREENS = [login, login_error, login_code, dashboard, dashboard_staff, products, product_form, product_form_recipe, product_form_ready,
           product_delete, raw_materials, raw_adjust, raw_form, raw_form_edit, raw_remove, stock_count, stock_count_result, raw_nutrition, raw_dishes, raw_ready, adjust_stock, raw_movements,
           bulk_import, bulk_import_result, analytics, analytics_stock, kitchen, kitchen_empty, orders, orders_empty, payment_panel, counter_receipt,
           new_order, paid_orders, counter_receipt_cancelled, users, invite_user, confirm_change, edit_user, kiosk_qr, kiosk_qr_invalid, categories, transactions,
           status_board, shopping_list, purchase_form, purchase_list, price_history, raw_materials_staff, stock_count_result_staff]

SLUGS = {
    "10": "login", "10b": "login-error", "10c": "login-code", "11": "dashboard", "11b": "dashboard-staff", "12": "products",
    "12b": "product-form-add", "12c": "product-form-recipe", "12d": "product-delete", "12e": "product-form-ready-made",
    "13b": "adjust-stock", "14": "raw-materials", "14b": "raw-material-adjust", "14c": "raw-material-form",
    "14d": "raw-material-nutrition", "14e": "raw-materials-dishes", "14f": "raw-materials-ready-made", "14g": "stock-movements", "14h": "raw-material-edit-remove",
    "14i": "raw-material-remove", "14j": "stock-count", "14k": "stock-count-variance", "14l": "raw-materials-staff", "14m": "stock-count-variance-staff",
    "16": "bulk-import-preview", "16b": "bulk-import-result", "17": "analytics", "17b": "analytics-food-cost-usage", "18": "kitchen-display", "18b": "kitchen-display-empty",
    "19": "orders-awaiting-payment", "19b": "orders-awaiting-payment-empty", "19c": "take-payment", "19d": "counter-receipt",
    "19e": "new-order", "19f": "paid-orders", "19g": "counter-receipt-cancelled-dish", "20": "users-roles", "20b": "invite-user", "20c": "confirm-user-change",
    "20d": "edit-user", "21": "kiosk-qr", "21b": "kiosk-qr-invalid", "22": "categories", "23": "transactions", "24": "order-status-board", "25": "shopping-list", "25b": "record-purchase", "25c": "purchases", "25d": "price-history",
}
