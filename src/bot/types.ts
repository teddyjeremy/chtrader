export type MarketPhase = "bonding_curve" | "migrating" | "migrated" | "unknown";
export type DecisionAction = "reject" | "watch" | "buy" | "hold" | "sell";
export type MarketSnapshot = {
  mint: string; timestampMs: number; phase: MarketPhase; ageSeconds: number;
  priceSol: number; impulsePct: number; secondsSinceImpulse: number; pullbackFraction: number;
  higherLowConfirmed: boolean; pivotReclaimed: boolean; independentBuyers10s: number;
  buyVolumeSol10s: number; sellVolumeSol10s: number; liquiditySol: number;
  estimatedEntryImpactPct: number; estimatedExitImpactPct: number;
  estimatedRoundTripFeePct: number; estimatedNetworkCostSol: number;
  exitRouteAvailable: boolean; creatorDistributing: boolean;
  suspiciousClusterDominance: boolean; sameSlotRoundTripDominance: boolean;
  dataFresh: boolean; marketStateVerified: boolean;
};
export type Decision = {
  mint: string; action: DecisionAction; score: number; reasons: string[];
  strategyVersion: "pullback-reclaim-v0.1"; timestampMs: number; snapshot: MarketSnapshot;
};
export type PaperPosition = {
  mint: string; entryPriceSol: number; quantity: number; notionalSol: number;
  openedAtMs: number; stopPriceSol: number; takeProfitPriceSol: number;
  highestPriceSol: number; entryCostSol: number;
};
export type ClosedPaperTrade = {
  mint: string; openedAtMs: number; closedAtMs: number; entryPriceSol: number;
  exitPriceSol: number; quantity: number; grossPnlSol: number;
  estimatedCostsSol: number; netPnlSol: number; exitReason: string;
};