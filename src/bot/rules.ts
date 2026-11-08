import type { Decision, MarketSnapshot } from "./types.js";
export const STRATEGY_VERSION = "pullback-reclaim-v0.1" as const;
export type StrategyConfig = {
  maxAgeSeconds: number; minImpulsePct: number; maxImpulseAgeSeconds: number;
  minPullbackFraction: number; maxPullbackFraction: number; minIndependentBuyers10s: number;
  minLiquiditySol: number; maxImpactPct: number; maxRoundTripFeePct: number;
  minNetEdgePct: number; minScore: number;
};
export const DEFAULT_CONFIG: StrategyConfig = {
  maxAgeSeconds: 300, minImpulsePct: 12, maxImpulseAgeSeconds: 45,
  minPullbackFraction: 0.20, maxPullbackFraction: 0.45,
  minIndependentBuyers10s: 3, minLiquiditySol: 10, maxImpactPct: 2,
  maxRoundTripFeePct: 4, minNetEdgePct: 2, minScore: 70
};
export function evaluateEntry(s: MarketSnapshot, config: StrategyConfig = DEFAULT_CONFIG): Decision {
  const reasons: string[] = [];
  const hardRejects: string[] = [];
  if (s.phase !== "bonding_curve") hardRejects.push("not_on_pump_bonding_curve");
  if (!s.dataFresh) hardRejects.push("stale_or_missing_market_data");
  if (!s.marketStateVerified) hardRejects.push("unverified_market_state");
  if (!s.exitRouteAvailable) hardRejects.push("no_verified_exit_route");
  if (s.creatorDistributing) hardRejects.push("creator_distribution_detected");
  if (s.suspiciousClusterDominance) hardRejects.push("suspicious_wallet_cluster_dominance");
  if (s.sameSlotRoundTripDominance) hardRejects.push("same_slot_round_trip_dominance");
  if (s.estimatedEntryImpactPct > config.maxImpactPct) hardRejects.push("entry_price_impact_too_high");
  if (s.estimatedExitImpactPct > config.maxImpactPct) hardRejects.push("exit_price_impact_too_high");
  if (s.estimatedRoundTripFeePct > config.maxRoundTripFeePct) hardRejects.push("round_trip_cost_too_high");
  if (s.liquiditySol < config.minLiquiditySol) hardRejects.push("insufficient_curve_liquidity");
  if (hardRejects.length) return {
    mint:s.mint, action:"reject", score:0, reasons:hardRejects,
    strategyVersion:STRATEGY_VERSION, timestampMs:s.timestampMs, snapshot:s
  };
  if (s.ageSeconds > config.maxAgeSeconds) reasons.push("token_too_old_for_initial_scalp");
  if (s.impulsePct < config.minImpulsePct) reasons.push("impulse_below_minimum");
  if (s.secondsSinceImpulse > config.maxImpulseAgeSeconds) reasons.push("impulse_too_old");
  if (s.pullbackFraction < config.minPullbackFraction || s.pullbackFraction > config.maxPullbackFraction) reasons.push("pullback_outside_tested_band");
  if (!s.higherLowConfirmed) reasons.push("higher_low_not_confirmed");
  if (!s.pivotReclaimed) reasons.push("pivot_not_reclaimed");
  if (s.independentBuyers10s < config.minIndependentBuyers10s) reasons.push("too_few_independent_buyers");
  if (s.buyVolumeSol10s <= s.sellVolumeSol10s) reasons.push("buy_pressure_not_dominant");
  let score = 0;
  if (s.impulsePct >= config.minImpulsePct && s.impulsePct <= 45) score += 10;
  if (s.secondsSinceImpulse <= config.maxImpulseAgeSeconds) score += 10;
  if (s.pullbackFraction >= config.minPullbackFraction && s.pullbackFraction <= config.maxPullbackFraction) score += 20;
  if (s.higherLowConfirmed) score += 15;
  if (s.pivotReclaimed) score += 15;
  if (s.independentBuyers10s >= 5) score += 10;
  if (s.buyVolumeSol10s > s.sellVolumeSol10s) score += 5;
  if (s.liquiditySol >= config.minLiquiditySol * 2) score += 5;
  if (s.estimatedEntryImpactPct <= 1 && s.estimatedExitImpactPct <= 1) score += 5;
  if (s.estimatedRoundTripFeePct <= 2) score += 5;
  if (!reasons.length) {
    if (score < config.minScore) reasons.push("score_below_entry_threshold");
    const estimatedGrossMovePct = Math.max(0, s.impulsePct * 0.25);
    const conservativeNetEdgePct = estimatedGrossMovePct - s.estimatedRoundTripFeePct - s.estimatedEntryImpactPct - s.estimatedExitImpactPct;
    if (conservativeNetEdgePct < config.minNetEdgePct) reasons.push("net_edge_after_costs_too_small");
  }
  return {
    mint:s.mint, action:reasons.length ? "watch" : "buy", score, reasons,
    strategyVersion:STRATEGY_VERSION, timestampMs:s.timestampMs, snapshot:s
  };
}