export type MarketPhase = "bonding_curve" | "migrating" | "migrated" | "unknown";
export type DecisionAction = "reject" | "watch" | "buy" | "hold" | "sell";
export type AssessmentStatus = "verified" | "partial" | "unknown";
export type EvidenceSource = "helius" | "rpc" | "derived";
export type EvidenceMeta = { status: AssessmentStatus; source: EvidenceSource[]; observedAtMs: number; staleAfterMs: number; notes: string[] };
export type LiquidityAssessment = EvidenceMeta & {
  marketPhase: MarketPhase; curveVirtualSolReserves?: number; curveRealSolReserves?: number;
  curveTokenReserves?: number; migratedPoolLiquiditySol?: number; lpBurnedPct?: number;
  lpLockedPct?: number; lpUnlockAtMs?: number | null; lpAuthorityRevoked?: boolean;
  estimatedExitImpactPct?: number; exitCapacitySol?: number;
};
export type HolderDistribution = EvidenceMeta & {
  supplyRaw: string; decimals: number; top1Pct: number; top5Pct: number; top10Pct: number;
  top20Pct: number; creatorCurrentPct: number; creatorLinkedCurrentPct: number;
  suspectedClusterCurrentPct: number; insiderCurrentPct: number; burnedPct: number;
  excludedAccountCount: number;
};
export type BundleAssessment = EvidenceMeta & {
  confidence: number; coordinatedWalletCount: number; coordinatedWallets: string[]; acquiredSupplyPct: number;
  currentHoldingsSupplyPct: number; creatorLinkedWalletCount: number;
  sameTransactionWalletCount: number; commonFunderWalletCount: number;
  sameSlotOnly: boolean; signals: string[];
};
export type CreatorRiskAssessment = {
  status: AssessmentStatus;
  observedAtMs: number;
  creatorWalletKnown: boolean;
  creatorSellSupplyPct60s: number;
  creatorLinkedSellSupplyPct60s: number;
  relatedWalletSellSupplyPct60s: number;
  relatedWalletBuyShare30s: number;
  relatedWalletHoldingsSupplyPct: number;
  clusterConfidence: number;
};
export type FlowPersistenceWindow = {
  startMs: number; endMs: number; buyQuote: number; sellQuote: number;
  uniqueBuyers: number; uniqueSellers: number; largestBuyerShare: number;
  buyerWallets: string[];
};
export type FlowPersistenceAssessment = {
  status: AssessmentStatus; observedAtMs: number; windows: FlowPersistenceWindow[];
};
export type QuoteAssetMetadata = {
  mint: string; symbol: string; decimals: number;
  kind: "native" | "stable" | "other";
  solPerUnit: number;
  conversionVerified: boolean;
  transferTaxPct: number;
};
export type TokenEconomicsAssessment = {
  status: AssessmentStatus; observedAtMs: number;
  buyTransferTaxPct: number; sellTransferTaxPct: number;
  quoteAsset: QuoteAssetMetadata;
};
export type RiskAssessment = {
  status: AssessmentStatus; observedAtMs: number; liquidity: LiquidityAssessment;
  holders: HolderDistribution; bundles: BundleAssessment; mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null; creatorSoldPct: number | null;
  largestHolderSelling: boolean | null; buySellRatio10s: number | null;
  uniqueBuyers10s: number | null; failedTransactionRatePct: number | null;
  volumeConcentrationTopWalletPct: number | null; liquidityWithdrawalDetected: boolean | null;
  hardRiskFlags: string[]; warnings: string[];
};
export type MarketSnapshot = {
  mint: string; timestampMs: number; phase: MarketPhase; ageSeconds: number;
  priceSol: number; impulsePct: number; secondsSinceImpulse: number; pullbackFraction: number;
  higherLowConfirmed: boolean; pivotReclaimed: boolean; pivotReclaimPct?: number;
  independentBuyers10s: number; buyVolumeSol10s: number; sellVolumeSol10s: number;
  buyQuoteVolume2s?: number; sellQuoteVolume2s?: number;
  uniqueBuyers2s?: number; uniqueSellers2s?: number; largestBuyerShare2s?: number;
  liquiditySol: number; estimatedEntryImpactPct: number; estimatedExitImpactPct: number;
  estimatedRoundTripFeePct: number; estimatedNetworkCostSol: number;
  exitRouteAvailable: boolean; creatorDistributing: boolean;
  suspiciousClusterDominance: boolean; sameSlotRoundTripDominance: boolean;
  dataFresh: boolean; marketStateVerified: boolean; riskAssessment?: RiskAssessment;
  /** Verified creator/related-wallet attribution; absent or partial evidence forces WATCH. */
  creatorRisk?: CreatorRiskAssessment;
  /** Three completed 2-second rolling windows sampled one second apart. */
  flowPersistence?: FlowPersistenceAssessment;
  /** Current transfer-tax and quote-asset conversion metadata. */
  tokenEconomics?: TokenEconomicsAssessment;
};
export type Decision = {
  mint: string; action: DecisionAction; score: number; reasons: string[];
  strategyVersion: "pullback-reclaim-v0.2-risk-gated" | "pump-curve-entry-v1-adaptive-exit" | "pump-curve-entry-v2-persistent-risk-gated";
  timestampMs: number; snapshot: MarketSnapshot;
};
export type PaperPosition = {
  mint: string; entryPriceSol: number; quantity: number; notionalSol: number;
  openedAtMs: number; stopPriceSol: number; highestPriceSol: number; entryCostSol: number; roundTripCostPct: number;
};
export type ClosedPaperTrade = {
  mint: string; openedAtMs: number; closedAtMs: number; entryPriceSol: number;
  exitPriceSol: number; quantity: number; grossPnlSol: number;
  estimatedCostsSol: number; netPnlSol: number; exitReason: string;
};
