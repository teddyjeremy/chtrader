import type { Decision, MarketSnapshot, RiskAssessment } from "./types.js";
export const STRATEGY_VERSION = "pullback-reclaim-v0.2-risk-gated" as const;
export type StrategyConfig = {
  maxAgeSeconds: number; minImpulsePct: number; maxImpulseAgeSeconds: number;
  minPullbackFraction: number; maxPullbackFraction: number; minIndependentBuyers10s: number;
  minLiquiditySol: number; maxImpactPct: number; maxRoundTripFeePct: number;
  minNetEdgePct: number; minScore: number; maxTop10HolderPct: number;
  maxCreatorLinkedPct: number; maxClusterHoldingsPct: number; maxFailedTxRatePct: number;
};
export const DEFAULT_CONFIG: StrategyConfig = {
  maxAgeSeconds: 300, minImpulsePct: 12, maxImpulseAgeSeconds: 45,
  minPullbackFraction: 0.20, maxPullbackFraction: 0.45,
  minIndependentBuyers10s: 3, minLiquiditySol: 10, maxImpactPct: 2,
  maxRoundTripFeePct: 4, minNetEdgePct: 2, minScore: 70,
  maxTop10HolderPct: 55, maxCreatorLinkedPct: 10, maxClusterHoldingsPct: 15,
  maxFailedTxRatePct: 35
};
function applyRiskGate(r: RiskAssessment | undefined, s: MarketSnapshot, c: StrategyConfig, hard: string[], watch: string[]) {
  if (!r) { watch.push("risk_assessment_missing"); return; }
  if (r.status !== "verified") watch.push("risk_assessment_incomplete");
  if (s.timestampMs - r.observedAtMs > 15_000 || s.timestampMs < r.observedAtMs) watch.push("risk_assessment_stale");
  hard.push(...r.hardRiskFlags);
  const { liquidity, holders, bundles } = r;
  if (liquidity.status !== "verified") watch.push("liquidity_assessment_unverified");
  if (holders.status !== "verified") watch.push("holder_distribution_unverified");
  if (bundles.status !== "verified") watch.push("bundle_assessment_unverified");
  if (liquidity.marketPhase === "bonding_curve") {
    if (!(liquidity.curveRealSolReserves !== undefined || liquidity.curveVirtualSolReserves !== undefined))
      watch.push("bonding_curve_reserves_unknown");
  } else if (liquidity.marketPhase === "migrated") {
    if (liquidity.migratedPoolLiquiditySol === undefined) watch.push("migrated_pool_liquidity_unknown");
    if (liquidity.lpBurnedPct === undefined && liquidity.lpLockedPct === undefined) watch.push("lp_lock_or_burn_status_unknown");
  } else watch.push("liquidity_phase_unknown");
  if (holders.top10Pct > c.maxTop10HolderPct) hard.push("top10_holder_concentration_too_high");
  if (holders.creatorLinkedCurrentPct > c.maxCreatorLinkedPct) hard.push("creator_linked_holdings_too_high");
  if (holders.suspectedClusterCurrentPct > c.maxClusterHoldingsPct) hard.push("suspected_cluster_holdings_too_high");
  if (bundles.confidence >= 0.8 && bundles.currentHoldingsSupplyPct > c.maxClusterHoldingsPct)
    hard.push("high_confidence_bundle_holdings_too_high");
  if (bundles.sameSlotOnly) watch.push("same_slot_signal_not_proof_of_bundle");
  if (r.mintAuthorityRevoked === false) hard.push("mint_authority_still_enabled");
  if (r.freezeAuthorityRevoked === false) hard.push("freeze_authority_still_enabled");
  if (r.creatorSoldPct !== null && r.creatorSoldPct > 5) hard.push("creator_selling_detected");
  if (r.largestHolderSelling === true) hard.push("largest_holder_selling");
  if (r.failedTransactionRatePct !== null && r.failedTransactionRatePct > c.maxFailedTxRatePct)
    hard.push("failed_transaction_rate_too_high");
  if (r.liquidityWithdrawalDetected === true) hard.push("liquidity_withdrawal_detected");
  if (r.volumeConcentrationTopWalletPct !== null && r.volumeConcentrationTopWalletPct > 60)
    watch.push("volume_concentrated_in_few_wallets");
}
export function evaluateEntry(s: MarketSnapshot, config: StrategyConfig = DEFAULT_CONFIG): Decision {
  const reasons: string[] = [], hardRejects: string[] = [];
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
  applyRiskGate(s.riskAssessment, s, config, hardRejects, reasons);
  if (hardRejects.length) return { mint:s.mint, action:"reject", score:0, reasons:[...new Set(hardRejects)], strategyVersion:STRATEGY_VERSION, timestampMs:s.timestampMs, snapshot:s };
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
  if (!reasons.length && score < config.minScore) reasons.push("score_below_entry_threshold");
  if (!reasons.length) {
    const estimatedGrossMovePct = Math.max(0, s.impulsePct * 0.25);
    const conservativeNetEdgePct = estimatedGrossMovePct - s.estimatedRoundTripFeePct - s.estimatedEntryImpactPct - s.estimatedExitImpactPct;
    if (conservativeNetEdgePct < config.minNetEdgePct) reasons.push("net_edge_after_costs_too_small");
  }
  return { mint:s.mint, action:reasons.length ? "watch" : "buy", score, reasons:[...new Set(reasons)], strategyVersion:STRATEGY_VERSION, timestampMs:s.timestampMs, snapshot:s };
}