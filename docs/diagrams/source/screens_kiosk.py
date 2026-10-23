"""Customer kiosk wireframes (01-09), drawn at the 1024 x 600 kiosk touchscreen size.

Layout, labels, fields and buttons follow the components named in each header. Dish and
category data are placeholders except the category names, which come from the seed data
and lib/instructionChips.ts.
"""

from wf import DARK, FILL2, FILL3, FILL4, INK, INK2, INK3, LINE, WHITE, Wireframe, text_width

W, H = 1024, 600
SIZE = "1024 × 600 kiosk touchscreen, landscape"
ACCESS = "Customer (kiosk site, no login)"
CATS = ["Sizzling Plates", "Rice & Noodles", "Soups & Stews", "Sides", "Drinks", "Specials"]
CHIPS = ["Extra spicy", "Not spicy", "No onions", "Well done", "Sauce on the side"]
PRICE_CHIPS = ["Any price", "Under ₱100", "₱100–₱199", "₱200 and up"]
K = "apps/web/src/components/kiosk/"


def kiosk(number, name, route, files):
    return Wireframe(number, name, route, files, W, H, SIZE, ACCESS)


# --- shared pieces ----------------------------------------------------------------------
def top_bar(f, search=""):
    f.rect(0, 0, W, 64, fill=FILL4, stroke=None)
    f.line(0, 64, W, 64, stroke=INK2, sw=2)
    f.img(12, 12, 40, 40, r=8)
    f.rect(64, 8, 800, 48, fill=WHITE, stroke=LINE, r=24)
    f.icon(88, 32, 8)
    if search:
        f.text(106, 38, search, size=17, fill=INK)
        f.circle(838, 32, 14, fill=FILL2, stroke=LINE)
        f.text(838, 37, "×", size=16, anchor="middle", fill=INK2)
    else:
        f.text(106, 38, "Search the menu", size=17, fill=INK3)
    f.icon(894, 32, 9)
    f.text(910, 37, "Start over", size=14, bold=True, fill=INK)


def category_rail(f, active=0, disabled=(), new_index=None):
    f.rect(0, 64, 208, 460, fill=FILL4, stroke=None)
    f.line(208, 64, 208, 524, stroke=INK2, sw=2)
    y = 74
    for i, name in enumerate(CATS):
        off = i in disabled
        if i == active:
            f.rect(10, y, 188, 56, fill=WHITE, stroke=INK2, r=16, sw=2)
        f.img(18, y + 8, 40, 40, r=10, fill=WHITE if off else FILL3)
        f.text(68, y + 33, name, size=14, bold=True, fill=INK3 if off else INK)
        if new_index == i:
            f.pill(194, y + 4, "NEW", size=9, filled=True, anchor="end")
        y += 62
    return y


def grid_area(f, title, subtitle, price_selected=0, counts=(8, 2, 3, 3)):
    f.rect(210, 65, W - 210, 459, fill=FILL2, stroke=None)
    f.text(228, 106, title, size=28, bold=True)
    f.text(228 + text_width(title, 28, True) + 14, 106, subtitle, size=14, fill=INK2)
    x = 228
    for i, (label, count) in enumerate(zip(PRICE_CHIPS, counts)):
        full = f"{label}  {count}"
        w = text_width(full, 14, True) + 32
        f.btn(x, 120, w, 40, full, kind="primary" if i == price_selected else "secondary", r=20, size=14)
        x += w + 8


def item_tile(f, x, y, w, sold_out=False):
    img_h = w * 0.75
    h = img_h + 74
    f.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=14)
    f.img(x, y, w, img_h, label="Photo or icon")
    if sold_out:
        f.rect(x, y + img_h - 28, w, 28, fill=DARK, stroke=None)
        f.text(x + w / 2, y + img_h - 9, "SOLD OUT", size=13, bold=True, anchor="middle", fill=WHITE)
    else:
        f.circle(x + w - 30, y + img_h - 30, 24, fill=DARK, stroke=WHITE, sw=2)
        f.text(x + w - 30, y + img_h - 21, "+", size=26, anchor="middle", fill=WHITE, bold=True)
    f.text(x + 12, y + img_h + 26, "Dish name", size=15, bold=True, fill=INK3 if sold_out else INK)
    f.text(x + 12, y + img_h + 58, "₱000.00", size=19, bold=True, fill=INK3 if sold_out else INK)
    if sold_out:
        f.rect(x, y, w, h, fill=WHITE, stroke=None, r=14, opacity=0.35)
    return h


def tile_grid(f, count=8, sold_out=(2,), top=176):
    tw = (W - 210 - 40 - 36) / 4
    f.begin_clip(210, 65, W - 210, 459)
    for i in range(count):
        col, row = i % 4, i // 4
        item_tile(f, 230 + col * (tw + 12), top + row * (tw * 0.75 + 86), tw, sold_out=i in sold_out)
    f.end_clip()


def order_bar(f, lines=3):
    f.rect(0, 524, W, 76, fill=WHITE, stroke=None)
    f.line(0, 524, W, 524, stroke=LINE)
    if lines == 0:
        f.img(16, 536, 64, 50, r=6)
        f.text(94, 567, "Your order is empty.", size=15, bold=True)
        f.text(94 + text_width("Your order is empty.", 15, True) + 8, 567, "Tap a dish to start.", size=15, fill=INK2)
        f.btn(818, 534, 190, 56, "Review & pay", kind="disabled", r=28, size=17)
        total = "₱0.00"
    else:
        f.text(16, 556, "Your", size=16, bold=True)
        f.text(16, 576, "order", size=16, bold=True)
        f.begin_clip(80, 526, 640, 72)
        for i in range(lines):
            cx = 84 + i * 214
            f.rect(cx, 534, 204, 56, fill=FILL2, stroke=LINE, r=14)
            f.img(cx + 6, 540, 44, 44, r=10)
            f.text(cx + 58, 557, f"{i % 2 + 1}× Dish name", size=13, bold=True)
            f.text(cx + 58, 577, "₱000.00", size=13, fill=INK2)
        f.end_clip()
        f.btn(818, 534, 190, 56, "Review & pay  ›", kind="primary", r=28, size=17)
        total = "₱000.00"
    f.text(800, 553, "Total", size=12, anchor="end", fill=INK2)
    f.text(800, 580, total, size=22, bold=True, anchor="end")


def menu_base(f, lines=3):
    top_bar(f)
    category_rail(f, active=0, new_index=5)
    grid_area(f, "Sizzling Plates", "8 dishes")
    tile_grid(f)
    order_bar(f, lines)


def qty_stepper(f, x, y, qty="1"):
    f.rect(x, y, 144, 48, fill=WHITE, stroke=LINE, r=24)
    f.text(x + 24, y + 31, "−", size=20, anchor="middle", bold=True)
    f.text(x + 72, y + 31, qty, size=17, anchor="middle", bold=True)
    f.text(x + 120, y + 31, "+", size=20, anchor="middle", bold=True)


# --- screens ----------------------------------------------------------------------------
def welcome():
    f = kiosk("01", "Welcome screen", "/  (first stage of the kiosk page)", K + "WelcomeScreen.tsx, apps/web/src/app/page.tsx")
    f.rect(0, 0, W, H, fill=FILL4, stroke=None)
    f.img(44, 96, 96, 96, r=40, label="Logo")
    f.text(44, 268, "Sizzling hot.", size=62, bold=True)
    f.text(44, 332, "Order here.", size=62, bold=True, fill=INK2)
    f.wrap(44, 372, 390, "Pick your plates, pay your way, and we'll call your number when it's ready.", size=18, fill=INK)
    f.img(500, 60, 480, 420, r=24, label="Sizzling plate illustration, or the first dish photo")
    f.line(0, 514, W, 514, stroke=INK2)
    f.circle(66, 557, 22, fill=WHITE, stroke=INK2)
    f.text(66, 563, "›", size=22, anchor="middle", bold=True)
    f.text(100, 565, "Tap anywhere to start", size=24, bold=True)
    f.icon(700, 557, 9)
    f.text(716, 562, "Pay at the counter", size=15)
    f.icon(872, 557, 9)
    f.text(888, 562, "GCash · Maya", size=15)
    f.add_note("The whole screen is one button: a tap anywhere opens 02 (Dine in / Take out).")
    f.add_note("“GCash · Maya” only appears when online payment is set up (GET /api/payments/options); it is not set up in production yet.")
    f.add_note("Once a product has a photo, the first available dish photo replaces the illustration.")
    f.add_note("The kiosk returns here after “Start over” and after the idle reset (06).")
    return f


def order_type():
    f = kiosk("02", "Dine in / Take out", "/  (second stage of the kiosk page)", K + "OrderTypeScreen.tsx, " + K + "OrderTypeArt.tsx")
    f.rect(0, 0, W, H, fill=FILL2, stroke=None)
    f.rect(0, 0, W, 66, fill=FILL4, stroke=None)
    f.line(0, 66, W, 66, stroke=INK2, sw=2)
    f.img(16, 13, 40, 40, r=8)
    f.text(68, 40, "Zak's Sizzling Hub", size=20, bold=True)
    f.icon(894, 33, 9)
    f.text(910, 38, "Start over", size=14, bold=True)
    f.text(W / 2, 214, "Where will you eat today?", size=44, bold=True, anchor="middle")
    for i, (label, hint, art) in enumerate([("Dine in", "Eat here at Zak's", "Dine-in drawing"), ("Take out", "Packed to go", "Take-out drawing")]):
        x = 176 + i * 348
        f.rect(x, 250, 324, 256, fill=WHITE, stroke=LINE, r=22, sw=2)
        f.img(x + 72, 274, 180, 150, r=8, label=art)
        f.text(x + 162, 462, label, size=30, bold=True, anchor="middle")
        f.text(x + 162, 490, hint, size=17, anchor="middle", fill=INK2)
    f.add_note("Choosing either card saves the choice on the device and opens the menu (03). It isn't asked again; it goes with the order to the receipt and the kitchen. “Start over” clears it with the order.")
    f.add_note("“Start over” clears the order and goes back to 01.")
    return f


def menu():
    f = kiosk("03", "Menu", "/  (third stage of the kiosk page)",
              "apps/web/src/app/page.tsx, " + K + "TopBar.tsx, CategoryRail.tsx, MenuGrid.tsx, ItemTile.tsx, OrderBar.tsx, Toast.tsx")
    menu_base(f)
    f.rect(372, 452, 280, 44, fill=DARK, stroke=None, r=22)
    f.text(512, 479, "Added 1 × Dish name", size=15, bold=True, anchor="middle", fill=WHITE)
    f.add_note("Top bar: search across every category, and Start over. Left rail: one tile per category; the chosen one is highlighted, NEW sits on a tile's corner when the category is flagged new.")
    f.add_note("Grid: one category at a time (4 columns, scrolls), price chips with a count per range. Tapping a tile opens the item sheet (04); the round + adds one straight to the order and shows the toast (shown here for a moment).")
    f.add_note("Sold out (third tile): dimmed, labelled SOLD OUT, no + button, can't be opened. Sold-out dishes are listed last and update live (inventory:updated).")
    f.add_note("Order bar: a chip per order line (tap to open the order review, 05), the total, and Review & pay (goes to 07). With an empty order it reads “Your order is empty” and Review & pay is greyed out (see 03c).")
    return f


def menu_no_results():
    f = kiosk("03b", "Menu: search with no results", "/", "apps/web/src/app/page.tsx, " + K + "MenuGrid.tsx (EmptyGrid), CategoryRail.tsx")
    top_bar(f, search="xyz")
    category_rail(f, active=None, disabled=(0, 2, 5), new_index=5)
    grid_area(f, "Search results", "0 dishes for “xyz”", price_selected=1, counts=(0, 0, 0, 0))
    f.circle(617, 270, 32, fill=FILL3, stroke=LINE)
    f.icon(617, 270, 12)
    f.text(617, 342, "Nothing matches “xyz”", size=24, bold=True, anchor="middle")
    f.text(617, 368, "Try another word, or show every price.", size=15, anchor="middle", fill=INK2)
    f.btn(455, 392, 160, 48, "Show every price", kind="primary", r=24, size=14)
    f.btn(627, 392, 140, 48, "Clear search", kind="secondary", r=24, size=14)
    order_bar(f, 3)
    f.add_note("While searching, no category is highlighted. Categories with no dish in the chosen price range (here “Under ₱100”) are dimmed and can't be tapped.")
    f.add_note("Other wordings in the code: no search but a price filter → “No dishes here under ₱100” with only Show every price; neither → “Nothing here right now”.")
    return f


def menu_loading():
    f = kiosk("03c", "Menu: loading", "/", "apps/web/src/app/page.tsx, " + K + "MenuGrid.tsx (MenuGridSkeleton), OrderBar.tsx")
    top_bar(f)
    f.rect(0, 64, 208, 460, fill=FILL4, stroke=None)
    f.rect(210, 65, W - 210, 459, fill=FILL2, stroke=None)
    f.rect(228, 82, 224, 30, fill=FILL3, stroke=None, r=8)
    f.rect(228, 122, 96, 18, fill=FILL3, stroke=None, r=6)
    tw = (W - 210 - 40 - 36) / 4
    for i in range(8):
        x, y = 230 + (i % 4) * (tw + 12), 160 + (i // 4) * (tw * 0.75 + 86)
        f.rect(x, y, tw, tw * 0.75 + 74, fill=WHITE, stroke=LINE, r=14)
        f.rect(x, y, tw, tw * 0.75, fill=FILL3, stroke=None)
        f.rect(x + 12, y + tw * 0.75 + 16, tw * 0.7, 14, fill=FILL3, stroke=None, r=4)
        f.rect(x + 12, y + tw * 0.75 + 42, 64, 18, fill=FILL3, stroke=None, r=4)
    order_bar(f, 0)
    f.add_note("Placeholder shapes while categories and products load, so nothing jumps. The order bar shows the empty-order state: greyed-out Review & pay.")
    return f


def menu_error():
    f = kiosk("03d", "Menu: couldn't load", "/", "apps/web/src/app/page.tsx (error branch)")
    f.rect(0, 0, W, H, fill=FILL4, stroke=None)
    f.text(W / 2, 250, "We couldn't load the menu", size=32, bold=True, anchor="middle")
    f.text(W / 2, 288, "Please try again, or ask our staff for help. (error message)", size=16, anchor="middle", fill=INK)
    f.btn(W / 2 - 90, 318, 180, 56, "Try again", kind="primary", r=28, size=18)
    f.add_note("Shown when the categories or products request fails. Try again reloads the page.")
    return f


def item_sheet():
    f = kiosk("04", "Item details sheet (popup)", "/  (popup over the menu)", K + "ProductModal.tsx, QtyStepper.tsx, NutritionGrid.tsx, lib/instructionChips.ts")
    menu_base(f)
    f.dim()
    x, y, w, h = 176, 24, 672, 552
    f.rect(x, y, w, h, fill=WHITE, stroke=INK2, r=24, sw=2)
    f.begin_clip(x, y, w, h - 80)
    f.img(x, y, w, 160, label="Photo or icon")
    f.text(x + 28, y + 206, "Dish name", size=30, bold=True)
    f.text(x + w - 28, y + 206, "₱000.00", size=24, bold=True, anchor="end")
    f.pill(x + 28, y + 220, "● In stock", size=12)
    f.pill(x + 122, y + 220, "Takes about 10 min", size=12)
    f.wrap(x + 28, y + 266, w - 56, "Product description text from the database.", size=15, fill=INK2)
    f.text(x + 28, y + 296, "Allergens", size=13, bold=True)
    f.pill(x + 28, y + 306, "Allergen", size=12)
    f.pill(x + 110, y + 306, "Allergen", size=12)
    f.text(x + 28, y + 358, "Special instructions", size=16, bold=True)
    cx, cy = x + 28, y + 370
    for i, chip in enumerate(CHIPS):
        cw = text_width(chip, 14, True) + 36
        if cx + cw > x + w - 28:
            cx, cy = x + 28, cy + 52
        f.btn(cx, cy, cw, 44, ("✓ " if i == 0 else "") + chip, kind="selected" if i == 0 else "secondary", r=22, size=14)
        cx += cw + 8
    f.textarea(x + 28, cy + 56, w - 56, 52, placeholder="Anything else for the kitchen? (optional)")
    f.end_clip()
    f.circle(x + w - 36, y + 36, 22, fill=WHITE, stroke=LINE)
    f.text(x + w - 36, y + 42, "×", size=20, anchor="middle")
    f.line(x, y + h - 80, x + w, y + h - 80, stroke=LINE)
    qty_stepper(f, x + 28, y + h - 64)
    f.btn(x + 188, y + h - 68, w - 216, 56, "Add to order · ₱000.00", kind="primary", r=28, size=17)
    f.add_note("The middle scrolls; the quantity stepper and Add to order stay fixed at the bottom. Below the note box (scrolled out of view here): the typed count “Sent to the kitchen display with your order · 11/140” and a collapsed “Ingredients & nutrition” section (ingredient tags and calories / protein / carbs / sugar).")
    f.add_note("Instruction chips depend on the category (Sizzling Plates shown); opposite chips (Extra spicy / Not spicy) turn each other off. Chips and note together are limited to 140 characters.")
    f.add_note("If the dish sells out while open: the pill reads “Currently unavailable”, instructions are hidden and the button reads “Unavailable” (disabled). Close: ×, a tap outside, or Esc.")
    return f


def drawer(f, lines):
    x = 640
    f.rect(x, 0, 384, H, fill=WHITE, stroke=INK2, sw=2)
    f.text(x + 20, 44, "Your order", size=24, bold=True)
    f.text(x + 20 + text_width("Your order", 24, True) + 8, 44, f"({sum(i % 2 + 1 for i in range(lines))} items)", size=15, fill=INK2)
    f.circle(x + 352, 36, 20, fill=WHITE, stroke=LINE)
    f.text(x + 352, 42, "×", size=20, anchor="middle")
    f.line(x, 66, W, 66, stroke=LINE)
    if lines == 0:
        f.img(x + 132, 150, 120, 80, r=8, label="Plate")
        f.text(x + 192, 268, "Your order is empty", size=22, bold=True, anchor="middle")
        f.text(x + 192, 294, "Tap + on any dish to add it.", size=15, anchor="middle", fill=INK2)
    for i in range(lines):
        y = 82 + i * 136
        f.img(x + 20, y, 56, 56, r=12)
        f.text(x + 88, y + 18, "Dish name", size=15, bold=True)
        f.text(x + 364, y + 18, "₱000.00", size=15, bold=True, anchor="end")
        if i == 0:
            f.text(x + 88, y + 40, "“Extra spicy, no onions”", size=13, fill=INK2, italic=True)
        qty_stepper(f, x + 88, y + 56, qty=str(i % 2 + 1))
        f.text(x + 364, y + 86, "Remove", size=15, bold=True, anchor="end")
        f.line(x + 20, y + 124, x + 364, y + 124, stroke=LINE)
    f.line(x, 500, W, 500, stroke=LINE)
    f.text(x + 20, 526, "Total", size=17, bold=True)
    f.text(x + 364, 528, "₱000.00" if lines else "₱0.00", size=22, bold=True, anchor="end")
    f.btn(x + 20, 538, 344, 52, "Review & pay", kind="primary" if lines else "disabled", r=26, size=17)


def order_review():
    f = kiosk("05", "Order review (side panel)", "/  (panel over the menu)", K + "CartDrawer.tsx")
    menu_base(f)
    f.dim()
    drawer(f, 3)
    f.add_note("Opened from the order bar. Change quantities with − / + (reaching 0 removes the line) or Remove; Review & pay goes to checkout (07). Closed with × or a tap on the dimmed menu.")
    return f


def order_review_empty():
    f = kiosk("05b", "Order review: empty", "/  (panel over the menu)", K + "CartDrawer.tsx")
    menu_base(f, lines=0)
    f.dim()
    drawer(f, 0)
    f.add_note("Reached by removing the last dish while the panel is open. Review & pay is disabled.")
    return f


def idle():
    f = kiosk("06", "“Still there?” idle popup", "/, /checkout, /checkout/success", K + "IdleTimeoutOverlay.tsx, apps/web/src/hooks/useIdleTimer.ts")
    menu_base(f)
    f.dim(0.6)
    f.rect(320, 170, 384, 250, fill=WHITE, stroke=INK2, r=18, sw=2)
    f.text(512, 228, "Still there?", size=30, bold=True, anchor="middle")
    f.wrap(352, 264, 330, "This kiosk will reset shortly to keep things moving for the next customer.", size=15, fill=INK2)
    f.btn(352, 336, 320, 56, "I'm still here", kind="primary", r=28, size=18)
    f.add_note("Appears after 60 seconds with no touch, key or mouse movement (not on the welcome screen). “I'm still here” restarts the timer.")
    f.add_note("With no answer for 20 more seconds the order is cleared and the kiosk goes back to the welcome screen (01).")
    return f


def checkout_page(f, estimate=True):
    f.rect(0, 0, W, H, fill=FILL2, stroke=None)
    f.rect(0, 0, W, 64, fill=FILL4, stroke=None)
    f.line(0, 64, W, 64, stroke=INK2, sw=2)
    f.btn(12, 8, 96, 48, "‹  Menu", kind="secondary", r=24, size=15)
    f.text(124, 41, "Review & pay", size=24, bold=True)
    f.img(976, 14, 36, 36, r=8)
    # left: the order
    f.rect(24, 80, 571, 318 if estimate else 262, fill=WHITE, stroke=LINE, r=16)
    f.text(44, 116, "Your order", size=24, bold=True)
    f.text(44 + text_width("Your order", 24, True) + 8, 116, "(4 items)", size=15, fill=INK2)
    f.text(575, 116, "Edit", size=15, bold=True, anchor="end")
    for i in range(3):
        y = 134 + i * 72
        f.line(44, y, 575, y, stroke=LINE)
        f.img(44, y + 12, 48, 48, r=12)
        f.text(104, y + 32, f"{i % 2 + 1} × Dish name", size=15, bold=True)
        f.text(575, y + 32, "₱000.00", size=15, bold=True, anchor="end")
        if i == 0:
            f.text(104, y + 52, "“Extra spicy”", size=13, italic=True, fill=INK2)
    if estimate:
        f.line(44, 352, 575, 352, stroke=LINE)
        f.wrap(44, 372, 520, "Estimated preparation time: about 15 min after payment (2 orders ahead in the kitchen)", size=14)
    # right: payment, place order
    x = 619
    py = 88
    f.text(x, py + 16, "How would you like to pay?", size=22, bold=True)
    methods = [("Pay at counter", "Cash or card with staff", True), ("GCash", "Not set up yet", False), ("Maya", "Not set up yet", False)]
    for i, (label, blurb, available) in enumerate(methods):
        bx, by = x + i * 128, py + 30
        if available:
            f.rect(bx, by, 120, 104, fill=WHITE, stroke=INK2, r=16, sw=2)
            f.circle(bx + 104, by + 16, 10, fill=DARK, stroke=DARK)
            f.text(bx + 104, by + 20, "✓", size=11, anchor="middle", fill=WHITE, bold=True)
        else:
            f.rect(bx, by, 120, 104, fill=FILL3, stroke=LINE, r=16, dash="4 3")
        f.icon(bx + 60, by + 28, 14, filled=True)
        f.text(bx + 60, by + 64, label, size=14, bold=True, anchor="middle", fill=INK if available else INK3)
        f.wrap(bx + 8, by + 84, 110, blurb, size=11, fill=INK2 if available else INK3)
    cy = py + 150
    f.rect(x, cy, 381, 124, fill=WHITE, stroke=LINE, r=16)
    f.text(x + 16, cy + 36, "Total", size=17, bold=True)
    f.text(x + 365, cy + 38, "₱000.00", size=28, bold=True, anchor="end")
    f.btn(x + 16, cy + 54, 349, 56, "Place order", kind="primary", r=28, size=18)


def checkout():
    f = kiosk("07", "Review & pay (checkout)", "/checkout", "apps/web/src/app/checkout/page.tsx")
    checkout_page(f)
    f.add_note("Left: the order with special instructions, Edit (back to the menu), and the estimated preparation time (only when POST /api/orders/estimate answers).")
    f.add_note("Right: payment method, total and Place order. Dine in / take out isn't asked here: it was chosen on 02 and goes with the order. Below 1024 px wide the right side drops under the order and Place order sits in a bar at the bottom.")
    f.add_note("GCash and Maya stay greyed out (“Not set up yet”) until online payment is set up (GET /api/payments/options). PARTIAL: online payment isn't set up in production, so only Pay at counter can be chosen there.")
    f.add_note("Place order sends the order; Pay at counter then shows the receipt (08). GCash or Maya would open PayMongo's payment page instead. An error (e.g. a dish sold out) appears as a toast message.")
    return f



def checkout_empty():
    f = kiosk("07b", "Review & pay: empty order", "/checkout", "apps/web/src/app/checkout/page.tsx (empty branch)")
    f.rect(0, 0, W, H, fill=FILL2, stroke=None)
    f.img(442, 150, 140, 112, r=8, label="Plate")
    f.text(W / 2, 306, "Your order is empty", size=30, bold=True, anchor="middle")
    f.text(W / 2, 336, "Add a few dishes from the menu first.", size=16, anchor="middle", fill=INK2)
    f.btn(W / 2 - 100, 360, 200, 56, "Back to menu", kind="primary", r=28, size=18)
    f.add_note("Shown when /checkout is opened with nothing in the order.")
    f.add_note("An order saved on the device without a dine-in / take-out choice (left from before it was asked) doesn't open checkout: the page sends it back to the kiosk home page (01 → 02) to choose, keeping the dishes.")
    return f


def receipt(f, paid):
    f.rect(0, 0, W, H, fill="#8a8a8a", stroke=None)
    x, y, w, h = 64, 100, 896, 400
    f.rect(x, y, w, h, fill=WHITE, stroke=INK2, r=28, sw=2)
    lx = x + 28
    f.text(lx, y + 56, "Payment received!" if paid else "Order placed", size=30, bold=True)
    f.text(lx, y + 84, "Your order has been sent to the kitchen." if paid else "Please pay at the counter to confirm your order.", size=15, fill=INK2)
    f.rect(lx, y + 102, 406, 150, fill=FILL4, stroke=None, r=22)
    f.text(lx + 18, y + 130, "Your order number", size=15)
    f.text(lx + 18, y + 184, "ZK-XXXXXX", size=46, bold=True)
    f.rect(lx + 18, y + 204, 112, 32, fill=FILL3, stroke=INK2, r=16)
    f.icon(lx + 38, y + 220, 7)
    f.text(lx + 52, y + 225, "Dine in", size=14, bold=True)
    f.img(lx + 300, y + 152, 96, 90, r=6)
    f.rect(lx, y + 268, 406, 84 if paid else 64, fill=FILL2, stroke=LINE, r=12)
    f.text(lx + 16, y + 292, "Estimated preparation time", size=13, fill=INK2)
    f.text(lx + 16, y + 318, "Ready at about 12:45 PM" if paid else "Ready about 15 min after you pay", size=18, bold=True)
    if paid:
        f.text(lx + 16, y + 340, "In about 15 min. We'll call your order number.", size=13, fill=INK2)
    rx, rw = x + 470, 398
    f.rect(rx, y + 28, rw, 220, fill=WHITE, stroke=LINE, r=12)
    for i in range(3):
        f.text(rx + 18, y + 62 + i * 28, f"{i % 2 + 1} × Dish name", size=15)
        f.text(rx + rw - 18, y + 62 + i * 28, "₱000.00", size=15, bold=True, anchor="end")
    f.line(rx + 18, y + 150, rx + rw - 18, y + 150, stroke=LINE)
    f.text(rx + 18, y + 178, "Total", size=17, bold=True)
    f.text(rx + rw - 18, y + 178, "₱000.00", size=20, bold=True, anchor="end")
    f.text(rx + 18, y + 204, "Payment method: GCash · Ref: (PayMongo reference)" if paid else "Payment method: Pay at counter", size=13, fill=INK2)
    f.btn(rx, y + h - 84, rw, 56, "Done", kind="primary", r=28, size=18)


def receipt_counter():
    f = kiosk("08", "Receipt: pay at counter", "/checkout  (after Place order)", K + "ReceiptModal.tsx, apps/web/src/app/checkout/page.tsx")
    receipt(f, paid=False)
    f.add_note("The order number is what the customer reads to the cashier (19). Dine in / Take out shows as the pill under the number.")
    f.add_note("If an online payment couldn't start (online payment not set up, or too many attempts), the order is shown the same way as a counter order, with a toast explaining it.")
    f.add_note("Done (or the idle reset) returns to the welcome screen (01). The order was already emptied when it was placed.")
    return f


def receipt_paid():
    f = kiosk("08b", "Receipt: paid online", "/checkout/success  (after PayMongo)", K + "ReceiptModal.tsx, apps/web/src/app/checkout/success/page.tsx")
    receipt(f, paid=True)
    f.add_note("PARTIAL: reached only after a GCash or Maya payment on PayMongo's page. The code comment says this path hasn't been tested against a live PayMongo sandbox, and production has no PayMongo keys yet.")
    f.add_note("A third wording exists for an order with no payment record: “We couldn't confirm payment yet — please check with staff.”")
    return f


def payment_return():
    f = kiosk("09", "Payment return: confirming", "/checkout/success?order=…", "apps/web/src/app/checkout/success/page.tsx")
    f.text(W / 2, 306, "Confirming your payment…", size=18, anchor="middle", fill=INK2)
    f.add_note("PayMongo sends the customer back here. The page asks for the receipt up to 5 times, 1.5 s apart, until the payment shows as paid, then shows the receipt (08b).")
    f.add_note("PARTIAL: depends on online payment, which isn't set up or live-tested yet.")
    return f


def payment_return_error():
    f = kiosk("09b", "Payment return: no order to show", "/checkout/success", "apps/web/src/app/checkout/success/page.tsx")
    f.rect(0, 0, W, H, fill=FILL2, stroke=None)
    f.text(W / 2, 280, "Could not load your order.", size=24, bold=True, anchor="middle")
    f.btn(W / 2 - 80, 304, 160, 48, "Back to menu", kind="primary", r=24, size=16)
    f.add_note("Shown when the receipt request fails. With no ?order= in the address the heading reads “No order to show”.")
    return f


SCREENS = [welcome, order_type, menu, menu_no_results, menu_loading, menu_error, item_sheet, order_review,
           order_review_empty, idle, checkout, checkout_empty, receipt_counter, receipt_paid,
           payment_return, payment_return_error]

SLUGS = {
    "01": "welcome", "02": "dine-in-take-out", "03": "menu", "03b": "menu-no-results", "03c": "menu-loading",
    "03d": "menu-load-error", "04": "item-details", "05": "order-review", "05b": "order-review-empty",
    "06": "idle-popup", "07": "checkout", "07b": "checkout-empty",
    "08": "receipt-counter", "08b": "receipt-paid", "09": "payment-return", "09b": "payment-return-error",
}
