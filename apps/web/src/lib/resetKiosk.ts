/**
 * Back to the welcome screen for the next customer, with a full page load on purpose:
 * it drops everything the last customer left in memory and picks up a new deploy,
 * which an in-app navigation (router.push) would not. The saved cart is already
 * cleared by the caller where needed.
 */
export function resetKiosk() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is the point (see above)
  window.location.href = "/";
}
