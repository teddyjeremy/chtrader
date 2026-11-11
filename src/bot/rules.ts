import type { Decision, MarketSnapshot } from "./types.js";
import {
  DEFAULT_MARKET_GUARD_CONFIG,
  evaluateCreatorAndClusterRisk,
  evaluatePersistentBuyingPressure,
  evaluateTokenEconomics
} from "./market-guards.js";
export const STRATEGY_VERSION = "pump-curve-entry-v2-persistent-risk-gated" as const;
export type StrategyConfig = {
  minImpulsePct: number; minPullbackFraction: number; maxPullbackFraction: number;
  minPivotReclaimPct: number; minBuySellQuoteRatio2s: number; minUniqueBuyers2s: number;
  maxSellerToBuyerRatio2s: number; maxLargestBuyerShare2s: number;
  maxEntryImpactPct: number; maxExitImpactPct: number; maxRoundTripFeePct: number;
  minCreatorExitRecoveryImpulsePct: number;
  minCreatorExitRecoveryPivotPct: number;
};
export const DEFAULT_CONFIG: StrategyConfig = {
  minImpulsePct: 20, minPullbackFraction: 0.10, maxPullbackFraction: 0.40,
  minPivotReclaimPct: 1.0, minBuySellQuoteRatio2s: 3.0, minUniqueBuyers2s: 3,
  maxSellerToBuyerRatio2s: 0.5, maxLargestBuyerShare2s: 0.72,
  maxEntryImpactPct: 2, maxExitImpactPct: 2, maxRoundTripFeePct: 4,
  minCreatorExitRecoveryImpulsePct: 35,
  minCreatorExitRecoveryPivotPct: 8
};
function decision(s: MarketSnapshot, action: Decision["action"], reasons: string[], score = 0): Decision {
  return { mint:s.mint, action, score, reasons, strategyVersion:STRATEGY_VERSION, timestampMs:s.timestampMs, snapshot:s };
}
/** Strict trigger plus creator/cluster, persistent-flow and token-economics pre-entry gates. */
export function evaluateEntry(s: MarketSnapshot, config: StrategyConfig = DEFAULT_CONFIG): Decision {
  const hard: string[] = [], watch: string[] = [];
  if (s.phase !== "bonding_curve") hard.push("not_on_pump_bonding_curve");
  if (!s.dataFresh) hard.push("stale_or_missing_market_data");
  if (!s.marketStateVerified) hard.push("unverified_market_state");
  if (!s.exitRouteAvailable) hard.push("no_verified_exit_route");
  if (!(s.priceSol > 0) || !Number.isFinite(s.priceSol)) hard.push("invalid_market_price");
  if (![s.estimatedEntryImpactPct,s.estimatedExitImpactPct,s.estimatedRoundTripFeePct].every(Number.isFinite) ||
      s.estimatedEntryImpactPct < 0 || s.estimatedExitImpactPct < 0 || s.estimatedRoundTripFeePct < 0)
    hard.push("invalid_execution_cost_data");
  else {
    if (s.estimatedEntryImpactPct > config.maxEntryImpactPct) hard.push("entry_price_impact_too_high");
    if (s.estimatedExitImpactPct > config.maxExitImpactPct) hard.push("exit_price_impact_too_high");
    if (s.estimatedRoundTripFeePct > config.maxRoundTripFeePct) hard.push("round_trip_cost_too_high");
  }
  if (hard.length) return decision(s, "reject", [...new Set(hard)]);

  const creatorGuard = evaluateCreatorAndClusterRisk(
    s.creatorRisk, s.creatorDistributing, s.suspiciousClusterDominance, s.timestampMs
  );
  const flowGuard = evaluatePersistentBuyingPressure(s.flowPersistence, s.timestampMs);
  const economicsGuard = evaluateTokenEconomics(
    s.tokenEconomics, s.estimatedRoundTripFeePct, s.timestampMs
  );
  const creatorSaleQuarantine = !!s.creatorRisk?.creatorLifecycleHistoryComplete &&
    s.creatorRisk.creatorInitialAllocationSoldPctSinceLaunch >
      DEFAULT_MARKET_GUARD_CONFIG.maxCreatorInitialAllocationSoldPctSinceLaunch;
  const creatorRecoveryConfirmed = creatorSaleQuarantine &&
    Number.isFinite(s.impulsePct) && s.impulsePct >= config.minCreatorExitRecoveryImpulsePct &&
    s.pivotReclaimPct !== undefined && Number.isFinite(s.pivotReclaimPct) &&
    s.pivotReclaimPct >= config.minCreatorExitRecoveryPivotPct &&
    s.higherLowConfirmed && flowGuard.watch.length === 0;

  const guardReject = [...creatorGuard.reject, ...flowGuard.reject, ...economicsGuard.reject];
  const creatorWatch = creatorGuard.watch.filter(reason =>
    reason !== "creator_lifecycle_exit_quarantine_active"
  );
  if (creatorSaleQuarantine && !creatorRecoveryConfirmed)
    creatorWatch.push("creator_exit_quarantine_recovery_not_confirmed");
  const guardWatch = [...creatorWatch, ...flowGuard.watch, ...economicsGuard.watch];
  if (economicsGuard.effectiveRoundTripCostPct !== undefined &&
      economicsGuard.effectiveRoundTripCostPct > config.maxRoundTripFeePct)
    guardReject.push("round_trip_cost_including_taxes_above_strategy_limit");
  if (guardReject.length)
    return decision(s, "reject", [...new Set(guardReject)]);

  if (!Number.isFinite(s.impulsePct) || s.impulsePct < config.minImpulsePct) watch.push("60s_impulse_below_20pct_or_invalid");
  if (!Number.isFinite(s.pullbackFraction) || s.pullbackFraction < config.minPullbackFraction || s.pullbackFraction > config.maxPullbackFraction)
    watch.push("pullback_outside_10_to_40pct_or_invalid");
  if (s.pivotReclaimPct === undefined || !Number.isFinite(s.pivotReclaimPct)) watch.push("5s_pivot_reclaim_data_missing_or_invalid");
  else if (s.pivotReclaimPct < config.minPivotReclaimPct) watch.push("5s_pivot_reclaim_below_1pct");

  const buy = s.buyQuoteVolume2s, sell = s.sellQuoteVolume2s;
  if (buy === undefined || sell === undefined || !Number.isFinite(buy) || !Number.isFinite(sell) || buy < 0 || sell < 0)
    watch.push("2s_buy_sell_quote_data_missing_or_invalid");
  else if (!(buy > config.minBuySellQuoteRatio2s * sell)) watch.push("2s_buy_quote_not_greater_than_3x_sell_quote");

  const buyers = s.uniqueBuyers2s, sellers = s.uniqueSellers2s;
  if (buyers === undefined || sellers === undefined || !Number.isInteger(buyers) || !Number.isInteger(sellers) || buyers < 0 || sellers < 0)
    watch.push("2s_unique_wallet_counts_missing_or_invalid");
  else {
    if (buyers < config.minUniqueBuyers2s) watch.push("fewer_than_3_unique_buyers_in_2s");
    if (sellers > buyers * config.maxSellerToBuyerRatio2s) watch.push("seller_wallet_count_above_half_of_buyers");
  }
  const concentration = s.largestBuyerShare2s;
  if (concentration === undefined || !Number.isFinite(concentration) || concentration < 0 || concentration > 1)
    watch.push("largest_buyer_share_missing_or_invalid");
  else if (concentration > config.maxLargestBuyerShare2s) watch.push("largest_buyer_share_above_72pct");

  if (watch.length || guardWatch.length)
    return decision(s, "watch", [...new Set([...guardWatch, ...watch])]);
  return decision(s, "buy", [
    "strict_entry_conditions_passed",
    ...(creatorRecoveryConfirmed ? ["creator_exit_recovery_confirmed"] : [])
  ], 100);
}
