export type MarketPhase = "bonding_curve" | "migrating" | "migrated" | "unknown";
export type DecisionAction = "reject" | "watch" | "buy" | "hold" | "sell";
export type AssessmentStatus = "verified" | "partial" | "unknown";
export type EvidenceSource = "helius" | "rpc" | "derived";
export type EvidenceMeta = { status: AssessmentStatus; source: EvidenceSource[]; observedAtMs: number; staleAfterMs: number; notes: string[] };
export type LiquidityAssessment = EvidenceMeta & {
  marketPhase: MarketPhase;
  curveVirtualSolReserves?: number;
  curveRealSolReserves?: number;
  curveTokenReserves?: number;
  migratedPoolLiquiditySol?: number;
  lpBurnedPct?: number;
  lpLockedPct?: number;
  lpUnlockAtMs?: number | null;
  lpAuthorityRevoked?: boolean;
  estimatedExitImpactPct?: number;
  exitCapacitySol?: number;
};
export type HolderDistribution = EvidenceMeta & {
  supplyRaw: string;
  decimals: number;
  top1Pct: number; top5Pct: number; top10Pct: number; top20Pct: number;
  creatorCurrentPct: number; creatorLinkedCurrentPct: number;
  suspectedClusterCurrentPct: number; insiderCurrentPct: number;
  burnedPct: number; excludedAccountCount: number;
};
export type BundleAssessment = EvidenceMeta & {
  confidence: number;
  coordinatedWalletCount: number;
  acquiredSupplyPct: number;
  currentHoldingsSupplyPct: number;
  creatorLinkedWalletCount: number;
  sameTransactionWalletCount: number;
  commonFunderWalletCount: number;
  sameSlotOnly: boolean;
  signals: string[];
};
export type RiskAssessment = {
  status: AssessmentStatus;
  observedAtMs: number;
  liquidity: LiquidityAssessment;
  holders: HolderDistribution;
  bundles: BundleAssessment;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  creatorSoldPct: number | null;
  largestHolderSelling: boolean | null;
  buySellRatio10s: number | null;
  uniqueBuyers10s: number | null;
  failedTransactionRatePct: number | null;
  volumeConcentrationTopWalletPct: number | null;
  liquidityWithdrawalDetected: boolean | null;
  hardRiskFlags: string[];
  warnings: string[];
};
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
  riskAssessment?: RiskAssessment;
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