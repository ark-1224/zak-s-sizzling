---
name: Zak's Sizzling Hub Kiosk
description: A cast-iron order counter for walk-in customers, warm and signage-loud, built for a 1024x600 touchscreen and a phone.
colors:
  char: "#2b1912"
  char-soft: "#44291d"
  matcha: "#b84a20"
  matcha-deep: "#7a2a14"
  honey: "#e0a85a"
  honey-soft: "#f1dbaa"
  paper: "#efe0c4"
  cream: "#f7eedf"
  white: "#ffffff"
  line: "#e1d0ae"
  ink: "#2a2018"
  ink-soft: "#6e5d4b"
  price-accent: "#9c5a1a"
  available: "#5f7a3d"
  berry: "#9c2e1c"
  grey-out: "#a69a88"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.33
    fontVariation: "'wdth' 88"
  price:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
    fontVariation: "'wdth' 88"
  order-number:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 88"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-large:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  action:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  thumb: "12px"
  slab: "16px"
  tile: "18px"
  panel: "22px"
  sheet: "24px"
  receipt: "28px"
  card: "22px 8px 22px 8px"
  mark: "50% 50% 50% 8px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.matcha}"
    textColor: "{colors.cream}"
    typography: "{typography.action}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "56px"
  button-primary-disabled:
    backgroundColor: "{colors.grey-out}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "56px"
  button-quick-add:
    backgroundColor: "{colors.matcha}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    size: "48px"
  button-quick-add-confirmed:
    backgroundColor: "{colors.available}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    size: "48px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.matcha}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  chip-filter:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chip-filter-selected:
    backgroundColor: "{colors.char}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
  chip-instruction-selected:
    textColor: "{colors.matcha-deep}"
    rounded: "{rounded.pill}"
    height: "48px"
  segment-selected:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.char}"
    rounded: "{rounded.pill}"
    height: "40px"
  rail-tile:
    backgroundColor: "{colors.char}"
    textColor: "{colors.cream}"
    rounded: "{rounded.slab}"
    height: "56px"
  rail-tile-active:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.char}"
    rounded: "{rounded.slab}"
  item-tile:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
  order-chip:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slab}"
    padding: "6px 12px 6px 6px"
    height: "56px"
  input-search:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    typography: "{typography.body-large}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "48px"
  field-note:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.thumb}"
    padding: "12px 14px"
  item-sheet:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  order-number-plate:
    backgroundColor: "{colors.char}"
    textColor: "{colors.honey}"
    typography: "{typography.order-number}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Zak's Sizzling Hub Kiosk

## Overview

**Creative North Star: "The Cast-Iron Counter"**

The customer kiosk is Zak's own order counter, held in a cast-iron frame. A near-black, red-brown "char" (the colour of a seasoned sizzling plate) wraps every screen edge: the top bar, the category rail, the welcome screen, the receipt's order-number plate. Inside it sits a bright, warm work surface of paper and white tiles where one category's dishes are laid out at a size you can hit standing. One ember colour carries every action. Honey marks whatever is chosen right now. The type is a heavy, slightly condensed grotesque set at menu-board scale, so prices and headings read like signage.

Density is deliberately low. The 1024x600 screen gives one task per view, a frame that never moves, and a work surface that scrolls on its own. The customer's running order stays visible along the bottom at all times. Motion is limited to transform and opacity because the kiosk runs on a Raspberry Pi. The one ornamental motion is steam rising off the drawn sizzling plate on the welcome screen.

The world refuses the phone food-app feed: no promo banner, no endless mixed scroll, no floating basket pill. A separate, cooler back-office system (the `adm-` tokens, Archivo and Space Mono) serves staff screens. It is a neighbour, not part of this world, and nothing here applies to it.

**Key Characteristics:**
- A dark char frame around a warm paper work surface, divided by a single honey hairline.
- One ember action colour with cream text, on pill-shaped buttons at least 56px tall.
- Honey slabs for the current selection (category, dine in or take out, order count).
- Bricolage Grotesque at 88% width and weight 800 for headings, prices and the order number. Inter for everything read at length.
- Big white tiles with a 4:3 photo slot and a round ember + on its corner.
- The drawn sizzling plate as the brand's illustration: steaming on welcome, small and still in empty states.

## Colors

A warm, low-key palette of cast iron, toasted paper and ember, with exactly one action hue and one selection hue.

### Primary
- **Ember** (`matcha`, #b84a20): every primary action. Add to order, the round quick-add +, Review & pay, Place order, Done, Show every price. Cream text on it passes WCAG AA (4.5:1). The token keeps its legacy name `matcha` in code; it is ember, not green.
- **Deep Char-Ember** (`matcha-deep`): headings on light surfaces (category title, item name, section heads, the "Your order" label), the stepper's − and + signs, and the global focus ring (2px solid, 2px offset).

### Secondary
- **Honey** (`honey`): the selection slab. The active rail tile, the selected dine-in or take-out segment, the order-count badge, the order number on its char plate, the second line of the welcome headline, icons on the char frame, and the hairline under the frame (honey at 50%). Never fill an action button with it on a light surface: its edge against cream is only 1.8:1.
- **Honey Cream** (`honey-soft`): quiet informational wells such as the prep-time box and the "Takes about N min" pill (both at 70%), icon discs on payment options, and text selection.

### Tertiary
- **Price Amber** (`price-accent`): every price on a white or cream surface. This is honey darkened to reach 4.5:1 on white.
- **Olive** (`available`): the in-stock signal only. Used for the "In stock" pill (text on a 14% tint) and the quick-add + turning olive with a check for 900ms after a tap.
- **Chili** (`berry`): allergen tags and blocking validation text ("Choose one to place your order.").

### Neutral
- **Cast Iron** (`char`): the frame. Top bar, rail, welcome screen, order-number plate, the selected price chip, and scrims (char at 55–60%). Cream text on it is 15:1, honey 8:1.
- **Seasoned Iron** (`char-soft`): raised elements on the frame, such as the back button and pressed rail tiles.
- **Toasted Paper** (`paper`): the work surface behind the menu grid, the order-type screen and checkout. It is also the pressed state of light controls.
- **Cream** (`cream`): page background, sheets and dialogs, the search field on the char bar, order chips, and the text colour on every dark or ember surface.
- **Tile White** (`white`): item tiles, the order bar, checkout panels, inputs and unselected chips. It is the brightest thing on the paper surface.
- **Rule Tan** (`line`): 1px dividers and 2px chip and card borders, skeleton blocks, and scrollbar thumbs on light panes.
- **Ink** (`ink`) and **Ink Soft** (`ink-soft`): body text and secondary text (counts, captions, placeholders, "Total").
- **Spent Ash** (`grey-out`): the disabled action (solid with white text, or at 40% when the order is empty). Sold-out tiles use opacity 60% under a char band reading SOLD OUT.

**Category grounds.** Until real photos arrive, every photo slot (tile, sheet header, order-chip thumb, checkout line) is filled by its category's diagonal gradient (135deg). The gradients live in `src/lib/categoryColors.ts`: Sizzling Plates #4A2E1F to #7A3A1C, Specials #8C2E12 to #D8592B, Rice & Noodles #EFE0BE to #E0C68F, Soups & Stews #E8CBAE to #D89A6C, Sides #E3E0C4 to #C9C494, Drinks #CFE0DB to #9DC4BB, Desserts #F6E3C6 to #E8B87D. These are the only cool or green-leaning hues in the world, and they appear only inside photo slots.

### Named Rules
**The One Ember Rule.** Ember is the single colour for "do the next thing". If a control is not a primary action, it is not ember-filled. Secondary actions are ember outline (2px) or ember text.

**The Honey Means Chosen Rule.** Honey fills mark the current selection, never an action. A honey slab carries char text.

**The Frame Is Char Rule.** Every screen's outer edge (top bar, rail, welcome screen) is char, separated from the light work surface by one 2px honey hairline at 50% opacity. The order bar is the exception: it is white with a lifted top shadow, so the order reads as part of the work surface.

## Typography

**Display Font:** Bricolage Grotesque (variable; wdth and opsz axes loaded), always set at `font-stretch: 88%`
**Body Font:** Inter (400, 500, 600, 700)

**Character:** A heavy, slightly condensed grotesque like a grill's menu board, paired with a neutral, highly legible sans for anything read in a sentence. Bricolage only ever appears at signage scale, at weight 700 or 800.

### Hierarchy
- **Display** (800, 3rem phone / 3.75rem tablet / 4.5rem kiosk, 0.95, -0.02em): the welcome headline only, in cream, with a honey second line.
- **Headline** (800, 1.875rem; 2.25–3rem on the order-type question; 1.25 line height; -0.02em): screen and sheet titles such as the category name, item name and receipt heading, in deep char-ember.
- **Title** (800, 1.5rem): section heads (Your order, Payment), totals, empty-state headlines, and the "Tap anywhere to start" call.
- **Price** (700, 1.25rem on tiles; 800, 1.5rem in the sheet): every price, in price amber on light surfaces and ink for totals.
- **Order Number** (800, 3rem, line height 1, -0.01em): the receipt's number in honey on char. It is the largest thing on that screen.
- **Body** (Inter 400, 1rem, 1.5): descriptions (relaxed 1.625 leading), receipt lines, helper text. Body Large (1.125rem) is for the welcome subline, search input and choice hints.
- **Label** (Inter 600, 1rem): chips, segment and rail labels (13px on the narrow phone rail), dish names on tiles (1rem, 17px on the kiosk).
- **Action** (Inter 700, 1.125rem): text on primary buttons.
- **Caption** (Inter 400, 0.875rem): counts, "Total", character counters, payment-method notes.

### Named Rules
**The Signage Scale Rule.** Bricolage is used only for headings, prices, totals and the order number, always at 700–800 weight and 88% width. Paragraphs, labels and buttons are always Inter.

**The No Kicker Rule.** Headings stand alone; there are no eyebrow lines or tracked small caps above them. Uppercase is used for exactly two status flags: SOLD OUT on a tile and NEW on a rail tile.

## Layout

The kiosk is a fixed frame around one scrolling pane. At 1024x600 it shows:
- a char top bar (about 64px: logo, dine-in or take-out switch, search filling the middle, Start over);
- a char rail on the left (192px from md, 208px from lg, 84px on phones where each tile stacks its icon over its name; the rail stays visible at every width, as a panel requirement);
- the paper work surface (category title with dish count, a single row of price chips, then the tile grid);
- a white order bar (about 76px) along the bottom.

Only the work surface scrolls. The rail and order strip scroll by swipe with hidden scrollbars, and the order strip fades out over its last 40px.

The tile grid is 2 columns on phones, 3 from 640px and 4 from 1024px, with a 12px gap and 12–20px side gutters. Photo slots are 4:3 rather than square so that two rows fit under the frame on the 600px-tall screen. Spacing steps by 6/8/12/16/20/24px. Inside components, 10–12px is the common inner padding and 20–28px is used for sheets and dialogs.

On phones, the top bar wraps to two rows with search at full width. The order strip collapses to a single "count + total" button. Checkout becomes a single column with a fixed bottom action bar. From lg it splits 3:2 (order on the left, payment sticky on the right). The receipt also goes two-column at lg so "Done" is visible without scrolling. Every touch target is at least 44px tall, and actions are 48–56px.

## Elevation & Depth

Depth is soft and warm, used to lift tappable things off the paper rather than to stack many layers. Shadows are long, low-opacity and tinted with ink brown, and they are offset straight down. The frame itself is flat; it reads as depth by being dark. Scrims are char at 55–60%.

### Shadow Vocabulary
- **Card Lift** (`box-shadow: 0 10px 28px -14px rgba(42, 32, 24, 0.4)`): item tiles, primary buttons, the quick-add +, choice cards, checkout panels.
- **Order Bar Rise** (`box-shadow: 0 -10px 28px -18px rgba(42, 32, 24, 0.45)`): the white order bar, lifting upward off the bottom edge.
- **Icon Square** (`box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.6)`): category icon squares on the char rail.
- **Overlay** (`box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)`): sheets, dialogs, the toast, the cart drawer.

### Named Rules
**The Lift Means Tap Rule.** A shadow means the thing can be tapped (tiles, buttons, choice cards) or sits on top (sheets). Disabled actions drop their shadow.

## Shapes

The corners are generous and soft, with three fixed exceptions:
- Pills (fully round) are for actions, chips, segments, the search field and the stepper.
- Tiles round at 18px. Their 4:3 photo slot is clipped square inside them, with no inner radius of its own.
- Rail tiles and order chips are 16px slabs. Thumbs, fields and expanders are 12px. Choice cards and the order-number plate are 22px. Sheets are 24px (top corners only on phones). The receipt is 28px.

The brand mark is a teardrop: logo crops are round on three corners and nearly square on the bottom-left (50% 50% 50% 8px). The idle "Still there?" dialog echoes it with an alternating leaf corner (22px 8px 22px 8px).

Borders are 1px rule tan for dividers and panels, and 2px for chips and selectable cards. A selected card's border changes to ember, or the whole card fills with honey.

## Components

### Buttons
Big, round-ended and confident. They press in rather than glow.
- **Shape:** full pill (9999px).
- **Primary:** ember fill, cream Inter 700 text at 1.125rem, 56px tall, 20–28px side padding, with card lift. Labels carry the live amount when it helps ("Add to order · ₱180.00").
- **Pressed:** `scale(0.97)` (0.98 on full-width bars). There is no hover treatment; this is a touch surface. Focus uses the global 2px deep char-ember outline at a 2px offset.
- **Disabled:** spent ash fill with white text and no shadow. On the empty order bar it is ash at 40% with ink-soft text.
- **Outline:** 2px ember border, ember text, 48px, used for the second of two empty-state actions.
- **Quick Add:** a 48px ember circle with a 2px white ring and card lift, sitting on the lower-right corner of the photo slot. After a tap it turns olive with a check for 900ms.
- **On the frame:** Start over and Back are cream text (85%) on char, with char-soft or white/10 when pressed.

### Chips
- **Price filter:** white with a 2px rule-tan border and ink label, plus a count in ink-soft. When selected, it becomes a char fill with cream label and honey count. The chips sit in one row that scrolls sideways and never wraps.
- **Special instructions:** white with a 1px rule border. When selected, it gets an ember border, a 10% ember tint, deep char-ember text and a leading check icon. Chips that won't fit the character budget dim to 40%.
- **Status pills:** small pills on a 14–18% tint of their meaning colour (olive for "In stock", ash for unavailable) with a 6px leading dot.
- **Tags:** 8px-radius tags for ingredients (paper fill, ink-soft text) and allergens (chili text).

### Cards / Containers
- **Item tile:** white, 18px corners, card lift, a 4:3 photo slot on top. The dish name is Inter 600 (two lines at most) and the price is Bricolage 700 in price amber, pinned to the bottom.
- **Sold out:** the tile drops to 60% opacity, a char band at 85% reading SOLD OUT crosses the bottom of the photo, the + is removed and the tile can't be tapped.
- **Choice card** (dine in or take out): cream, 22px corners, 2px rule border, card lift, a drawn illustration over a 1.875rem Bricolage label.
- **Checkout panels:** white, 16px corners, card lift, 16–20px padding, rule-tan dividers between lines.
- **Selectable option cards** (payment at checkout): 16px corners, 2px border, at least 64px tall. The selected one gets an ember border and a filled ember check disc.

### Inputs / Fields
- **Search:** a cream pill sitting in the char bar, 48px tall, with an ink-soft search icon. On focus the whole pill gets a 2px honey ring, because the deep ember outline would vanish on char. A round clear button appears once there is text.
- **Note field:** white, 1px rule border, 12px corners. On focus the border turns ember. When the on-screen keyboard opens, the sheet adds 45dvh of scroll room so the field is never hidden.

### Navigation
- **Category rail:** char column of 16px slabs, each holding a 40px category icon square (on its category gradient, with icon-square shadow) and an Inter 600 name. The active category becomes a honey slab with char text. Categories emptied by the price filter dim to 35% and can't be tapped. A NEW flag (ember, or char-on-honey when active) sits in the tile's corner.
- **Dine in / take out** is asked once, on the order-type screen, and not repeated in the top bar or at checkout; "Start over" clears it with the order.

### Order Bar (signature)
The white bar along the bottom with a 1px rule top border and the order bar rise shadow. It holds:
- "Your order" in Bricolage on two lines;
- a sideways strip of 56px cream order chips (a gradient thumb, an ember "2×", the name and line price);
- the total in Bricolage 800;
- the ember Review & pay button with a chevron.

When empty, it shows the small still sizzling plate and "Your order is empty. Tap a dish to start." On phones, the strip collapses to a paper slab holding a honey count badge and the total.

### Item Sheet
A cream sheet that rises from the bottom (24px top corners) on phones and becomes a centred 672px dialog from md. Its layout:
- a 144–160px photo-slot header and a round white close button;
- the name and price;
- status pills;
- the description, allergens (always visible), instruction chips and note field;
- an "Ingredients & nutrition" expander;
- a fixed footer with the quantity stepper (a white pill with 48px − and + targets) beside the full-width Add button.

### Welcome and Sizzling Plate (signature)
The welcome screen is full-bleed char and the whole screen is one button. It shows:
- the teardrop logo with a honey ring;
- the display headline;
- the drawn SVG sizzling plate on its wooden board, taking the right half;
- a footer with a honey "Tap anywhere to start" (gently pulsing) and the payment methods.

Three steam wisps rise off the plate on a 3.2s loop, staggered by about 1.1s. They move with transform and opacity only and are hidden under reduced motion. The same plate returns small and still in empty states and in the corner of the receipt's order-number plate. Once a real dish photo exists, it replaces the plate on the welcome screen (28px corners, deep shadow).

### Receipt
A cream 28px dialog, two columns on the kiosk. The order number sits large in honey on a char plate, with an order-type pill. Beside it are the prep-time well (honey-soft), an itemised white panel, and a full-width ember Done button.

## Do's and Don'ts

### Do:
- **Do** keep every screen inside the char frame with one 2px honey hairline (honey at 50%) between frame and surface.
- **Do** make ember (#b84a20) the only fill for primary actions, with cream text, as a pill at least 56px tall.
- **Do** mark the current selection with a honey slab and char text.
- **Do** set headings, prices, totals and the order number in Bricolage Grotesque at 700–800 and 88% width, and everything else in Inter.
- **Do** put prices on light surfaces in price amber (#9c5a1a), never raw honey.
- **Do** keep touch targets at 44px minimum and actions at 48–56px.
- **Do** animate only transform and opacity: sheets rise in 220ms, fades take 180ms, presses scale to 0.97, and everything decorative stops under reduced motion.
- **Do** use the drawn sizzling plate as the illustration for empty and idle states.

### Don't:
- **Don't** fill a button with honey on a cream or paper surface; its edge there is 1.8:1.
- **Don't** add a promo banner, a mixed endless feed, or a floating basket pill. The order lives in the bottom bar.
- **Don't** put eyebrow or kicker lines above headings, or set labels in tracked uppercase beyond the SOLD OUT and NEW flags.
- **Don't** use Bricolage for body copy or button labels, or at weights below 700.
- **Don't** use green outside photo slots except for the in-stock signal and the quick-add confirmation.
- **Don't** bring the back-office `adm-` palette, Archivo or Space Mono into customer screens.
- **Don't** animate layout properties (width, height, top, left); the kiosk's Raspberry Pi can't keep them smooth.
