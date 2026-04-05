import type { PriceBreakdown } from "@/types";

/**
 * Calculate price breakdown in any target currency.
 *
 * Formula:
 *   itemCost = (priceCny + cnShippingCny) * fxRate * 1.05  (5% FX buffer)
 *   commission = itemCost * 0.10  (10% service fee)
 *   total = itemCost + commission
 *
 * The 5% FX buffer covers CNY rate fluctuation between search and purchase.
 * The 10% commission is Commercat's revenue (VAT applies to this only).
 */
export function calculatePrice(
  priceCny: number,
  cnShippingCny: number,
  fxRate: number, // 1 CNY = X target currency
  currency: string
): PriceBreakdown {
  const itemCost = (priceCny + cnShippingCny) * fxRate * 1.05;
  const commission = itemCost * 0.1;
  const total = itemCost + commission;

  return {
    item_cost: Math.round(itemCost * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    total: Math.round(total * 100) / 100,
    currency,
  };
}

/**
 * Calculate GEL price specifically (for order storage and BOG Pay).
 * Same formula, just always uses the CNY/GEL rate.
 */
export function calculatePriceGel(
  priceCny: number,
  cnShippingCny: number,
  fxRateGel: number // 1 CNY = X GEL
): PriceBreakdown {
  return calculatePrice(priceCny, cnShippingCny, fxRateGel, "GEL");
}
