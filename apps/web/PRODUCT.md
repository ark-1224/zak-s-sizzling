# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customers** of Zak's Sizzling Hub, a sizzling-plate restaurant. They order on the in-store kiosk: a 9" 1024×600 landscape touchscreen on a Raspberry Pi, with an on-screen keyboard. Or they order on their own phone after scanning the store's QR code. Many order quickly, standing, and some are first-time visitors.
- **Staff and the Administrator** use the admin side (its own link) for products, stock, the kitchen display and the payment queue. This record's design work concerns the customer kiosk.

## Product Purpose

A self-service kiosk with real-time stock and order management. The customer:
1. browses the menu,
2. adds dishes with special instructions,
3. chooses dine in or take out,
4. pays at the counter or online through GCash or Maya,
5. gets an order number and an estimated ready time.

The kitchen receives the order once it is paid.

Success means a customer finishes an order quickly without help, never orders something that is out of stock, and knows their number and when it will be ready.

## Positioning

The menu reflects the kitchen's real stock live. A dish shows as sold out the moment its stock or raw materials run out, and the receipt's ready time comes from the actual kitchen queue.

## Operating Context

- **Where:** in the store, at the counter area. The kiosk resets itself after a period of inactivity for the next customer.
- **Paying at the counter:** the order goes to staff, who confirm it, collect payment and send it to the kitchen.
- **Paying online:** GCash and Maya go through PayMongo.
- **Phone access:** a customer's phone reaches the same menu through the printed QR code.

## Capabilities and Constraints

- **Stock:** real-time stock over WebSocket; sold-out items can't be ordered.
- **Prices:** always come from the server.
- **Cart:** kept on the device until the order is placed.
- **Idle reset:** clears the cart and returns to the start.
- **Estimated preparation time:** shown at checkout and on the receipt.
- **Search and price filter:** search by name; the price filter is part of the manuscript (Figure 2.2).
- **Screen:** 1024×600 is the primary screen, so vertical space is scarce. The kiosk must also work at phone width (375px).
- **Kiosk hardware:** Raspberry Pi; keep effects light.

## Brand Commitments

- **Identity:** the Zak's Sizzling Hub name and logo (`public/logo.jpg`). Keep its colours: ember brown, orange-red and honey (current tokens in `src/app/globals.css`).
- **Visual reference:** the user chose an in-store kiosk layout like Burger King's and Ali Kebaba's kiosks: a category rail with picture tiles, a grid of item cards, and an order bar at the bottom. It is preceded by a welcome screen and a dine-in / take-out choice.

## Evidence on Hand

- **Logo:** at `public/logo.jpg`.
- **Menu data:** the menu (names, prices, descriptions, ingredients, allergens, nutrition, prep times) comes from the database.
- **Photos:** there are no food photos yet. Products show their emoji icon on a category colour until a photo is uploaded in the admin.
- **Never fabricate:** prices, ratings, reviews, sales counts, promotions or discounts.

## Product Principles

1. Every tap target is large enough to hit standing at a 9" screen; nothing important is small.
2. One task per screen, with nothing competing for the 600px of height.
3. Stock, prices and times shown to the customer are always the server's truth.
4. It should feel like Zak's own place, not a generic food-app template.

## Accessibility & Inclusion

Touch-first. Text and targets are sized for a kiosk viewed standing; contrast meets WCAG AA. Everything must also be usable on a phone screen.
