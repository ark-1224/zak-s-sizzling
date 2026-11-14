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
             + W + "lib/auth.ts, " + API + "auth/routes.ts, " + API + "auth/service.ts, " + API + "auth/loginCodes.ts, apps/api/src/lib/loginMail.ts, apps/api/src/middleware/rateLimit.ts, authorize.ts",
             notes=[
                 "The code works for 10 minutes and allows 5 wrong tries; Send a new code waits 60 seconds, at most 3 times per sign-in and 10 emails an hour per account. Only a hash of the code is stored, and it works once. If the email can't be sent, sign-in stops with “We couldn't send your sign-in code”.",
                 "Every API request is checked again on the server (authorize(\"admin\") or authorize(\"admin\", \"staff\")), so the page checks only decide what is shown.",
                 "The access token lasts 15 minutes and is renewed in the background with the refresh cookie, through the admin site's own address (which forwards to the API) so the browser sends the cookie back. Each renewal re-reads the account, so a suspended or demoted user loses access at the next renewal. After 6 hours with nobody using a staff screen, renewal stops and the screen goes back to the login page; the cookie also lasts only 6 hours after the last renewal.",
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
    f.n("codeson", A, 8, "decision", "Sign-in codes on? (LOGIN_CODES isn't off)")
    f.n("email", A, 9, "process", "Email a 6-digit code to the account (Brevo); keep only its hash")
    f.n("codepage", Wb, 10, "process", "Show the code step (10c) with where the code went")
    f.n("entercode", U, 11, "io", "Enter the code from the email (or Send a new code)")
    f.n("codeok", A, 12, "decision", "Right code, not expired, fewer than 5 wrong tries?")
    f.n("wrongcode", Wb, 13, "io", "Show “That code isn't right. N tries left”; back to 10 when it can't be used any more")
    f.n("token", A, 14, "process", "Issue a 15-minute access token and a 6-hour refresh cookie")
    f.n("store", Wb, 15, "process", "Save the token and user on this device; return to the page first opened, or the dashboard (11)")
    f.n("adminonly", Wb, 16, "decision", "Admin-only page and the user is Staff?")
    f.n("redirect", Wb, 17, "process", "Send to the dashboard (11) instead")
    f.n("page", U, 17, "end", "Sees the page; the sidebar hides admin-only items for Staff")
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
    f.e("pw", "codeson", "Yes")
    f.e("codeson", "email", "Yes")
    f.e("codeson", "token", "No", exit="r", entry="r")
    f.e("email", "codepage", exit="l", entry="r")
    f.e("codepage", "entercode", exit="l", entry="r")
    f.e("entercode", "codeok", exit="r", entry="l")
    f.e("codeok", "wrongcode", "No", exit="l", entry="r")
    f.e("wrongcode", "entercode", exit="l", entry="b")
    f.e("codeok", "token", "Yes")
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
                 "The print service is a small program on the kiosk's Raspberry Pi (POST http://127.0.0.1:4000/print, printing to the USB printer); it is not in this repository. Printing never blocks the order.",
                 "QR Ph chosen while PayMongo isn't set up is saved as Pay at counter. Online payment is not set up in production.",
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
    f.n("printer", K, 23, "decision", "In-store kiosk (opened once with ?printer=1)?")
    f.n("print", K, 24, "process", "Send the receipt to the print service on the Pi; it prints on the 58 mm printer")
    f.n("printed", K, 25, "io", "Show “Take your printed receipt below.”, or “We couldn't print your receipt …” if it failed")
    f.n("pay4", C, 26, "sub", "Pays at the counter (Flow 04)")
    f.n("pay5", A, 22, "sub", "Pays online with QR Ph (Flow 05)", partial=True)
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
    f.e("counter", "pay5", "No (QR Ph)", exit="r", partial=True)
    f.e("receipt", "printer")
    f.e("printer", "print", "Yes")
    f.e("printer", "pay4", "No (phone)", exit="l")
    f.e("print", "printed")
    f.e("printed", "pay4", exit="l", entry="r")
    return f


def counter_payment():
    f = Flow("counter-payment", "04", "Counter point of sale: taking payment and walk-in orders",
             ["Customer", "Staff (cashier)", "API server"],
             W + "app/staff/orders/page.tsx, " + W + "components/staff/PosNewOrder.tsx, " + W + "components/staff/PaymentPanel.tsx, " + W + "components/staff/CounterReceipt.tsx, "
             + API + "orders/routes.ts, " + API + "payments/service.ts (confirmCounterPayment), " + API + "inventory/fulfillment.ts (deductStockForOrder), " + API + "orders/service.ts (listOrders, cancelOrder)",
             notes=[
                 "Taking payment checks and deducts the stock before the money is kept: marking paid, deducting each dish's raw materials (or a ready-made item's pieces) and confirming happen in one database transaction; a shortage rolls all of it back.",
                 "Cash records the cash received, for the change on the receipt. GCash and Maya are paid to the shop's own account and recorded with the reference number from the customer's phone (no PayMongo); a reference number can be recorded once.",
                 "PARTIAL: the message asks staff to change the order with the customer, but no screen edits an existing order (the API has endpoints to change or remove order items, unused by the web app). In practice the order is cancelled and placed again.",
                 "The Queue reloads by itself when an order is placed, paid, edited or cancelled (orders:changed). A paid order that has to be cancelled later is Flow 11.",
             ])
    C, S, A = f.lanes
    f.n("start", C, 0, "start", "Comes to the counter, with an order number from the kiosk (08) or to order")
    f.n("kiosk", S, 1, "decision", "Ordered at the kiosk?")
    f.n("pick", S, 2, "io", "New order (19e): add dishes with their instructions, dine in or take out; press Charge")
    f.n("place", A, 3, "process", "Check stock; save a counter order (source counter, pending)")
    f.n("placed", A, 4, "decision", "Every dish available?")
    f.n("placemsg", S, 4, "io", "Show which dish ran out; the menu reloads")
    f.n("find", S, 5, "io", "Queue (19): find the order by its number; press Take payment")
    f.n("panel", S, 6, "io", "Payment step (19c): Cash with the cash received (change shown), or GCash / Maya with the reference number")
    f.n("pays", C, 7, "decision", "Pays now?")
    f.n("confirm", S, 8, "process", "Press Confirm … payment (“Checking stock…”)")
    f.n("later", C, 9, "end", "Not now: the order waits in the Queue, unpaid")
    f.n("valid", A, 9, "decision", "Unpaid, not cancelled, cash covers the total, reference not used before?")
    f.n("msg1", S, 10, "io", "Show the server's message")
    f.n("txn", A, 10, "process", "In one transaction: mark paid (cash, GCash or Maya); deduct each dish's raw materials, or a ready-made item's pieces")
    f.n("end1", S, 11, "end", "End")
    f.n("enough", A, 11, "decision", "Enough stock for every dish?")
    f.n("short", S, 12, "io", "Nothing deducted, order stays unpaid: hand the money back and change the order")
    f.n("ok", A, 12, "process", "Confirm the order; create one kitchen task per dish and the ready time; update the kiosk menu live")
    f.n("change", S, 13, "process", "Change the order with the customer (no screen for it: cancel and order again)", partial=True)
    f.n("kitchen", A, 13, "sub", "Kitchen fulfilment (Flow 06)")
    f.n("receipt", S, 14, "io", "Receipt (19d): items, total, how it was paid, change; Print receipt on the counter printer")
    f.n("wait", C, 15, "io", "Takes the receipt; watches the screen at the counter for the order number (24)")
    f.n("end3", C, 16, "end", "End")
    f.n("never", S, 17, "start", "An order in the Queue is never paid for")
    f.n("cancel", S, 18, "process", "Press Cancel order, then “Yes, cancel order”")
    f.n("cancelok", A, 19, "decision", "Still pending and unpaid?")
    f.n("msg2", S, 20, "io", "Show “… already paid / already cancelled”")
    f.n("cancelled", A, 20, "process", "Mark the order cancelled; it leaves the Queue (no stock was deducted)")
    f.n("end2", S, 21, "end", "End")
    f.n("end4", A, 21, "end", "End")
    f.e("start", "kiosk")
    f.e("kiosk", "pick", "No (walk-in)")
    f.e("kiosk", "find", "Yes", exit="l", entry="l")
    f.e("pick", "place", exit="r", entry="l")
    f.e("place", "placed")
    f.e("placed", "placemsg", "No", exit="l", entry="r")
    f.e("placemsg", "pick", exit="l", entry="l")
    f.e("placed", "panel", "Yes", exit="b", entry="r")
    f.e("find", "panel")
    f.e("panel", "pays", exit="l", entry="t")
    f.e("pays", "confirm", "Yes", exit="r", entry="l")
    f.e("pays", "later", "No")
    f.e("confirm", "valid", exit="r")
    f.e("valid", "msg1", "No", exit="l", entry="r")
    f.e("valid", "txn", "Yes")
    f.e("msg1", "end1")
    f.e("txn", "enough")
    f.e("enough", "short", "No", exit="l", entry="r")
    f.e("enough", "ok", "Yes")
    f.e("short", "change")
    f.e("ok", "kitchen")
    f.e("kitchen", "receipt", exit="b", entry="r")
    f.e("receipt", "wait", exit="l", entry="t")
    f.e("wait", "end3")
    f.e("never", "cancel")
    f.e("cancel", "cancelok", exit="r")
    f.e("cancelok", "msg2", "No", exit="l")
    f.e("cancelok", "cancelled", "Yes")
    f.e("cancelled", "end4")
    f.e("msg2", "end2")
    return f


from flows_more import bulk_import, cancel_paid, idle, kitchen, online_payment, overview, products, qr, raw_materials, reports, stock, users  # noqa: E402

FLOWS_DEF = [overview, login, ordering, counter_payment, online_payment, kitchen, stock, products, bulk_import, users, cancel_paid, reports, idle, qr, raw_materials]


def _render(make):
    return lambda: make().render()


FLOWS = [_render(m) for m in FLOWS_DEF]
