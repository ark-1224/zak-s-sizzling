"""Process flows (swimlane activity diagrams). Every step and decision follows the code
named in each diagram's "Based on" line; numbers in brackets are wireframe numbers.
"""

from swimlane import Flow

W = "apps/web/src/"
API = "apps/api/src/modules/"


def login():
    f = Flow("staff-admin-login", "02", "Staff and admin sign-in and page access",
             ["Staff / Admin", "Web app (admin site)", "API server"],
             W + "proxy.ts, " + W + "components/StaffGuard.tsx, " + W + "components/admin/AdminRouteGuard.tsx, " + W + "app/login/page.tsx, "
             + W + "lib/auth.ts, " + API + "auth/routes.ts, " + API + "auth/service.ts, apps/api/src/middleware/rateLimit.ts, authorize.ts",
             notes=[
                 "Every API request is checked again on the server (authorize(\"admin\") or authorize(\"admin\", \"staff\")), so the page checks only decide what is shown.",
                 "The access token lasts 15 minutes and is renewed in the background with the 7-day refresh cookie. Each renewal re-reads the account, so a suspended or demoted user loses access at the next renewal. If renewal fails, the next request sends the user back to the login page.",
                 "Log out clears the saved token and the refresh cookie and opens the login page.",
             ])
    U, Wb, A = f.lanes
    f.n("start", U, 0, "start", "Open a back-office page (/admin, /staff, /kitchen, /login)")
    f.n("kiosk", Wb, 1, "decision", "Opened on the kiosk site?")
    f.n("404", U, 1, "end", "Sees “page not found”")
    f.n("saved", Wb, 2, "decision", "Signed-in Staff or Admin saved on this device?")
    f.n("loginpage", Wb, 3, "process", "Show the login page (10)")
    f.n("creds", U, 4, "io", "Enter email and password; press Sign in")
    f.n("rate", A, 5, "decision", "Too many failed attempts?")
    f.n("err", Wb, 6, "io", "Show the message, e.g. “Invalid email or password” (10b)")
    f.n("active", A, 6, "decision", "Active account with this email?")
    f.n("pw", A, 7, "decision", "Password matches?")
    f.n("token", A, 8, "process", "Issue a 15-minute access token and a 7-day refresh cookie")
    f.n("store", Wb, 9, "process", "Save the token and user on this device; open the dashboard (11)")
    f.n("adminonly", Wb, 10, "decision", "Admin-only page and the user is Staff?")
    f.n("redirect", Wb, 11, "process", "Send to the dashboard (11) instead")
    f.n("page", U, 11, "end", "Sees the page; the sidebar hides admin-only items for Staff")
    f.e("start", "kiosk")
    f.e("kiosk", "404", "Yes", exit="l", entry="r")
    f.e("kiosk", "saved", "No")
    f.e("saved", "loginpage", "No")
    f.e("saved", "adminonly", "Yes", exit="r")
    f.e("loginpage", "creds")
    f.e("creds", "rate")
    f.e("rate", "err", "Yes", exit="l")
    f.e("rate", "active", "No")
    f.e("active", "err", "No", exit="l", entry="r")
    f.e("active", "pw", "Yes")
    f.e("pw", "err", "No", exit="l", entry="b")
    f.e("pw", "token", "Yes")
    f.e("err", "creds", exit="l", entry="r")
    f.e("token", "store")
    f.e("store", "adminonly")
    f.e("adminonly", "redirect", "Yes")
    f.e("adminonly", "page", "No", exit="l")
    f.e("redirect", "page", exit="l", entry="r")
    return f


def ordering():
    f = Flow("customer-ordering", "03", "Customer ordering at the kiosk",
             ["Customer", "Kiosk (web app)", "API server"],
             W + "app/page.tsx, " + W + "components/kiosk/*.tsx, " + W + "hooks/useCart.tsx, " + W + "app/checkout/page.tsx, "
             + API + "orders/routes.ts, " + API + "orders/service.ts, " + API + "orders/prepTime.ts, " + API + "inventory/fulfillment.ts (assertStockForNewOrder)",
             notes=[
                 "Sold-out dishes stay on the menu but can't be opened or added; availability updates live while the customer browses (inventory:updated).",
                 "“Start over” in the top bar, or the idle reset (Flow 13), empties the order and returns to the welcome screen at any point. Dine in / take out is asked only once (02); changing it means starting over.",
                 "If checkout finds an order saved on the device without a dine-in / take-out choice, it sends the customer back to the kiosk home page to choose it (the dishes are kept).",
                 "Estimated preparation time = longest dish + 1 min for each extra serving + 2 min for each order already in the kitchen (orders/prepTime.ts). It is worked out again when the order reaches the kitchen.",
                 "GCash or Maya chosen while PayMongo isn't set up is saved as Pay at counter. Online payment is not set up in production.",
             ])
    C, K, A = f.lanes
    f.n("start", C, 0, "start", "Walks up to the kiosk, or opens it on a phone with the QR code")
    f.n("load", K, 1, "process", "Load categories and products; get an anonymous kiosk session")
    f.n("api_menu", A, 1, "process", "Return the menu; issue a kiosk session token")
    f.n("loaded", K, 2, "decision", "Menu loaded?")
    f.n("retry", C, 2, "io", "Sees “We couldn't load the menu” (03d); taps Try again")
    f.n("welcome", K, 3, "process", "Show the welcome screen (01)")
    f.n("tap", C, 4, "io", "Taps anywhere")
    f.n("choose", K, 5, "process", "Ask “Where will you eat today?” (02)")
    f.n("type", C, 6, "io", "Chooses Dine in or Take out")
    f.n("menu", K, 7, "process", "Save the choice on the device; show the menu (03)")
    f.n("browse", C, 8, "io", "Picks a category, searches, or picks a price range")
    f.n("how", C, 9, "decision", "Quick-add with + or open the dish?")
    f.n("sheet", C, 10, "io", "Sets quantity and special instructions; taps Add to order (04)")
    f.n("add", K, 10, "process", "Add the dish to the order (saved on this device); show “Added …”")
    f.n("more", C, 11, "decision", "Anything else to add?")
    f.n("review", C, 12, "io", "Taps Review & pay (can change quantities in the order review, 05)")
    f.n("checkout", K, 13, "process", "Open Review & pay (07); ask for the preparation-time estimate")
    f.n("estimate", A, 13, "process", "Estimate the preparation time from the dishes and the kitchen queue")
    f.n("shown", K, 14, "process", "Show the order, the estimate and the payment choices")
    f.n("place", C, 15, "io", "Chooses a payment method; taps Place order")
    f.n("send", K, 16, "process", "Send the order with dine in / take out (POST /api/orders)")
    f.n("rate", A, 17, "decision", "Too many orders from this kiosk?")
    f.n("avail", A, 18, "decision", "Every dish exists and is available?")
    f.n("enough", A, 19, "decision", "Enough stock for the whole order?")
    f.n("toast", C, 19, "io", "Sees the reason as a message (e.g. “… is currently unavailable”); nothing is ordered")
    f.n("create", A, 20, "process", "Create order ZK-XXXXXX (pending) with a pending payment, total and estimate")
    f.n("counter", K, 21, "decision", "Pay at counter?")
    f.n("receipt", K, 22, "process", "Empty the order; show the receipt with the order number (08)")
    f.n("pay4", C, 23, "sub", "Pays at the counter (Flow 04)")
    f.n("pay5", A, 22, "sub", "Pays online with GCash or Maya (Flow 05)", partial=True)
    f.e("start", "load")
    f.e("load", "api_menu", exit="r", entry="l")
    f.e("api_menu", "loaded")
    f.e("loaded", "retry", "No", exit="l", entry="r")
    f.e("retry", "load", exit="r", entry="l")
    f.e("loaded", "welcome", "Yes")
    f.e("welcome", "tap")
    f.e("tap", "choose")
    f.e("choose", "type")
    f.e("type", "menu")
    f.e("menu", "browse")
    f.e("browse", "how")
    f.e("how", "sheet", "Open")
    f.e("how", "add", "+", exit="r")
    f.e("sheet", "add", exit="r", entry="l")
    f.e("add", "more")
    f.e("more", "browse", "Yes", exit="l")
    f.e("more", "review", "No")
    f.e("review", "checkout")
    f.e("checkout", "estimate", exit="r", entry="l")
    f.e("estimate", "shown")
    f.e("shown", "place")
    f.e("place", "send")
    f.e("send", "rate", exit="r")
    f.e("rate", "toast", "Yes", exit="l")
    f.e("rate", "avail", "No")
    f.e("avail", "toast", "No", exit="l")
    f.e("avail", "enough", "Yes")
    f.e("enough", "toast", "No", exit="l", entry="r")
    f.e("enough", "create", "Yes")
    f.e("toast", "place", exit="l")
    f.e("create", "counter")
    f.e("counter", "receipt", "Yes")
    f.e("counter", "pay5", "No (GCash / Maya)", exit="r", partial=True)
    f.e("receipt", "pay4", exit="l")
    return f


def counter_payment():
    f = Flow("counter-payment", "04", "Counter payment, confirmation and cancelling",
             ["Customer", "Staff (cashier)", "API server"],
             W + "app/staff/orders/page.tsx, " + API + "payments/routes.ts, " + API + "payments/service.ts (confirmCounterPayment), "
             + API + "inventory/fulfillment.ts (deductStockForOrder), " + API + "orders/service.ts (listOrders, cancelOrder), " + API + "kitchen/service.ts",
             notes=[
                 "Staff confirm first and collect the money after: confirming checks and deducts the stock, so a shortage is found before any money changes hands. Marking paid, deducting and confirming happen in one database transaction; a shortage rolls all of it back.",
                 "PARTIAL: the message asks staff to change the order with the customer, but no screen edits an existing order (the API has endpoints to change or remove order items, unused by the web app). In practice the order is cancelled and placed again.",
                 "The list loads when the page opens and after each action; it does not refresh by itself when a new order arrives.",
             ])
    C, S, A = f.lanes
    f.n("start", C, 0, "start", "Brings the order number from the receipt (08) to the counter")
    f.n("open", S, 1, "process", "Open Orders awaiting payment (19)")
    f.n("list", A, 1, "process", "List unpaid, not-cancelled orders (and paid orders with a stock issue), newest first")
    f.n("find", S, 2, "io", "Find the order by its number")
    f.n("pays", S, 3, "decision", "Customer pays for this order?")
    f.n("confirm", S, 4, "process", "Press Confirm order (“Checking stock…”)")
    f.n("payable", A, 5, "decision", "Still unpaid and not cancelled?")
    f.n("msg1", S, 6, "io", "Show the server's message (already paid / cancelled)")
    f.n("txn", A, 6, "process", "In one transaction: mark paid (counter) and deduct each dish's stock (units, or raw materials by recipe)")
    f.n("end1", S, 7, "end", "End")
    f.n("enough", A, 7, "decision", "Enough stock for every dish?")
    f.n("short", S, 8, "io", "Nothing deducted, order stays unpaid: “… change the order before collecting payment”")
    f.n("ok", A, 8, "process", "Confirm the order; update dish availability on the kiosk (live)")
    f.n("change", S, 9, "process", "Change the order with the customer (no screen for it: cancel and order again)", partial=True)
    f.n("tasks", A, 9, "process", "Create one kitchen task per dish and the estimated ready time; notify the kitchen display")
    f.n("end2", S, 10, "end", "End")
    f.n("kitchen", A, 10, "sub", "Kitchen fulfilment (Flow 06)")
    f.n("done", S, 11, "io", "Show “ZK-… confirmed and sent to the kitchen. Collect ₱… Ready at about …”")
    f.n("collect", S, 12, "process", "Collect cash or card payment (outside the system)")
    f.n("wait", C, 13, "io", "Pays; waits for the order number to be called")
    f.n("end3", C, 14, "end", "End")
    f.n("cancel", S, 15, "process", "Press Cancel order, then “Yes, cancel order”")
    f.n("cancelok", A, 16, "decision", "Still pending and unpaid?")
    f.n("msg2", S, 17, "io", "Show “… already paid / already cancelled”")
    f.n("cancelled", A, 17, "process", "Mark the order cancelled; it leaves the queue (no stock was deducted)")
    f.n("end4", A, 18, "end", "End")
    f.e("start", "open")
    f.e("open", "list", exit="r", entry="l")
    f.e("list", "find")
    f.e("find", "pays")
    f.e("pays", "confirm", "Yes")
    f.e("pays", "cancel", "No (never came back)", exit="r")
    f.e("confirm", "payable", exit="r")
    f.e("payable", "msg1", "No", exit="l")
    f.e("payable", "txn", "Yes")
    f.e("msg1", "end1")
    f.e("txn", "enough")
    f.e("enough", "short", "No", exit="l", entry="r")
    f.e("enough", "ok", "Yes")
    f.e("short", "change")
    f.e("change", "end2")
    f.e("ok", "tasks")
    f.e("tasks", "kitchen")
    f.e("tasks", "done", exit="l")
    f.e("done", "collect")
    f.e("collect", "wait")
    f.e("wait", "end3")
    f.e("cancel", "cancelok", exit="r")
    f.e("cancelok", "msg2", "No", exit="l")
    f.e("cancelok", "cancelled", "Yes")
    f.e("cancelled", "end4")
    return f


from flows_more import bulk_import, barcode, idle, kitchen, online_payment, overview, products, qr, reports, stock, users  # noqa: E402

FLOWS_DEF = [overview, login, ordering, counter_payment, online_payment, kitchen, stock, products, bulk_import, users, barcode, reports, idle, qr]


def _render(make):
    return lambda: make().render()


FLOWS = [_render(m) for m in FLOWS_DEF]
