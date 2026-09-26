# Manuscript Corrections After Adviser Review

This file lists every change needed to align the manuscript with the system as built. Each fix gives the section, the OLD text, and the NEW text to paste into Word, and cites the code that supports it.

**Source used.** The manuscript is not in the repository. OLD text was taken from `Copy of MANUSCRIPT-SIZZLING.pdf` (May 2026 version). Page references use the printed page number, followed by the PDF page in brackets, for example "p. 11 [PDF 14]". The PDF text extraction drops some hyphens and apostrophes (for example "rolebased" for "role-based", "Zaks" for "Zak's"). When searching in Word, search for a short distinctive phrase from the OLD text rather than the whole passage.

**Adviser decisions applied.**

1. Offline/PWA support is removed from scope.
2. Receipt printing stays in scope as kiosk hardware (Raspberry Pi 5 with a USB thermal printer).
3. One role list is used everywhere, matching the code.
4. The ERD matches the current database schema.
5. The limitation that contradicts the diagrams is rewritten (approved).

Items the code does not support, and which were not covered by these decisions, are listed at the end under **Needs decision**. They are not rewritten here.

---

## 1. Remove offline mode and PWA

The code has no offline or PWA feature: no web app manifest, service worker, offline queue, IndexedDB storage, or install prompt. A repository search found none, and `apps/web/package.json` has no PWA package. Every mention below is removed.

### 1.1 Limitations of the System: "Limited Offline Support"
**Where:** Chapter 1, Scope and Limitations, Limitations of the System, p. 11 [PDF 14]

**OLD**
> Limited Offline Support – The system relies heavily on stable internet connectivity to ensure real-time synchronization of orders and inventory. Although it can temporarily queue transactions during short interruptions, extended downtime may result in delays in reporting accuracy and synchronization. This limitation reflects the project's focus on real-time operations and emphasizes the importance of reliable network infrastructure for optimal performance. For Zak's Sizzling Hub, this means that while the system can handle brief connectivity issues, prolonged outages could disrupt the seamless flow of operations, requiring manual intervention until the connection is restored.

**NEW**
> Dependence on Internet Connectivity – The system requires a stable internet connection between the kiosk, the staff devices, and the cloud server. It does not store orders offline; an order is recorded only when the kiosk can reach the server. During an internet outage, customers cannot place orders at the kiosk and staff cannot update orders or stock records, so Zak's Sizzling Hub must take orders manually until the connection is restored.

**Evidence:** Orders are created only through the API (`POST /api/orders`, `apps/api/src/modules/orders/routes.ts`), and no offline storage exists in `apps/web`.

### 1.2 Sprint Execution
**Where:** Chapter 3, Methodology, 3. Sprint Execution, p. 38 [PDF 41]

**OLD**
> Core features such as real-time stock updates, transaction logging, and kiosk ordering were implemented incrementally. The PWA and offline synchronization mechanisms were developed to handle network instability by caching transactions and synchronizing data once connectivity was restored a critical feature for Zak's Sizzling Hub given its reliance on local infrastructure.

**NEW**
> Core features such as real-time stock updates, transaction logging, and kiosk ordering were implemented incrementally.

### 1.3 Technical Background: PWA subsection
**Where:** Chapter 3, Technical Background, pp. 42–43 [PDF 45–46]

**OLD** (heading and paragraph)
> Progressive Web Application (PWA) and Offline Synchronization
>
> The system incorporates PWA features to enhance reliability and accessibility. Offline synchronization mechanisms allow the kiosk to cache data and queue transactions during network disruptions. Once connectivity is restored, queued data is automatically synchronized with the central database, ensuring continuity of operations a critical feature for Zak's Sizzling Hub, which relies on local infrastructure and must remain functional even during unstable internet connections.

**NEW**
> *(Delete the heading and the paragraph.)*

### 1.4 Deployment Platform: background worker
**Where:** Chapter 3, Technical Background, Deployment Platform, p. 43 [PDF 46]

**OLD**
> A dedicated background worker service, also hosted within the same Railway project, handles asynchronous operations including offline transaction queuing, data synchronization upon network restoration, and scheduled database backup jobs.

**NEW**
> A dedicated background worker service, also hosted within the same Railway project, runs scheduled jobs, including an hourly low-stock check.

**Evidence:** `apps/worker/src/index.ts` schedules `lowStockSweep` hourly. The database backup job in the same file is scheduled only when `NODE_ENV` is `development`, so it is not described as running on Railway. See Needs decision item 8.

### 1.5 Figure 1.1 description
**Where:** Chapter 3, description under Figure 1.1, p. 45 [PDF 48]

**OLD**
> Finally, the system is deployed through Railway, which hosts backend services and the database, offering scalability, offline synchronization, and continuous availability without requiring complex infrastructure management.

**NEW**
> Finally, the system is deployed through Railway, which hosts backend services and the database, offering scalability and continuous availability without requiring complex infrastructure management.

### 1.6 Figure 1.2 description
**Where:** Chapter 3, description under Figure 1.2, p. 47 [PDF 50]

**OLD**
> This deployment approach provides scalability, offline synchronization, and continuous availability without requiring complex infrastructure management -- making it practical and cost-effective for small food businesses like Zak's Sizzling Hub.

**NEW**
> This deployment approach provides scalability and continuous availability without requiring complex infrastructure management, making it practical and cost-effective for small food businesses like Zak's Sizzling Hub.

### 1.7 Requirements Analysis: "When"
**Where:** Chapter 3, Requirements Analysis, When, p. 51 [PDF 54]

**OLD**
> The automated system operates 24/7, allowing customers to place orders anytime and ensuring inventory updates occur instantly. Offline support ensures that transactions can still be queued and synchronized once connectivity is restored.

**NEW**
> The automated system operates 24/7, allowing customers to place orders anytime and ensuring inventory updates occur instantly.

### 1.8 Third-Party Integrations: PWA APIs
**Where:** Chapter 3, Development, Third-Party Integrations, p. 66 [PDF 69]

**OLD**
> Progressive Web Application (PWA) APIs – Supported offline data caching and transaction synchronization during network disruptions, ensuring Zak's operations continue even with unstable connectivity.

**NEW**
> *(Delete this item.)*

### 1.9 Code Quality Assurance and Error Management
**Where:** Chapter 3, Development, Code Quality Assurance and Error Management, p. 68 [PDF 71]

**OLD**
> Offline handling and transaction queuing mechanisms ensured data integrity during network disruptions, supporting continuous operation and synchronization once connectivity was restored.

**NEW**
> The system does not queue transactions while offline; an order is recorded only when the kiosk can reach the server, and the kiosk shows an error message when a request fails.

**Evidence:** `apps/web/src/app/checkout/page.tsx` catches a failed order request and shows the error in a toast message.

### 1.10 Mentions that stay unchanged
These mention PWAs or offline access but describe *other* systems in the Review of Related Literature, not this one. They stay unchanged:
- Adam et al. (2024), the PWA and Leaflet navigation kiosk, pp. 15–16 [PDF 18–19], and its entry in the References.
- The synthesis sentence on p. 34 [PDF 37] ("...remaining cost-effective and offline-capable to suit local...") summarizes the literature. It makes no claim about this system.

---

## 2. One role list everywhere

### 2.1 Roles in the code
The code defines exactly three roles, in the same form in every place:

| Code location | Roles |
|---|---|
| `apps/api/prisma/schema.prisma`, `enum UserRole` | `admin`, `staff`, `customer` |
| `packages/shared-types/src/entities.ts`, `type UserRole` | `admin`, `staff`, `customer` |
| `apps/api/src/middleware/authorize.ts` and every `authorize(...)` call in `apps/api/src/modules/*/routes.ts` | `admin`, `staff` |
| `apps/api/src/middleware/authenticate.ts` (kiosk session token) | `customer` |
| `apps/web/src/components/StaffGuard.tsx`, `apps/web/src/components/admin/AdminShell.tsx` | `admin`, `staff` (Users & roles shown to `admin` only) |

There is no "Super Administrator", "Kitchen Staff", "Front Desk", or "Consumer" role in the code. Kitchen and front-desk personnel both use Staff accounts.

### 2.2 The canonical role block
Paste this block, word for word, in each of the three places listed in 2.3. If the adviser prefers the table to appear only once, keep the full table in 2.3(a) and, in 2.3(b) and 2.3(c), keep the first sentence and replace the table with the reference "(see Table 3)". Renumber "Table 3" to fit the manuscript.

> The system has three user roles: Administrator, Staff, and Customer. Table 3 lists who holds each role and what each role can do in the system.
>
> **Table 3: System User Roles**
>
> | Role | Who | What the role can do |
> |---|---|---|
> | Administrator | The owner of Zak's Sizzling Hub, who signs in with an administrator account. | Performs every Staff function. In addition, manages user accounts: creates administrator and staff accounts, changes their roles, resets passwords, and deactivates or reactivates accounts. |
> | Staff | Front-desk and kitchen personnel of Zak's Sizzling Hub, who sign in with staff accounts. | Confirms counter payments; updates the preparation status of ordered items on the kitchen display; views and adjusts stock levels and the low-stock list; adds, edits, and removes products and prices; imports products in bulk; views analytics and exports reports; views and edits orders. |
> | Customer | Any person ordering at the kiosk. Customers do not have accounts; the kiosk starts an anonymous session that expires after two hours. | Browses the menu, places orders, views their own order and receipt, and chooses to pay at the counter or online through GCash or Maya. |

**Evidence for each permission**

| Statement | Code |
|---|---|
| Administrator manages user accounts (create, change role, reset password, deactivate) | `apps/api/src/modules/users/routes.ts`: `GET/POST/PATCH /api/users` use `authorize("admin")`; `apps/api/src/modules/users/schema.ts` allows `role`, `password`, `isActive` |
| Staff confirms counter payments | `POST /api/payments/counter/:orderId/confirm`, `authorize("admin", "staff")` |
| Staff updates kitchen preparation status | `PATCH /api/kitchen/tasks/:id`, `authorize("admin", "staff")`; statuses `pending`, `in_progress`, `completed` (`enum KitchenStatus`) |
| Staff views and adjusts stock and the low-stock list | `apps/api/src/modules/inventory/routes.ts`: `/low-stock`, `/adjustments`, `PATCH /:productId`, `authorize("admin", "staff")` |
| Staff adds, edits, removes products; bulk import | `apps/api/src/modules/products/routes.ts`: `POST /`, `PUT /:id`, `DELETE /:id`, `POST /bulk-import`, `authorize("admin", "staff")` |
| Staff views analytics and exports reports | `apps/api/src/modules/reports/routes.ts`: all routes `authorize("admin", "staff")` |
| Staff views and edits orders | `apps/api/src/modules/orders/routes.ts`: `GET /`, `PATCH` and `DELETE /:id/items/:itemId`, `authorize("admin", "staff")` |
| Customer has no account; anonymous two-hour session | `POST /api/auth/kiosk-session`; `apps/api/src/lib/jwt.ts` `signKioskSessionToken` with `expiresIn: "2h"`; `users/schema.ts` accepts only `admin` and `staff` |
| Customer places orders and sees only their own order and receipt | `POST /api/orders`, `GET /api/orders/:id` and `/:id/receipt` (ownership check in `orders/routes.ts`) |
| Customer chooses counter or online payment | `apps/web/src/app/checkout/page.tsx`; `POST /api/payments/intent` |

### 2.3 Places where the canonical block replaces an old role list

**(a) Scope of the System, p. 7 [PDF 10]**

OLD
> These modules are divided across three user roles: Customer (Kiosk User), Kitchen Staff, and Administrator, each having distinct privileges and functions that align with their responsibilities in the food service workflow.

NEW
> These modules are divided across the system's user roles, each having distinct privileges and functions that align with their responsibilities in the food service workflow.
>
> *(Insert the canonical role block from 2.2 here.)*

**(b) Authentication and Authorization, p. 9 [PDF 12]**

OLD
> Users are grouped into defined roles such as kiosk users, administrators, and super administrators. Role-based access control ensures that sensitive operations--such as stock adjustments, financial reporting, and system configuration--are restricted to authorized personnel.

NEW
> *(Insert the canonical role block from 2.2 here.)*
>
> Role-based access control ensures that sensitive operations, such as stock adjustments, financial reporting, and user account management, are restricted to signed-in Administrator and Staff accounts, and that only Administrator accounts can manage user accounts.

**(c) Figure 2.0 User Level Diagram and its description, pp. 56–57 [PDF 59–60]**

Change the figure labels:

| OLD label | NEW label |
|---|---|
| ADMIN (OWNER) | ADMINISTRATOR (OWNER) |
| FRONTDESK (ZAK'S STAFF) | STAFF (FRONT DESK AND KITCHEN) |
| CONSUMER (CUSTOMER) | CUSTOMER (KIOSK USER) |

OLD (the four description paragraphs, from "The User Level Diagram illustrates..." to "...across all user types.")

NEW
> The User Level Diagram illustrates the hierarchical structure of user roles within the Web-Based Self-Service Kiosk with Integrated Real-Time Stock Inventory and Transaction Management System for Zak's Sizzling Hub. The pyramid is divided into three levels, one for each user role.
>
> *(Insert the canonical role block from 2.2 here.)*
>
> The Administrator holds the highest level of access, the Staff level supports daily operations, and the Customer level interacts only with the kiosk. This structure keeps the roles separate and makes each user accountable for the actions their role allows.

### 2.4 Other places that name roles

**(d) Scope and Limitations introduction, pp. 6–7 [PDF 9–10]**

OLD
> The target users of the system are customers who need a fast and reliable ordering experience, kitchen staff who require accurate and immediate order updates, and administrators who manage products, payments, and stock levels through a secure dashboard.

NEW
> The target users of the system are customers who need a fast and reliable ordering experience, staff who require accurate and immediate order updates, and administrators who manage the system and its user accounts through a secure dashboard.

**(e) Requirements Analysis, "Who", p. 50 [PDF 53]**

OLD
> The people involved in the system include the customers, the kitchen staff, the administrators, and the system itself. Customers browse the digital menu, customize meals, place orders, and pay securely through the kiosk or mobile interface. Kitchen staff receive realtime order details on a dedicated display, enabling efficient preparation and reducing miscommunication. Administrators oversee operations by managing products, monitoring inventory, adjusting stock levels, handling payments, and generating reports.

NEW
> The people involved in the system are the customers, the staff, the administrators, and the system itself. Customers browse the digital menu, customize meals, place orders, and pay through the kiosk. Staff receive real-time order details on the kitchen display, update the preparation status of each item, confirm counter payments, and manage products, stock levels, and reports. Administrators perform all staff functions and also manage user accounts.

**(f) Requirement Documentation, pp. 54–55 [PDF 57–58]**

Replace the three headings and their items ("Client (Customer)", "Front Desk (Zak's Staff)", "Admin Management") with the following.

NEW
> **Customer**
> - Self-Service Ordering Experience – Customers access the kiosk interface to browse available menu items, view product details, and place orders independently.
> - Interactive Product Selection – Customers select items, adjust quantities, and add special instructions for the kitchen.
> - Cart and Order Management – Customers review selected items, update quantities, and confirm orders before checkout.
> - Payment Processing – Customers choose to pay at the counter or online through GCash or Maya.
> - Order Confirmation – Customers receive a digital receipt on screen with the order number and order details, and a printed receipt from the kiosk's thermal printer.
>
> **Staff**
> - Order and Payment Management – Staff view incoming orders, edit order items, and confirm counter payments.
> - Kitchen Display – Staff view orders on the kitchen display and update the preparation status of each item (Pending, In Progress, Completed).
> - Inventory and Stock Management – Staff view current stock levels and the low-stock list, and record stock adjustments with a reason (restock, return, damaged, spoilage, correction, or other).
> - Product and Price Management – Staff add, edit, and remove products and prices, and import products in bulk from a CSV file.
> - Sales Reports – Staff view sales, top-selling product, inventory movement, and profitability reports, and export them as CSV files.
>
> **Administrator**
> - All Staff Functions – The administrator can perform every staff function listed above.
> - User Account Administration – The administrator creates administrator and staff accounts, changes their roles, resets passwords, and deactivates or reactivates accounts.

Two old items are removed because the code has no function for them: "Customer Assistance" (Front Desk) and "System Maintenance Supervision" (Admin). See Needs decision item 12.

**(g) Figure 1.1 image, p. 44 [PDF 47]**

In the Login box, change "Role-based authentication (Admin, Staff, Super Admin)" to "Role-based authentication (Administrator, Staff)". Customers do not sign in, so they do not appear in this box.

**(h) Figure 2.1 description, p. 58 [PDF 61]**

| OLD | NEW |
|---|---|
| "...how users interact with the platform across different roles customer, staff, and administrator." | "...how users interact with the platform across the Administrator, Staff, and Customer roles." |
| "This interface enables Zak's kitchen staff to efficiently track and prepare orders..." | "This interface enables staff in the kitchen to track and prepare orders..." |
| "The Add Product Modal allows administrators to input new menu items..." | "The Add Product Modal allows administrators and staff to input new menu items..." |
| "...and Users & Roles, which allows administrators to manage user accounts and assign permissions." | "...and Users & Roles, which allows administrators to manage user accounts and assign the Administrator or Staff role." |

**(i) Sprint 1, p. 67 [PDF 70]**

OLD
> Authentication and authorization mechanisms were implemented using rolebased access control to distinguish between kiosk users, staff, and administrators.

NEW
> Authentication and authorization mechanisms were implemented using role-based access control to distinguish between the Administrator, Staff, and Customer roles.

---

## 3. Entity Relationship Diagram and data dictionary

### 3.1 Replace Figure 3.0
**Where:** Chapter 3, Design of Software System, Product, and/or Processes, Figure 3.0, p. 61 [PDF 64]

Replace the image with `docs/manuscript-fixes/erd.png`. It is rendered from `docs/manuscript-fixes/erd.mmd`, which was written from `apps/api/prisma/schema.prisma`. The diagram shows the actual PostgreSQL table and column names.

**Checked against the schema:** 10 tables in both, 78 columns in both, 9 foreign-key relationships in both.

### 3.2 Changes from the old ERD

| Entity | Old ERD | Current schema |
|---|---|---|
| **stock_adjustments** | Not present | New table that records every manual stock change: product, change amount, quantity before and after, reason, optional note, the user who made it, and the time. |
| **All tables** | Every ID is `int` | `uuid` IDs for users, products, orders, order_items, payments, kitchen_tasks, and stock_adjustments; `int` IDs for roles, categories, and inventory |
| **users** | `role (type)` as FK; `password` | `role_id` FK to roles; `password_hash` (bcrypt hash, not the password). Added `is_active`, `created_at`, `updated_at` |
| **roles** | `role_name varchar` | `name` limited to `admin`, `staff`, `customer` (`user_role` enum) |
| **orders** | `user_id` FK to users | **Removed.** Orders are not linked to user accounts, because customers order anonymously. The anonymous kiosk session is stored in `kiosk_session_id` instead |
| **orders** | `transact_process` key | **Does not exist.** Orders and payments are linked only by `payments.order_id` |
| **orders** | `order_num int`, `order_date date`, `order_status varchar`, `total_amount double` | `order_number varchar` (unique), `created_at`, `status` (`order_status` enum: pending, confirmed, preparing, ready, completed, cancelled), `total_amount decimal(10,2)`. Added `customer_name`, `kiosk_session_id`, `source`, `updated_at` |
| **payments** | `transact_process` FK, `payment_date`, `payment_status varchar`, `payment_method varchar` | No `transact_process`. `order_id` is unique (one payment per order). `paid_at`, `status` (`payment_status` enum: pending, paid, failed, refunded), `method` (`payment_method` enum: gcash, maya, counter). Added `amount`, `reference`, `gateway_payload`, `created_at` |
| **order_items** | `quantity`, `subtotal double` | `qty`, `subtotal decimal(10,2)`. Added `unit_price` (price at the time of ordering), `special_instructions` (up to 140 characters), `created_at` |
| **kitchen_tasks** | `prep_status int`, `completion_time` | `status` (`kitchen_status` enum: pending, in_progress, completed), `completed_at`. Added `started_at`, `created_at`. `order_item_id` is unique (one task per item) |
| **inventory** | `quantity`, `minimum_stock`; described as "One-to-One/Many" | `stock_qty`, `min_stock_threshold` (default 5), `updated_at`. `product_id` is unique, so the relationship is strictly one-to-one |
| **products** | `categories_id`, `stock_level`, `barcode int`, `price double` | `category_id`. **No stock column:** stock is stored only in inventory. `barcode varchar` (unique, optional), `price decimal(10,2)`. Added `description`, `icon`, `cost`, `ingredients`, `allergens`, `calories`, `protein_g`, `carbs_g`, `sugar_g`, `is_available`, `created_at`, `updated_at` |
| **categories** | `categories_id`, `categories_name` | `id`, `name` (unique). Added `icon`, `sort_order`, `is_new` |

### 3.3 ERD description paragraphs
**Where:** pp. 61–62 [PDF 64–65]

OLD
> Each entity corresponds to a specific component or process of the system, such as Users, Roles, Orders, Order Items, Payments, Products, Categories, Inventory, and Kitchen Tasks.

NEW
> Each entity corresponds to a specific component or process of the system: Users, Roles, Categories, Products, Inventory, Stock Adjustments, Orders, Order Items, Payments, and Kitchen Tasks.

OLD
> The Payment entity is securely linked to each Order through a unique transaction process key, ensuring financial accuracy.

NEW
> Each Order has at most one Payment, linked through a unique order_id foreign key, which prevents an order from being paid twice.

OLD
> Furthermore, the Product entity connects to Categories and Inventory, allowing the system to manage menu organization and automate stock-level alerts. The User entity connects to specific Roles, ensuring role-based access control and proper data flow across the kiosk and kitchen modules.

NEW
> Furthermore, the Product entity connects to Categories and Inventory, allowing the system to manage menu organization and to flag products whose stock falls to the minimum threshold. Every manual stock change is recorded in Stock Adjustments together with the user who made it. The User entity connects to a Role, which supports role-based access control.

### 3.4 Data dictionary (replaces "Entities and Relationships")
**Where:** pp. 62–64 [PDF 65–67]. Replace everything from the heading "Entities and Relationships" to the end of the KitchenTask entry.

NEW

> **Entities and Relationships**
>
> Key: PK = primary key, FK = foreign key, UK = unique. Tables use PostgreSQL naming.

> **roles**: the user roles of the system.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | integer | PK | Role identifier |
> | name | user_role (admin, staff, customer) | UK | Role name |
>
> Relationship: one role is assigned to many users (one-to-many).

> **users**: administrator and staff accounts. Customers do not have user accounts.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | User identifier |
> | name | varchar(120) | | Full name |
> | email | varchar(160) | UK | Sign-in email |
> | password_hash | text | | bcrypt hash of the password |
> | role_id | integer | FK → roles.id | Assigned role |
> | is_active | boolean | | False when the account is deactivated (default true) |
> | created_at | timestamp | | Date and time created |
> | updated_at | timestamp | | Date and time last updated |
>
> Relationships: many users belong to one role (many-to-one); one user records many stock adjustments (one-to-many).

> **categories**: groups of menu items.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | integer | PK | Category identifier |
> | name | varchar(80) | UK | Category name |
> | icon | varchar(8) | | Optional icon shown on the kiosk |
> | sort_order | integer | | Display order on the kiosk (default 0) |
> | is_new | boolean | | Marks a newly added category (default false) |
>
> Relationship: one category groups many products (one-to-many).

> **products**: menu items sold at the kiosk.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Product identifier |
> | name | varchar(150) | | Product name |
> | price | decimal(10,2) | | Selling price |
> | barcode | varchar(64) | UK | Optional barcode |
> | category_id | integer | FK → categories.id | Category of the product |
> | description | text | | Optional description |
> | icon | varchar(8) | | Optional icon shown on the kiosk |
> | cost | decimal(10,2) | | Optional unit cost, used for profitability reports |
> | ingredients | text array | | List of ingredients |
> | allergens | text array | | List of allergens |
> | calories | integer | | Optional calories |
> | protein_g | decimal(6,2) | | Optional protein in grams |
> | carbs_g | decimal(6,2) | | Optional carbohydrates in grams |
> | sugar_g | decimal(6,2) | | Optional sugar in grams |
> | is_available | boolean | | Whether the product can be ordered (default true) |
> | created_at | timestamp | | Date and time created |
> | updated_at | timestamp | | Date and time last updated |
>
> Relationships: many products belong to one category (many-to-one); one product has at most one inventory record (one-to-one); one product appears in many order items and many stock adjustments (one-to-many).

> **inventory**: the current stock level of each product.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | integer | PK | Inventory record identifier |
> | product_id | uuid | FK → products.id, UK | Product this stock level belongs to |
> | stock_qty | integer | | Units in stock (default 0) |
> | min_stock_threshold | integer | | Low-stock level (default 5) |
> | updated_at | timestamp | | Date and time last updated |
>
> Relationship: one inventory record belongs to exactly one product (one-to-one).

> **stock_adjustments**: log of manual stock changes.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Adjustment identifier |
> | product_id | uuid | FK → products.id | Product adjusted |
> | delta | integer | | Change in quantity (positive or negative) |
> | previous_qty | integer | | Stock before the adjustment |
> | new_qty | integer | | Stock after the adjustment |
> | reason | adjustment_reason (restock, return, damaged, spoilage, correction, other) | | Reason for the change |
> | note | varchar(200) | | Optional note |
> | adjusted_by_id | uuid | FK → users.id | User who made the adjustment |
> | created_at | timestamp | | Date and time of the adjustment |
>
> Relationships: many adjustments belong to one product and to one user (many-to-one).

> **orders**: customer orders.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Order identifier |
> | order_number | varchar(20) | UK | Order number shown to the customer |
> | customer_name | varchar(120) | | Optional customer name |
> | kiosk_session_id | varchar(64) | | Anonymous kiosk session that placed the order |
> | source | varchar(20) | | Where the order came from (default "kiosk") |
> | status | order_status (pending, confirmed, preparing, ready, completed, cancelled) | | Order status (default pending) |
> | total_amount | decimal(10,2) | | Order total |
> | created_at | timestamp | | Date and time placed |
> | updated_at | timestamp | | Date and time last updated |
>
> Relationships: one order contains many order items (one-to-many); one order has at most one payment (one-to-one).

> **order_items**: the products in an order.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Order item identifier |
> | order_id | uuid | FK → orders.id | Order this item belongs to |
> | product_id | uuid | FK → products.id | Product ordered |
> | qty | integer | | Quantity |
> | unit_price | decimal(10,2) | | Price per unit at the time of ordering |
> | subtotal | decimal(10,2) | | qty × unit_price |
> | special_instructions | varchar(140) | | Optional instructions for the kitchen |
> | created_at | timestamp | | Date and time created |
>
> Relationships: many order items belong to one order and reference one product (many-to-one); one order item has at most one kitchen task (one-to-one).

> **payments**: the payment for an order.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Payment identifier |
> | order_id | uuid | FK → orders.id, UK | Order being paid |
> | method | payment_method (gcash, maya, counter) | | Payment method |
> | status | payment_status (pending, paid, failed, refunded) | | Payment status (default pending) |
> | amount | decimal(10,2) | | Amount to be paid |
> | reference | varchar(100) | UK | Optional payment gateway reference |
> | gateway_payload | jsonb | | Optional data returned by the payment gateway |
> | paid_at | timestamp | | Date and time paid |
> | created_at | timestamp | | Date and time created |
>
> Relationship: one payment belongs to exactly one order (one-to-one).

> **kitchen_tasks**: preparation tracking for each ordered item.
>
> | Column | Type | Key | Description |
> |---|---|---|---|
> | id | uuid | PK | Task identifier |
> | order_item_id | uuid | FK → order_items.id, UK | Order item to prepare |
> | status | kitchen_status (pending, in_progress, completed) | | Preparation status (default pending) |
> | started_at | timestamp | | When preparation started |
> | completed_at | timestamp | | When preparation was completed |
> | created_at | timestamp | | Date and time created |
>
> Relationship: one kitchen task belongs to exactly one order item (one-to-one).

**Role entry in the old list.** The old Role entry said "(e.g., Admin, Staff, Customer)". The new roles table above already matches the canonical role list.

---

## 4. Receipt printing as in-scope kiosk hardware

**Current code status.** The digital on-screen receipt is done: `apps/web/src/components/kiosk/ReceiptModal.tsx` and `GET /api/orders/:id/receipt`. Physical printing is not started: there is no print endpoint, printer library, printer configuration, or print template. Per decision 2, the manuscript describes printing as part of the system, pending the kiosk hardware. See Needs decision item 1.

### 4.1 Scope: Payment Transaction
**Where:** Chapter 1, Scope of the System, Payment Transaction, p. 8 [PDF 11]

OLD
> Upon successful transaction processing, a digital receipt is displayed on the screen, and the option to trigger receipt printing is provided.

NEW
> Upon successful transaction processing, a digital receipt showing the order number is displayed on the screen, and the kiosk prints a customer receipt through a USB thermal printer connected to the kiosk.

The next sentence, about the estimated preparation or wait time, is unchanged. See Needs decision item 2.

### 4.2 Resources: Hardware
**Where:** Chapter 3, Resources, Hardware, p. 49 [PDF 52]

OLD
> Hardware
> - Central Processing Units (CPU): Ryzen 3 3200G or equal
> - Memory (RAM): 4GB or Higher
> - Storage (SSD): 256 GB SSD

NEW
> Development Hardware
> - Central Processing Units (CPU): Ryzen 3 3200G or equal
> - Memory (RAM): 4GB or Higher
> - Storage (SSD): 256 GB SSD
>
> Kiosk Hardware
> - Single-board computer: Raspberry Pi 5, running the kiosk interface in a web browser
> - Display: 9-inch touchscreen (1024 × 600)
> - Receipt printer: USB thermal receipt printer connected to the Raspberry Pi 5, used to print customer receipts

The display size comes from the kiosk setup you described earlier in development. Confirm it matches the final unit.

### 4.3 Technical Background: Hardware APIs
**Where:** Chapter 3, Technical Background, Hardware APIs, p. 42 [PDF 45]

OLD
> Hardware APIs integrate kiosk peripherals such as barcode scanners and receipt printers. These enable automated receipt printing, barcode-based stock identification, and faster checkout processes.

NEW
> Hardware APIs integrate kiosk peripherals such as barcode scanners and a USB thermal receipt printer connected to the kiosk's Raspberry Pi 5. These enable receipt printing, barcode-based stock identification, and faster checkout processes.

### 4.4 Third-Party Integrations: Hardware APIs
**Where:** Chapter 3, Development, Third-Party Integrations, p. 66 [PDF 69]

OLD
> Hardware APIs – Enabled integration with barcode scanners and receipt printers, streamlining product identification and checkout.

NEW
> Hardware APIs – Integrate barcode scanners and a USB thermal receipt printer connected to the kiosk's Raspberry Pi 5, streamlining product identification and checkout.

### 4.5 Checked and unchanged
- None of the limitations mentions receipt printing, so there is nothing to remove there.
- Figure 1.2 ("Receipt generation") and Requirement Documentation (the Order Confirmation item is rewritten in 2.4(f)) are consistent.
- Sprint 3, p. 67 [PDF 70], describes what was built in that sprint and mentions only digital receipts. It is left unchanged because printing was not built in Sprint 3.

---

## 5. Limitations checked against the diagrams

The manuscript has no use case, activity, or data flow diagrams. The diagrams it contains are Figure 1.0 (Agile cycle), Figures 1.1 and 1.2 (process flows), Figure 2.0 (user level), Figures 2.1 and 2.2 (wireframes), and Figure 3.0 (ERD). Each limitation was checked against these and against the code.

### 5.1 "Dependence on Human Oversight" (contradiction fixed; approved)
**Where:** Chapter 1, Limitations of the System, p. 13 [PDF 16]

**The conflict.** The old text says kitchen staff "cannot update order statuses". This contradicts:
- the Figure 1.2 image ("Kitchen Display – Updates preparation and completion status"; "Tracks preparation status")
- the Figure 2.1 description (the kitchen display shows "serving status")
- the ERD (the KitchenTask preparation status)
- the code (`PATCH /api/kitchen/tasks/:id`, statuses Pending → In Progress → Completed, `apps/web/src/app/kitchen/page.tsx`)

OLD
> Dependence on Human Oversight – Despite automating cart management, payments, and stock deductions, the system still requires administrators to handle exceptions such as spoilage, returns, or manual corrections. Kitchen staff also rely on the display system for order preparation but cannot update order statuses (e.g., "preparing" or "completed") within the system. This reliance on human intervention ensures accuracy but ties efficiency to staff availability, meaning the system functions as a decision-support tool rather than a fully autonomous solution.

NEW
> Dependence on Human Oversight – Although the system automates cart management, payment recording, and stock deductions, administrators and staff must still record exceptions such as spoilage, returns, and manual corrections through stock adjustments. Staff update the preparation status of each ordered item on the kitchen display (Pending, In Progress, Completed), so the accuracy of order tracking depends on staff updating these statuses as they work. The system supports, but does not replace, staff judgment in daily operations.

### 5.2 "Limited Offline Support"
Replaced by "Dependence on Internet Connectivity". See 1.1.

### 5.3 The other limitations: no conflict found

| Limitation | Checked against | Result |
|---|---|---|
| No Integration with External POS/ERP Systems | Figures 1.1 and 1.2 show no external POS or ERP; the POS-Lite module in the Scope is internal | Consistent |
| Absence of Predictive Analytics | Figure 1.1 Analytics box, Figure 2.1; `apps/api/src/modules/reports` has only descriptive reports | Consistent |
| Single-Location Deployment | Figures 1.1 and 1.2 show one deployment; the schema has no branch or location table | Consistent |
| Exclusion of Advanced Payment and Delivery Features | Figure 1.2 Payment Module; `enum PaymentMethod` (gcash, maya, counter) | Consistent. The `payment_status` enum includes a `refunded` value, but no refund function exists, which agrees with the limitation |

---

## 6. Diagrams that must be edited

| Figure | Page | What must change |
|---|---|---|
| Figure 1.1 End-User (Owner/Admin) Process Flow | p. 44 [PDF 47] | Login box: "(Admin, Staff, Super Admin)" → "(Administrator, Staff)". The figure shows no offline sync. |
| Figure 1.2 End-User (Customer/Kiosk) Process Flow | p. 46 [PDF 49] | No offline sync and no removed role. Optional: change "Receipt generation" to "Receipt generation and printing" to match 4.1. The "Access kiosk via QR code" bullet depends on Needs decision item 3. |
| Figure 2.0 User Level Diagram | p. 56 [PDF 59] | Relabel the three levels as shown in 2.3(c). |
| Figure 2.1 Admin Dashboard Wireframe | p. 58 [PDF 61] | No offline sync or removed role in the image. Its description is corrected in 2.4(h). |
| Figure 2.2 User/Kiosk Dashboard Wireframe | p. 59 [PDF 62] | No offline sync or removed role. It shows a barcode scanner, a POS-light keypad, QR-code payments, and price filtering; see Needs decision items 3, 4, and 15. |
| Figure 3.0 Entity Relationship Diagram | p. 61 [PDF 64] | Replace with `erd.png` (section 3). |

---

## Needs decision

The manuscript claims each item below, but the code does not support it (or supports it only in part). The adviser decisions above did not cover them, so they are listed here and not rewritten.

1. **Receipt printing is not implemented yet.** Only the on-screen receipt exists. The manuscript now describes printing as part of the system (decision 2), so it must be built and shown working on the Raspberry Pi 5 before the defense. If it is not ready by then, the scope text in section 4 would describe a feature the panel cannot see.
2. **Estimated preparation or wait time** (Scope, Payment Transaction, p. 8; Sprint 3, p. 67). No code computes or shows an estimated time.
3. **QR code access** (Scope, p. 7; Requirements Analysis, "Where" and "How", p. 51; Figure 1.2). The kiosk works in a phone browser, but the system does not generate or display a QR code.
4. **Barcode scanning** (Scope, p. 9; Sprint 4, p. 67; Figure 2.2). Products have a barcode field and the API has `GET /api/products/barcode/:code`, but no screen uses the lookup, and there is no scanner input.
5. **Rate limiting** (Scope, Security Measures, p. 9). No rate limiting exists in `apps/api`.
6. **PDF and Excel export** (Scope, Data Export, p. 11). Only CSV export works. PDF and Excel requests return "not implemented" (`apps/api/src/modules/reports/routes.ts`).
7. **Excel bulk import** (Scope, Product Management, p. 10). Only CSV import exists (`apps/web/src/app/admin/import/page.tsx`).
8. **Local and cloud backups** (Scope, Database Backup, p. 11; Deployment, p. 43). The backup job in `apps/worker` is scheduled only in development and writes to local disk. No cloud copy is made.
9. **Deduction of raw materials** (Objective 3, p. 6). Stock is deducted per product unit (`inventory.stock_qty`). No ingredient or raw-material table exists.
10. **Automatic low-stock notifications** (Scope, Realtime Stock Tracking, p. 10; Objective 4). Low-stock products are listed on the admin dashboard and inventory page, and the hourly worker check writes to the server log. No notification is sent to a person.
11. **Unit and integration testing** (Methodology, Testing and Quality Assurance, p. 38). The repository has no automated tests.
12. **Staff and Administrator permissions.** Earlier drafts gave product, price, and report functions to the administrator only. In the code, Staff can do all of these, and only user management is limited to the Administrator. The new role table describes the code as it is. Decide whether the code should later restrict Staff; that would be a separate change to the permission checks. The removed "Customer Assistance" and "System Maintenance Supervision" items (2.4(f)) have no matching function in the code.
13. **Product images** (Scope, Product Catalog and Display, p. 7; Product Catalog Management, p. 10). The products table has no image field; the kiosk shows an icon.
14. **Online payment through GCash and Maya** (FR2, the role table, and several sections). The code integrates PayMongo, but it has not been tested with real or test keys. The client's approval is pending.
15. **Filtering by price** (Figure 2.2 description, p. 60). The kiosk filters by category and search only.
16. **Use case, activity, and data flow diagrams.** The manuscript has none. If the panel expects them, they must be created.
