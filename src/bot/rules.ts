import type { Decision, MarketSnapshot } from "./types.js";
export const STRATEGY_VERSION = "pump-curve-entry-v1-adaptive-exit" as const;
export type StrategyConfig = {
  minImpulsePct: number;
  minPullbackFraction: number;
  maxPullbackFraction: number;
  minPivotReclaimPct: number;
  minBuySellQuoteRatio2s: number;
  minUniqueBuyers2s: number;
  maxSellerToBuyerRatio2s: number;
  maxLargestBuyerShare2s: number;
  maxEntryImpactPct: number;
  maxExitImpactPct: number;
  maxRoundTripFeePct: number;
};
export const DEFAULT_CONFIG: StrategyConfig = {
  minImpulsePct: 20,
  minPullbackFraction: 0.10,
  maxPullbackFraction: 0.40,
  minPivotReclaimPct: 1.0,
  minBuySellQuoteRatio2s: 3.0,
  minUniqueBuyers2s: 3,
  maxSellerToBuyerRatio2s: 0.5,
  maxLargestBuyerShare2s: 0.72,
  maxEntryImpactPct: 2,
  maxExitImpactPct: 2,
  maxRoundTripFeePct: 4
};
function decision(s: MarketSnapshot, action: Decision["action"], reasons: string[], score = 0): Decision {
  return {
    mint: s.mint, action, score, reasons,
    strategyVersion: STRATEGY_VERSION,
    timestampMs: s.timestampMs, snapshot: s
  };
}
/**
 * Strict Coin 3-derived entry trigger. Coin selection/rug filters are intentionally
 * not embedded here; those are a separate research phase. This function only checks
 * data/execution safety and the validated momentum/pullback/flow trigger.
 */
export function evaluateEntry(s: MarketSnapshot, config: StrategyConfig = DEFAULT_CONFIG): Decision {
  const hard: string[] = [];
  const watch: string[] = [];
  if (s.phase !== "bonding_curve") hard.push("not_on_pump_bonding_curve");
  if (!s.dataFresh) hard.push("stale_or_missing_market_data");
  if (!s.marketStateVerified) hard.push("unverified_market_state");
  if (!s.exitRouteAvailable) hard.push("no_verified_exit_route");
  if (!(s.priceSol > 0) || !Number.isFinite(s.priceSol)) hard.push("invalid_market_price");
  if (s.estimatedEntryImpactPct > config.maxEntryImpactPct) hard.push("entry_price_impact_too_high");
  if (s.estimatedExitImpactPct > config.maxExitImpactPct) hard.push("exit_price_impact_too_high");
  if (s.estimatedRoundTripFeePct > config.maxRoundTripFeePct) hard.push("round_trip_cost_too_high");
  if (hard.length) return decision(s, "reject", [...new Set(hard)]);

  if (s.impulsePct < config.minImpulsePct) watch.push("60s_impulse_below_20pct");
  if (s.pullbackFraction < config.minPullbackFraction || s.pullbackFraction > config.maxPullbackFraction)
    watch.push("pullback_outside_10_to_40pct");
  if (s.pivotReclaimPct === undefined) watch.push("5s_pivot_reclaim_data_missing");
  else if (s.pivotReclaimPct < config.minPivotReclaimPct) watch.push("5s_pivot_reclaim_below_1pct");

  const buy = s.buyQuoteVolume2s;
  const sell = s.sellQuoteVolume2s;
  if (buy === undefined || sell === undefined) watch.push("2s_buy_sell_quote_data_missing");
  else if (!(buy > config.minBuySellQuoteRatio2s * sell)) watch.push("2s_buy_quote_not_greater_than_3x_sell_quote");

  const buyers = s.uniqueBuyers2s;
  const sellers = s.uniqueSellers2s;
  if (buyers === undefined || sellers === undefined) watch.push("2s_unique_wallet_counts_missing");
  else {
    if (buyers < config.minUniqueBuyers2s) watch.push("fewer_than_3_unique_buyers_in_2s");
    if (sellers > buyers * config.maxSellerToBuyerRatio2s) watch.push("seller_wallet_count_above_half_of_buyers");
  }
  if (s.largestBuyerShare2s === undefined) watch.push("largest_buyer_share_data_missing");
  else if (s.largestBuyerShare2s > config.maxLargestBuyerShare2s) watch.push("largest_buyer_share_above_72pct");

  if (watch.length) return decision(s, "watch", [...new Set(watch)]);
  return decision(s, "buy", ["strict_entry_conditions_passed"], 100);
}
