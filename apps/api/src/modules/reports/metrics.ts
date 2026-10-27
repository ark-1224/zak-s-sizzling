/**
 * Average order value: revenue ÷ paid orders, in pesos to the centavo. Null when there
 * were no orders, so a quiet period shows "—" rather than ₱0.00 or a division by zero.
 */
export function averageOrderValue(revenue: number, orderCount: number): number | null {
  if (orderCount <= 0) return null;
  return Math.round((revenue / orderCount) * 100) / 100;
}
