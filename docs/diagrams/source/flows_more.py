"""Process flows 01 and 05-14 (see flows.py for 02-04 and the conventions)."""

from swimlane import Flow

W = "apps/web/src/"
API = "apps/api/src/modules/"


def overview():
    f = Flow("system-overview", "01", "System overview",
             ["Customer", "Staff", "System (API server + database)", "Worker (scheduled jobs)", "Admin"],
             "apps/web/src/app/**, apps/api/src/modules/**, apps/worker/src/index.ts and jobs/* (each double-edged box points to its detailed flow)",
             notes=[
                 "Each double-edged box is drawn step by step in the flow it names.",
                 "An Admin can also do everything in the Staff lane (role checks in apps/api/src/middleware/authorize.ts).",
                 "The worker also runs on its own clock: every hour it logs the items at or below their minimum, and every night at 2:00 AM (Manila) it backs up the database to cloud storage. Low-stock emails run only when email is set up, and the backup only when cloud storage is set up (apps/worker/src/index.ts).",
             ])
    C, S, Y, X, Ad = f.lanes
    f.n("c0", C, 0, "start", "Arrives at the kiosk, or scans the QR code with a phone")
    f.n("c1", C, 1, "sub", "Orders at the kiosk (Flow 03)")
    f.n("y1", Y, 1, "process", "Check stock; save the order (pending) with an estimated preparation time")
    f.n("y2", Y, 2, "decision", "Pay at the counter or online?")
    f.n("s3", S, 3, "sub", "Confirm the order, then collect payment (Flow 04)")
    f.n("y3", Y, 3, "sub", "Online payment with QR Ph (Flow 05)", partial=True)
    f.n("y4", Y, 4, "process", "Mark paid; deduct stock; create kitchen tasks; update the kiosk menu live")
    f.n("x4", X, 4, "process", "Every minute: email waiting low-stock alerts")
    f.n("s5", S, 5, "sub", "Prepare the dishes on the kitchen display (Flow 06)")
    f.n("x5", X, 5, "end", "End")
    f.n("c6", C, 6, "end", "Collects the order when its number shows under Ready for pickup")
    f.n("s7", S, 7, "start", "Staff signs in (Flow 02)")
    f.n("a7", Ad, 7, "start", "Admin signs in (Flow 02)")
    f.n("s8", S, 8, "sub", "Adjust stock; look up barcodes (Flows 07, 11)")
    f.n("y8", Y, 8, "process", "Save the change; update the kiosk menu live; queue low-stock alerts")
    f.n("a8", Ad, 8, "sub", "Products, bulk import, users, kiosk QR code (Flows 08, 09, 10, 14)")
    f.n("y9", Y, 9, "end", "End")
    f.n("a9", Ad, 9, "sub", "Reports and exports from paid orders (Flow 12)")
    f.n("a10", Ad, 10, "end", "End")
    f.e("c0", "c1")
    f.e("c1", "y1", exit="r", entry="l")
    f.e("y1", "y2")
    f.e("y2", "s3", "Counter", exit="l")
    f.e("y2", "y3", "Online")
    f.e("s3", "y4")
    f.e("y3", "y4")
    f.e("y4", "x4", "alert", exit="r", entry="l")
    f.e("x4", "x5")
    f.e("y4", "s5")
    f.e("s5", "c6")
    f.e("s7", "s8")
    f.e("a7", "a8")
    f.e("s8", "y8", exit="r", entry="l")
    f.e("a8", "y8", exit="l", entry="r")
    f.e("y8", "y9")
    f.e("a7", "a9", exit="r", side="r")
    f.e("a9", "a10")
    return f


def online_payment():
    f = Flow("online-payment", "05", "Online payment with QR Ph shown on the kiosk (partial)",
             ["Customer", "Kiosk (web app)", "API server", "PayMongo"],
             W + "app/checkout/page.tsx, " + W + "components/kiosk/QrPaymentScreen.tsx, " + API + "payments/routes.ts, " + API
             + "payments/service.ts (createQrPhPayment, checkQrPhPayment, switchToCounterPayment, handleWebhook), apps/api/src/lib/paymongo.ts",
             notes=[
                 "PARTIAL: coded and covered by automated tests with PayMongo simulated, but not yet run with PayMongo keys; production has none yet, so the order takes the “not set up” branch.",
                 "The payment is recorded by whichever comes first, the kiosk's status check or PayMongo's payment.paid webhook; the other then changes nothing. Recording marks it paid, deducts stock and confirms the order in one transaction; if stock ran out or the order was cancelled meanwhile, the payment is recorded, nothing goes to the kitchen and the order is flagged NEEDS ATTENTION for staff, as is a payment of the wrong amount or a second payment.",
                 "A succeeded intent is accepted only for the order's exact total. The idle reset is paused while the code can still be scanned and resumes when it expires.",
                 "In PayMongo test mode the screen offers a link to simulate the payment; test QR codes must not be scanned with a real banking app.",
             ])
    C, K, A, P = f.lanes
    f.n("start", K, 0, "start", "Order placed with QR Ph (Flow 03)")
    f.n("intent", K, 1, "process", "Ask for a QR code (POST /api/payments/intent)")
    f.n("rate", A, 2, "decision", "Too many payment attempts from this kiosk?")
    f.n("payable", A, 3, "decision", "This kiosk's order, unpaid and not cancelled?")
    f.n("err", K, 3, "io", "Show the error as a message; the order stays unpaid")
    f.n("end0", C, 3, "end", "End")
    f.n("setup", A, 4, "decision", "PayMongo set up, and the code created?")
    f.n("fallback", K, 4, "io", "Show the receipt as a Pay-at-counter order, with a message (08)")
    f.n("create", A, 5, "process", "Create a QR Ph payment intent (order in metadata) and a 10-minute QR Ph method; attach; store the intent", partial=True)
    f.n("qrimg", P, 5, "process", "Return the QR Ph code image", partial=True)
    f.n("flow4", K, 5, "sub", "Pays at the counter (Flow 04)")
    f.n("show", K, 6, "io", "Show “Scan to pay”: QR code, amount, countdown (07c)")
    f.n("choose", C, 7, "decision", "Scan now, or pay at the counter?")
    f.n("poll", K, 7, "process", "Every 3 s: ask about the payment (GET /api/payments/qrph/:orderId)")
    f.n("pays", C, 8, "io", "Scans the code with a bank or e-wallet app and pays", partial=True)
    f.n("check", A, 8, "decision", "Already paid, or PayMongo says the intent succeeded for the full total?")
    f.n("counter", C, 9, "io", "Taps “Pay at the counter instead”")
    f.n("expired", K, 9, "decision", "Code expired?")
    f.n("paid", P, 9, "process", "Takes the payment; the intent succeeds; sends the payment.paid webhook", partial=True)
    f.n("flow4b", C, 10, "sub", "The order becomes a counter order; pays at the counter (Flow 04)")
    f.n("expmsg", K, 10, "io", "Show “This code has expired” with Get a new code (07d)")
    f.n("hook", A, 10, "decision", "Webhook: signature valid and order found?")
    f.n("record", A, 11, "process", "Record the payment: mark paid, deduct stock, confirm, send to the kitchen (or flag NEEDS ATTENTION)")
    f.n("end2", P, 11, "end", "End (webhook ignored)")
    f.n("receipt", K, 12, "io", "Show “Payment received!” (08b); print the receipt on the in-store kiosk")
    f.n("end1", K, 13, "end", "End")
    f.e("start", "intent")
    f.e("intent", "rate", exit="r")
    f.e("rate", "fallback", "Yes", exit="l")
    f.e("rate", "payable", "No")
    f.e("payable", "err", "No", exit="l", entry="r")
    f.e("err", "end0", exit="l", entry="r")
    f.e("payable", "setup", "Yes")
    f.e("setup", "fallback", "No", exit="l", entry="r")
    f.e("fallback", "flow4")
    f.e("setup", "create", "Yes")
    f.e("create", "qrimg", exit="r", entry="l")
    f.e("qrimg", "show", exit="b")
    f.e("show", "poll")
    f.e("show", "choose", exit="l")
    f.e("choose", "pays", "Scan")
    f.e("choose", "counter", "Counter", exit="l")
    f.e("counter", "flow4b")
    f.e("pays", "paid", exit="r")
    f.e("poll", "check", exit="r")
    f.e("check", "expired", "No", exit="l", entry="r")
    f.e("check", "record", "Yes", exit="r", entry="r")
    f.e("expired", "poll", "No", exit="l", entry="l")
    f.e("expired", "expmsg", "Yes")
    f.e("expmsg", "intent", exit="l", entry="l")
    f.e("paid", "hook", "webhook", exit="b")
    f.e("hook", "record", "Yes")
    f.e("hook", "end2", "No", exit="r")
    f.e("record", "receipt", exit="b")
    f.e("receipt", "end1")
    return f


def kitchen():
    f = Flow("kitchen-fulfilment", "06", "Kitchen fulfilment",
             ["Kitchen staff", "Kitchen display (web app)", "API server"],
             W + "app/kitchen/page.tsx, " + W + "app/board/page.tsx, " + W + "lib/receiptPrinter.ts, print-service/server.js, " + API + "kitchen/routes.ts, " + API + "kitchen/service.ts, " + API + "orders/prepTime.ts (setEstimateOnReachingKitchen)",
             notes=[
                 "The order's status follows its dishes (confirmed → preparing → ready), and Handed over completes it. The counter's status board (24) is the customer's ready notice; a QR customer's phone receipt doesn't update by itself (a limitation).",
                 "Any signed-in Staff or Admin can use the kitchen display. A dish only moves forward: Pending → In Progress → Completed.",
                 "Kitchen tickets print only on the device with the kitchen printer (print-service/), once per order; if printing fails the display says so and tries again with the next update or within 30 seconds.",
             ])
    S, K, A = f.lanes
    f.n("start", A, 0, "start", "Order is paid (Flow 04 or 05)")
    f.n("tasks", A, 1, "process", "Create one task per dish (Pending); set the estimated ready time once")
    f.n("notify", A, 2, "process", "Send “order:created” to every open kitchen display")
    f.n("reload", K, 3, "process", "Reload the queue: unfinished dishes only, grouped by order, oldest first")
    f.n("cards", K, 4, "io", "Show the order cards: number, DINE IN / TAKE OUT, ready-by time, dishes (18)")
    f.n("printer", K, 5, "decision", "Kitchen printer here, ticket not printed yet?")
    f.n("ticket", K, 6, "process", "Send the ticket to the print service: order number and dishes; it prints on the kitchen printer")
    f.n("which", S, 7, "decision", "Next dish: Pending or In Progress?")
    f.n("startp", S, 8, "process", "Press Start preparing")
    f.n("inprog", A, 8, "process", "Set In Progress and the start time; the order becomes preparing; send “kitchen:task_updated”")
    f.n("reload2", K, 9, "process", "Reload the queue; the dish shows In Progress")
    f.n("donep", S, 10, "process", "Cook the dish; press Mark done")
    f.n("complete", A, 10, "process", "Set Completed and the finish time; send “kitchen:task_updated”")
    f.n("reload3", K, 11, "process", "Reload the queue; the finished dish drops off its card")
    f.n("left", K, 12, "decision", "Any dish of this order left?")
    f.n("readycard", K, 13, "io", "The order is ready: its card shows first as “READY · waiting for pickup”; the board moves it to Ready for pickup (24)")
    f.n("hand", S, 14, "process", "Hand the food to the customer; press Handed over")
    f.n("completed", A, 15, "process", "Set the order completed; send “orders:changed”")
    f.n("gone", K, 16, "process", "The card leaves the display and the number leaves the board")
    f.n("end", S, 17, "end", "End")
    f.e("start", "tasks")
    f.e("tasks", "notify")
    f.e("notify", "reload")
    f.e("reload", "cards")
    f.e("cards", "printer")
    f.e("printer", "ticket", "Yes")
    f.e("printer", "which", "No", exit="l", entry="r")
    f.e("ticket", "which", exit="b", entry="t")
    f.e("which", "startp", "Pending")
    f.e("which", "donep", "In Progress", exit="l")
    f.e("startp", "inprog", exit="r", entry="l")
    f.e("inprog", "reload2")
    f.e("reload2", "donep")
    f.e("donep", "complete", exit="r", entry="l")
    f.e("complete", "reload3")
    f.e("reload3", "left")
    f.e("left", "which", "Yes", exit="l", entry="r")
    f.e("left", "readycard", "No")
    f.e("readycard", "hand", exit="l", entry="t")
    f.e("hand", "completed", exit="b", entry="l")
    f.e("completed", "gone", exit="b", entry="r")
    f.e("gone", "end", exit="b", entry="r")
    return f


def stock():
    f = Flow("stock-management", "07", "Stock adjustments, live sold-out and low-stock alerts",
             ["Staff / Admin", "Web app", "API server + database", "Worker (scheduled jobs)"],
             W + "components/admin/AdjustStockModal.tsx, " + W + "components/admin/RawMaterialAdjustModal.tsx, " + API + "inventory/service.ts, "
             + API + "raw-materials/service.ts, " + API + "inventory/fulfillment.ts, apps/api/prisma/migrations/*low_stock_alerts*, "
             "apps/worker/src/index.ts, apps/worker/src/jobs/sendLowStockAlerts.ts, lowStockSweep.ts",
             notes=[
                 "Reasons: Restock / delivery received, Customer return, Damaged goods, Spoilage, Manual correction (recount), Other. Damaged goods and Spoilage can only lower stock, in the form and again on the server.",
                 "A recipe dish has no count of its own: its stock is the servings its raw materials can make, so it changes through its raw materials.",
                 "Separately, every hour the worker writes the items at or below their minimum to its log (lowStockSweep).",
             ])
    S, Wb, A, X = f.lanes
    f.n("start", S, 0, "start", "Stock changes: delivery, recount, spoilage, damage or a return")
    f.n("paid", A, 0, "sub", "A paid order deducts its stock automatically (Flows 04, 05)")
    f.n("open", S, 1, "process", "Press Adjust on Inventory (13), Barcode lookup (15) or Raw materials (14)")
    f.n("enter", S, 2, "io", "Enter the amount (add / remove / set exact), a reason and an optional note (13b, 14b)")
    f.n("check", Wb, 3, "decision", "Changes the stock, reason chosen, result 0 or more, direction allowed?")
    f.n("send", Wb, 4, "process", "Send the change (PATCH /api/inventory/:id or /api/raw-materials/:id/stock)")
    f.n("valid", A, 5, "decision", "Accepted? (reason given, not a recipe dish, enough stock to remove)")
    f.n("msg", Wb, 6, "io", "Show the server's message")
    f.n("save", A, 6, "process", "Update the stock in one statement; log who changed it, by how much and why")
    f.n("avail", A, 7, "process", "Recalculate sold-out for the product, or every dish using the raw material")
    f.n("live", A, 8, "process", "Send “inventory:updated”: the kiosk menu and the stock pages refresh")
    f.n("crossed", A, 9, "decision", "Did the item just reach its minimum? (database trigger)")
    f.n("end0", Wb, 9, "end", "End")
    f.n("queue", A, 10, "process", "Queue one low-stock alert (not again until restocked above the minimum)")
    f.n("email", X, 11, "decision", "Email set up? (Brevo, Resend or SMTP)")
    f.n("wait", A, 11, "process", "The alert waits in the database")
    f.n("send_mail", X, 12, "process", "Every minute: email the waiting alerts")
    f.n("end2", A, 12, "end", "End")
    f.n("end1", X, 13, "end", "End")
    f.e("start", "open")
    f.e("open", "enter")
    f.e("enter", "check")
    f.e("check", "enter", "No (Save stays off)", exit="l", entry="r")
    f.e("check", "send", "Yes")
    f.e("send", "valid", exit="r")
    f.e("valid", "msg", "No", exit="l")
    f.e("valid", "save", "Yes")
    f.e("msg", "enter", exit="l", entry="r")
    f.e("paid", "avail", exit="r", side="r")
    f.e("save", "avail")
    f.e("avail", "live")
    f.e("live", "crossed")
    f.e("crossed", "end0", "No", exit="l", entry="r")
    f.e("crossed", "queue", "Yes")
    f.e("queue", "email", exit="r")
    f.e("email", "wait", "No", exit="l", entry="r")
    f.e("email", "send_mail", "Yes")
    f.e("send_mail", "end1")
    f.e("wait", "end2")
    return f


def products():
    f = Flow("product-management", "08", "Adding, editing and deleting products (Admin)",
             ["Admin", "Web app", "API server"],
             W + "app/admin/products/page.tsx, " + W + "components/admin/ProductForm.tsx, " + W + "components/admin/ProductDetailsFields.tsx, " + W + "lib/imageResize.ts, "
             + API + "products/routes.ts, " + API + "products/service.ts, " + API + "products/image.ts, " + API + "nutrition/routes.ts",
             notes=[
                 "Form checks (web), each shown under its field: name required; price ₱0.00 or more; cost blank or ₱0.00 or more; preparation time whole minutes 0–120; stock and minimum whole numbers, or a recipe with at least one complete row.",
                 "Only an Admin can open Products; the API refuses product changes from Staff (authorize(\"admin\")).",
                 "Cancel in the form or the delete dialog closes it without changes. The form also sets ingredients, allergens (a checklist, with suggestions from the ingredients) and nutrition per serving, typed, looked up in USDA FoodData Central, or calculated from the recipe (12b, 12c, 14d).",
             ])
    Ad, Wb, A = f.lanes
    f.n("start", Ad, 0, "start", "Open Products (12)")
    f.n("what", Ad, 1, "decision", "Add or edit, or delete?")
    f.n("fill", Ad, 2, "io", "Fill in the product form, with ingredients, allergens and nutrition, and press Save (12b, 12c)")
    f.n("check", Wb, 3, "decision", "Every field valid?")
    f.n("send", Wb, 4, "process", "Save (POST /api/products or PUT /api/products/:id)")
    f.n("valid", A, 5, "decision", "Category and raw materials exist; barcode not used by another product?")
    f.n("msg", Wb, 6, "io", "Show the message (a barcode clash appears under Barcode)")
    f.n("save", A, 6, "process", "Save the product with its stock record or recipe; update the sold-out state")
    f.n("photo", Wb, 7, "decision", "Photo added or removed?")
    f.n("upload", Wb, 8, "process", "Upload the photo, made smaller in the browser, or delete it")
    f.n("photook", A, 9, "decision", "Photo saved?")
    f.n("photomsg", Wb, 9, "io", "Keep the form open: “… was saved, but the photo wasn't …”")
    f.n("done", Wb, 10, "process", "Close the form; show “… added / saved”; reload the list")
    f.n("end1", Ad, 11, "end", "End")
    f.n("delete", Ad, 12, "io", "Press Delete; confirm “Yes, delete” (12d)")
    f.n("orders", A, 13, "decision", "Product already ordered before?")
    f.n("refused", Wb, 13, "io", "Show “… has existing orders and can't be deleted — mark it unavailable instead.”")
    f.n("end2", Ad, 13, "end", "End")
    f.n("remove", A, 14, "process", "Delete the product")
    f.n("deleted", Wb, 15, "io", "Show “… deleted”; reload the list")
    f.n("end3", Ad, 16, "end", "End")
    f.e("start", "what")
    f.e("what", "fill", "Add / edit")
    f.e("what", "delete", "Delete", exit="r", side="r")
    f.e("fill", "check")
    f.e("check", "fill", "No", exit="l", entry="r")
    f.e("check", "send", "Yes")
    f.e("send", "valid", exit="r")
    f.e("valid", "msg", "No", exit="l", entry="r")
    f.e("msg", "fill", exit="l", entry="r")
    f.e("valid", "save", "Yes")
    f.e("save", "photo")
    f.e("photo", "upload", "Yes")
    f.e("photo", "done", "No", exit="r")
    f.e("upload", "photook", exit="r")
    f.e("photook", "photomsg", "No", exit="l", entry="r")
    f.e("photomsg", "fill", exit="l", entry="r")
    f.e("photook", "done", "Yes")
    f.e("done", "end1")
    f.e("delete", "orders", exit="r")
    f.e("orders", "refused", "Yes", exit="l", entry="r")
    f.e("refused", "end2", exit="l", entry="r")
    f.e("orders", "remove", "No")
    f.e("remove", "deleted")
    f.e("deleted", "end3")
    return f


def bulk_import():
    f = Flow("bulk-import", "09", "Bulk product import from CSV or Excel (Admin)",
             ["Admin", "Web app", "API server"],
             W + "app/admin/import/page.tsx, " + API + "products/routes.ts, " + API + "products/bulkImport.ts, " + API + "products/xlsxImport.ts",
             notes=[
                 "Row checks: name required (150 characters at most), category must match an existing one, price required and 0 or more, cost 0 or more if given, stock and minimum whole numbers of 0 or more, barcode 64 characters at most.",
                 "Rows are imported one by one, not all-or-nothing: a row that fails at import time is listed as an error while the others are saved.",
                 "The template can be downloaded as .xlsx (with a category list) or .csv.",
             ])
    Ad, Wb, A = f.lanes
    f.n("start", Ad, 0, "start", "Open Bulk import (16)")
    f.n("load", Ad, 1, "io", "Choose or drop a .csv or .xlsx file, or paste CSV into the box")
    f.n("bad", Wb, 2, "decision", "An old .xls, or an .xlsx over 2 MB?")
    f.n("xlsx", Wb, 3, "decision", "Excel file (.xlsx)?")
    f.n("convert", A, 4, "process", "Read the first sheet that has rows; turn it into CSV; list columns left out")
    f.n("box", Wb, 5, "process", "Put the CSV in the box (rows can be edited there)")
    f.n("dry", Wb, 6, "process", "Half a second after any change: check every row without saving")
    f.n("check", A, 6, "process", "Check each row; a matching barcode means update, otherwise create")
    f.n("preview", Wb, 7, "io", "Show the preview: NEW / UPDATE / ERROR per row (16)")
    f.n("errors", Wb, 8, "decision", "Any row with an error?")
    f.n("fix", Ad, 8, "io", "Fix the rows in the box or in the file")
    f.n("press", Ad, 9, "io", "Press Import N rows")
    f.n("send", Wb, 10, "process", "Send the rows (POST /api/products/bulk-import)")
    f.n("import", A, 10, "process", "Import each row: update the product with that barcode, or create one")
    f.n("result", Wb, 11, "io", "Show the result: created, updated, errors; the button reads Imported (16b)")
    f.n("end", Ad, 12, "end", "End")
    f.e("start", "load")
    f.e("load", "bad")
    f.e("bad", "load", "Yes (message)", exit="l", entry="r")
    f.e("bad", "xlsx", "No")
    f.e("xlsx", "convert", "Yes", exit="r")
    f.e("xlsx", "box", "No")
    f.e("convert", "box")
    f.e("box", "dry")
    f.e("dry", "check", exit="r", entry="l")
    f.e("check", "preview")
    f.e("preview", "errors")
    f.e("errors", "fix", "Yes", exit="l", entry="r")
    f.e("fix", "dry", exit="l")
    f.e("errors", "press", "No")
    f.e("press", "send")
    f.e("send", "import", exit="r", entry="l")
    f.e("import", "result")
    f.e("result", "end")
    return f


def users():
    f = Flow("user-management", "10", "Managing user accounts (Admin)",
             ["Admin", "Web app", "API server"],
             W + "app/admin/users/page.tsx, " + W + "components/admin/ConfirmDialog.tsx, " + API + "users/routes.ts, " + API + "users/schema.ts, "
             + API + "users/service.ts, " + API + "auth/service.ts (refreshAccessToken)",
             notes=[
                 "The browser checks the invite form first (required fields, email format, password at least 8 characters) and shows its own message; the API checks the same rules again.",
                 "No email is sent when an account is created; the Admin gives the temporary password to the person.",
                 "Pressing Cancel in the confirmation popup changes nothing. Only an Admin can open this page or call these API routes.",
             ])
    Ad, Wb, A = f.lanes
    f.n("start", Ad, 0, "start", "Open Users & roles (20)")
    f.n("what", Ad, 1, "decision", "Invite a user, or change an account?")
    f.n("fill", Ad, 2, "io", "Enter name, email, temporary password and role; press Create account (20b)")
    f.n("check", Wb, 3, "decision", "All filled in, valid email, password at least 8 characters?")
    f.n("send", Wb, 4, "process", "Send (POST /api/users)")
    f.n("valid", A, 5, "decision", "Valid, and no account with this email yet?")
    f.n("msg", Wb, 6, "io", "Show the message in the popup")
    f.n("create", A, 6, "process", "Create the account (password hashed; role Staff or Admin)")
    f.n("created", Wb, 7, "io", "Show “Account created for … (Staff / Administrator)”")
    f.n("end1", Ad, 8, "end", "End")
    f.n("pick", Ad, 10, "io", "Pick a new role, or press Suspend / Reactivate on an account")
    f.n("own", Wb, 11, "decision", "Own account?")
    f.n("disabled", Ad, 11, "end", "Controls are disabled; nothing changes")
    f.n("react", Wb, 12, "decision", "Reactivate?")
    f.n("confirm", Ad, 13, "io", "Confirm in the popup (20c)")
    f.n("patch", Wb, 14, "process", "Send (PATCH /api/users/:id)")
    f.n("self", A, 15, "decision", "Demoting or suspending your own account?")
    f.n("refused", Wb, 15, "io", "Show “You can't deactivate or demote your own account”")
    f.n("end3", Ad, 15, "end", "End")
    f.n("save", A, 16, "process", "Save; a suspended account can't sign in and loses access at its next token renewal (within 15 min)")
    f.n("saved", Wb, 17, "io", "Show “… suspended / reactivated / is now …”")
    f.n("end2", Ad, 18, "end", "End")
    f.e("start", "what")
    f.e("what", "fill", "Invite")
    f.e("what", "pick", "Change", exit="r", side="r")
    f.e("fill", "check")
    f.e("check", "fill", "No", exit="l", entry="r")
    f.e("check", "send", "Yes")
    f.e("send", "valid", exit="r")
    f.e("valid", "msg", "No", exit="l", entry="r")
    f.e("msg", "fill", exit="l", entry="r")
    f.e("valid", "create", "Yes")
    f.e("create", "created")
    f.e("created", "end1")
    f.e("pick", "own")
    f.e("own", "disabled", "Yes", exit="l", entry="r")
    f.e("own", "react", "No")
    f.e("react", "confirm", "No")
    f.e("react", "patch", "Yes", exit="r")
    f.e("confirm", "patch")
    f.e("patch", "self", exit="r")
    f.e("self", "refused", "Yes", exit="l", entry="r")
    f.e("self", "save", "No")
    f.e("refused", "end3", exit="l", entry="r")
    f.e("save", "saved")
    f.e("saved", "end2")
    return f


def barcode():
    f = Flow("barcode-lookup", "11", "Barcode lookup",
             ["Staff / Admin", "Web app", "API server"],
             W + "app/admin/barcode/page.tsx, " + W + "hooks/useBarcodeScanner.ts, " + API + "products/routes.ts (GET /barcode/:code)",
             notes=[
                 "“Adjust its stock? No” goes back to scanning the next item. A scanner types the code and presses Enter; a scan is caught even when the field isn't focused. The last 5 codes stay listed and can be looked up again with one tap.",
                 "For a recipe dish the result shows the servings left and a Raw materials button instead of Adjust stock. The shown stock updates live.",
             ])
    S, Wb, A = f.lanes
    f.n("start", S, 0, "start", "Open Barcode lookup (15)")
    f.n("scan", S, 1, "io", "Scan with the barcode reader, or type the code and press Enter")
    f.n("clean", Wb, 2, "decision", "Empty, or longer than 64 characters?")
    f.n("look", Wb, 3, "process", "Look up the code (GET /api/products/barcode/:code)")
    f.n("find", A, 3, "process", "Find the product with this barcode")
    f.n("fail", Wb, 4, "decision", "Lookup failed (no connection or server error)?")
    f.n("retry", S, 4, "io", "Sees “Couldn't look up …”; presses Try again")
    f.n("found", Wb, 5, "decision", "Product found?")
    f.n("show", Wb, 6, "io", "Show name, category, price, cost (Admin only), stock and minimum")
    f.n("adjust", S, 7, "decision", "Adjust its stock?")
    f.n("flow7", S, 8, "sub", "Adjust stock (Flow 07)")
    f.n("admin", Wb, 9, "decision", "Signed in as Admin?")
    f.n("ask", S, 9, "io", "Sees “… ask an administrator to add the product”")
    f.n("offer", Wb, 10, "process", "Offer “Add product with this barcode”")
    f.n("end1", S, 10, "end", "End")
    f.n("flow8", S, 11, "sub", "Add the product with the barcode filled in (Flow 08)")
    f.e("start", "scan")
    f.e("scan", "clean")
    f.e("clean", "scan", "Yes (message)", exit="l", entry="r")
    f.e("clean", "look", "No")
    f.e("look", "find", exit="r", entry="l")
    f.e("find", "fail")
    f.e("fail", "retry", "Yes", exit="l", entry="r")
    f.e("retry", "look", exit="l")
    f.e("fail", "found", "No")
    f.e("found", "show", "Yes")
    f.e("found", "admin", "No", exit="r")
    f.e("show", "adjust")
    f.e("adjust", "flow7", "Yes")
    f.e("adjust", "scan", "No", exit="l", entry="l")
    f.e("admin", "ask", "No", exit="l", entry="r")
    f.e("admin", "offer", "Yes")
    f.e("offer", "flow8")
    f.e("ask", "end1")
    return f


def reports():
    f = Flow("reports", "12", "Analytics and report export (Admin)",
             ["Admin", "Web app", "API server"],
             W + "app/admin/analytics/page.tsx, " + W + "lib/download.ts, " + API + "reports/routes.ts, " + API + "reports/service.ts, " + API + "reports/export.ts",
             notes=[
                 "Sales and order counts cover the last 14 days (daily), 8 weeks (weekly) or 6 months (monthly). Top products, profitability and inventory movement are all-time. Only orders that are confirmed or later count as paid. Average order value = revenue ÷ paid orders.",
                 "Empty states: “No sales in this period”, “No sales yet”, “No products have a cost recorded yet”.",
             ])
    Ad, Wb, A = f.lanes
    f.n("start", Ad, 0, "start", "Open Analytics (17)")
    f.n("period", Ad, 1, "io", "Choose Daily, Weekly or Monthly (Daily at first)")
    f.n("ask", Wb, 2, "process", "Ask for sales, top products, profitability, inventory movement and restock counts")
    f.n("sum", A, 2, "process", "Add up the paid orders for the period, and all time for the rankings")
    f.n("ok", Wb, 3, "decision", "Loaded?")
    f.n("fail", Ad, 3, "io", "Sees “Could not load analytics.”")
    f.n("show", Wb, 4, "io", "Show the tiles (revenue, orders, average order value…), charts and tables, or the empty states")
    f.n("end0", Ad, 4, "end", "End")
    f.n("export", Ad, 5, "decision", "Download a report?")
    f.n("press", Ad, 6, "io", "Press CSV, Excel or PDF on a card")
    f.n("get", Wb, 6, "process", "Download it (GET /api/reports/export) with the signed-in token")
    f.n("build", A, 6, "process", "Build the report in that format")
    f.n("dl", Wb, 7, "decision", "Download worked?")
    f.n("dlfail", Ad, 7, "io", "Sees the reason the export failed")
    f.n("file", Wb, 8, "io", "Save the file, e.g. sales-report-daily.csv")
    f.n("end", Ad, 9, "end", "End")
    f.e("start", "period")
    f.e("period", "ask")
    f.e("ask", "sum", exit="r", entry="l")
    f.e("sum", "ok")
    f.e("ok", "fail", "No", exit="l", entry="r")
    f.e("ok", "show", "Yes")
    f.e("show", "export")
    f.e("export", "press", "Yes")
    f.e("export", "end", "No", exit="l")
    f.e("press", "get", exit="r", entry="l")
    f.e("get", "build", exit="r", entry="l")
    f.e("build", "dl")
    f.e("dl", "dlfail", "No", exit="l", entry="r")
    f.e("dl", "file", "Yes")
    f.e("file", "end")
    f.e("fail", "end0")
    f.e("dlfail", "end")
    return f


def idle():
    f = Flow("kiosk-idle-reset", "13", "Kiosk idle reset",
             ["Customer", "Kiosk (web app)"],
             W + "hooks/useIdleTimer.ts, " + W + "components/kiosk/IdleTimeoutOverlay.tsx, " + W + "app/page.tsx, " + W + "app/checkout/page.tsx, "
             + W + "app/checkout/success/page.tsx",
             notes=["The popup isn't shown over the welcome screen. On checkout and the payment pages the reset goes to the kiosk home page (/)."])
    C, K = f.lanes
    f.n("start", K, 0, "start", "The menu, checkout or a receipt is on screen")
    f.n("timer", K, 1, "process", "Start the 60-second timer")
    f.n("active", K, 2, "decision", "Touch, key, mouse or scroll within 60 s?")
    f.n("ask", K, 3, "io", "Show “Still there?” (06)")
    f.n("here", C, 4, "decision", "Taps “I'm still here” within 20 s?")
    f.n("clear", K, 5, "process", "Clear the order and the dine-in / take-out choice")
    f.n("end", K, 6, "end", "Back to the welcome screen (01)")
    f.e("start", "timer")
    f.e("timer", "active")
    f.e("active", "timer", "Yes", exit="r")
    f.e("active", "ask", "No")
    f.e("ask", "here")
    f.e("here", "timer", "Yes", exit="l")
    f.e("here", "clear", "No")
    f.e("clear", "end")
    return f


def qr():
    f = Flow("kiosk-qr-code", "14", "Kiosk QR code (Admin)",
             ["Admin", "Web app", "Customer (phone)"],
             W + "app/admin/kiosk-qr/page.tsx (qrcode package, generated in the browser)",
             notes=["A localhost address also shows a warning that phones can't open it. Nothing is sent to an outside service."])
    Ad, Wb, C = f.lanes
    f.n("start", Ad, 0, "start", "Open Kiosk QR code (21)")
    f.n("fill", Wb, 1, "process", "Fill in the address: saved on this device, else NEXT_PUBLIC_KIOSK_URL, else this site")
    f.n("edit", Ad, 2, "io", "Keeps it, types another address, or presses Use this site")
    f.n("valid", Wb, 3, "decision", "A full http:// or https:// address?")
    f.n("make", Wb, 4, "process", "Save it on this device; make the QR code in the browser")
    f.n("how", Ad, 5, "decision", "Print or download?")
    f.n("print", Ad, 6, "process", "Print the poster (only the poster, A4)")
    f.n("png", Wb, 6, "process", "Save the code as zaks-kiosk-qr.png")
    f.n("post", Ad, 7, "process", "Put the printed code where customers see it (outside the system)")
    f.n("scan", C, 8, "io", "Scans the code with the phone camera")
    f.n("flow3", C, 9, "sub", "The kiosk opens on the phone (Flow 03)")
    f.e("start", "fill")
    f.e("fill", "edit")
    f.e("edit", "valid")
    f.e("valid", "edit", "No (message; buttons off)", exit="l", entry="r")
    f.e("valid", "make", "Yes")
    f.e("make", "how")
    f.e("how", "print", "Print")
    f.e("how", "png", "Download", exit="r")
    f.e("print", "post")
    f.e("png", "post")
    f.e("post", "scan")
    f.e("scan", "flow3")
    return f
