export type PullbackFeatures = {
  priorImpulsePct: number;
  retracementPct: number;
  distanceToSupportPct: number;
  buySellNotionalRatio: number;
  uniqueBuyerChangePct: number;
  liquidityChangePct: number;
  topFiveBuyerSharePct: number;
  creatorNetSellPctOfSupply: number;
  suspiciousRoundTripVolumePct: number;
  higherLowConfirmed: boolean;
  reclaimedLocalPivot: boolean;
  exitRouteVerified: boolean;
  netEdgePositive: boolean;
};

export type StrategyDecision = {
  setup: "pullback_reclaim";
  eligible: boolean;
  score: number;
  reasons: string[];
  rejections: string[];
};

export function scorePullbackRecovery(f: PullbackFeatures): StrategyDecision {
  const reasons: string[] = [];
  const rejections: string[] = [];
  let score = 0;

  // Provisional thresholds. October evidence must validate or replace them.
  if (f.priorImpulsePct >= 12 && f.priorImpulsePct <= 120) score += 10;
  else rejections.push("No sufficiently clear prior impulse.");

  if (f.retracementPct >= 15 && f.retracementPct <= 55) score += 10;
  else rejections.push("Pullback depth is outside the initial test range.");

  if (f.distanceToSupportPct >= -2 && f.distanceToSupportPct <= 5) {
    score += 10; reasons.push("Price is holding near the defined support zone.");
  } else rejections.push("Price has lost or is too far from the support zone.");

  if (f.buySellNotionalRatio >= 1.15) score += 15;
  else rejections.push("Buy notional has not recovered relative to sell notional.");

  if (f.uniqueBuyerChangePct >= 10) score += 10;
  else rejections.push("Independent buyer breadth is not expanding.");

  if (f.liquidityChangePct >= -5) score += 15;
  else rejections.push("Liquidity/reserves have deteriorated too much.");

  if (f.topFiveBuyerSharePct <= 45) score += 10;
  else rejections.push("Activity is too concentrated among the top five buyers.");

  if (f.creatorNetSellPctOfSupply <= 0.25) score += 10;
  else rejections.push("Creator-linked net selling exceeds the initial limit.");

  if (f.suspiciousRoundTripVolumePct <= 10) score += 5;
  else rejections.push("Suspicious round-trip volume is elevated.");

  if (f.higherLowConfirmed) { score += 3; reasons.push("A higher low is confirmed."); }
  else rejections.push("No confirmed higher low.");

  if (f.reclaimedLocalPivot) { score += 2; reasons.push("Price reclaimed the local pivot."); }
  else rejections.push("No local-pivot reclaim.");

  if (!f.exitRouteVerified) rejections.push("A viable exit route has not been verified.");
  if (!f.netEdgePositive) rejections.push("Expected net edge is not positive after costs.");

  const eligible = rejections.length === 0 && score >= 85;
  if (eligible) reasons.push("All hard gates pass and the initial score threshold is met.");
  return { setup: "pullback_reclaim", eligible, score, reasons, rejections };
}
