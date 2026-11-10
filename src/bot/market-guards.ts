import type { CreatorRiskAssessment, FlowPersistenceAssessment, TokenEconomicsAssessment } from "./types.js";

export type MarketGuardConfig = {
  minPersistentWindows: number;
  windowDurationMs: number;
  windowStrideMs: number;
  maxWindowGapMs: number;
  maxCreatorSellSupplyPct60s: number;
  maxCreatorLinkedSellSupplyPct60s: number;
  maxRelatedWalletSellSupplyPct60s: number;
  maxRelatedWalletBuyShare30s: number;
  maxRelatedWalletHoldingsSupplyPct: number;
  minClusterConfidence: number;
  minDistinctBuyersAcrossWindows: number;
  maxTransferTaxEachSidePct: number;
  maxEffectiveRoundTripCostPct: number;
};

export const DEFAULT_MARKET_GUARD_CONFIG: MarketGuardConfig = {
  minPersistentWindows: 3,
  windowDurationMs: 2_000,
  windowStrideMs: 1_000,
  maxWindowGapMs: 250,
  maxCreatorSellSupplyPct60s: 0.05,
  maxCreatorLinkedSellSupplyPct60s: 0.25,
  maxRelatedWalletSellSupplyPct60s: 0.25,
  maxRelatedWalletBuyShare30s: 35,
  maxRelatedWalletHoldingsSupplyPct: 20,
  minClusterConfidence: 0.7,
  minDistinctBuyersAcrossWindows: 5,
  maxTransferTaxEachSidePct: 2,
  maxEffectiveRoundTripCostPct: 4
};

export type GuardResult = { reject: string[]; watch: string[] };

export function evaluateCreatorAndClusterRisk(
  risk: CreatorRiskAssessment | undefined,
  legacyCreatorDistributing: boolean,
  legacyClusterDominance: boolean,
  nowMs: number,
  config: MarketGuardConfig = DEFAULT_MARKET_GUARD_CONFIG
): GuardResult {
  const reject: string[] = [], watch: string[] = [];
  if (legacyCreatorDistributing) reject.push("creator_wallet_distribution_detected");
  if (legacyClusterDominance) reject.push("suspicious_cluster_dominance_detected");
  if (!risk || risk.status !== "verified") {
    watch.push("creator_and_related_wallet_evidence_not_verified");
    return { reject, watch };
  }
  if (!risk.creatorWalletKnown) watch.push("creator_wallet_identity_not_verified");
  if (nowMs - risk.observedAtMs < 0 || nowMs - risk.observedAtMs > 15_000)
    watch.push("creator_and_cluster_evidence_stale");
  const values = [
    risk.creatorSellSupplyPct60s, risk.creatorLinkedSellSupplyPct60s,
    risk.relatedWalletSellSupplyPct60s, risk.relatedWalletBuyShare30s, risk.relatedWalletHoldingsSupplyPct, risk.clusterConfidence
  ];
  if (values.some(v => !Number.isFinite(v) || v < 0 || v > 100) ||
      risk.clusterConfidence < 0 || risk.clusterConfidence > 1) {
    watch.push("creator_or_cluster_metrics_invalid");
    return { reject, watch };
  }
  if (risk.creatorSellSupplyPct60s > config.maxCreatorSellSupplyPct60s)
    reject.push("creator_wallet_sold_tokens_recently");
  if (risk.creatorLinkedSellSupplyPct60s > config.maxCreatorLinkedSellSupplyPct60s)
    reject.push("creator_linked_wallets_sold_tokens_recently");
  if (risk.relatedWalletSellSupplyPct60s > config.maxRelatedWalletSellSupplyPct60s) {
    if (highConfidence) reject.push("related_wallet_cluster_sold_tokens_recently");
    else watch.push("possible_related_wallet_cluster_selling_needs_confirmation");
  }

  const highConfidence = risk.clusterConfidence >= config.minClusterConfidence;
  if (highConfidence && risk.relatedWalletBuyShare30s > config.maxRelatedWalletBuyShare30s)
    reject.push("related_wallets_dominate_recent_buy_volume");
  else if (risk.relatedWalletBuyShare30s > config.maxRelatedWalletBuyShare30s)
    watch.push("possible_related_wallet_buy_concentration_needs_confirmation");
  if (highConfidence && risk.relatedWalletHoldingsSupplyPct > config.maxRelatedWalletHoldingsSupplyPct)
    reject.push("related_wallets_hold_too_much_token_supply");
  else if (risk.relatedWalletHoldingsSupplyPct > config.maxRelatedWalletHoldingsSupplyPct)
    watch.push("possible_related_wallet_holder_concentration_needs_confirmation");
  return { reject, watch };
}

export function evaluatePersistentBuyingPressure(
  flow: FlowPersistenceAssessment | undefined,
  nowMs: number,
  config: MarketGuardConfig = DEFAULT_MARKET_GUARD_CONFIG
): GuardResult {
  const reject: string[] = [], watch: string[] = [];
  if (!flow || flow.status !== "verified") {
    watch.push("multi_window_buying_pressure_not_verified");
    return { reject, watch };
  }
  if (nowMs - flow.observedAtMs < 0 || nowMs - flow.observedAtMs > 2_500)
    watch.push("multi_window_buying_pressure_stale");
  if (flow.windows.length < config.minPersistentWindows) {
    watch.push("insufficient_consecutive_buying_windows");
    return { reject, watch };
  }
  const windows = flow.windows.slice(-config.minPersistentWindows);
  let valid = true;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    if (w.endMs - w.startMs !== config.windowDurationMs ||
        w.endMs > nowMs + 250 || w.startMs < 0 ||
        ![w.buyQuote, w.sellQuote, w.largestBuyerShare].every(Number.isFinite) ||
        w.buyQuote < 0 || w.sellQuote < 0 ||
        !Number.isInteger(w.uniqueBuyers) || !Number.isInteger(w.uniqueSellers) ||
        w.uniqueBuyers < 0 || w.uniqueSellers < 0 ||
        w.largestBuyerShare < 0 || w.largestBuyerShare > 1 ||
        w.buyerWallets.length !== w.uniqueBuyers ||
        new Set(w.buyerWallets).size !== w.buyerWallets.length) {
      valid = false;
      break;
    }
    if (i > 0 && (
      Math.abs((w.startMs - windows[i - 1]!.startMs) - config.windowStrideMs) > config.maxWindowGapMs ||
      Math.abs((w.endMs - windows[i - 1]!.endMs) - config.windowStrideMs) > config.maxWindowGapMs
    )) {
      valid = false;
      break;
    }
    if (!(w.buyQuote > 3 * w.sellQuote) || w.uniqueBuyers < 3 ||
        w.uniqueSellers > w.uniqueBuyers * 0.5 || w.largestBuyerShare > 0.72) {
      watch.push(`buying_pressure_window_${i + 1}_failed`);
    }
  }
  if (!valid) watch.push("multi_window_data_invalid_or_windows_not_consecutive");
  const distinctBuyers = new Set(windows.flatMap(w => w.buyerWallets));
  if (distinctBuyers.size < config.minDistinctBuyersAcrossWindows)
    watch.push("too_few_distinct_buyers_across_persistence_windows");
  return { reject, watch };
}

/** Combines already-computed round-trip venue/impact costs with token and quote transfer taxes.
 * All inputs/outputs are percentage points (e.g. 1.25 means 1.25%). */
export function calculateEffectiveRoundTripCostPct(input: {
  baseRoundTripCostPct: number;
  tokenBuyTaxPct: number;
  tokenSellTaxPct: number;
  quoteTransferTaxPct: number;
}): number {
  const values = Object.values(input);
  if (values.some(v => !Number.isFinite(v) || v < 0 || v >= 100))
    throw new Error("cost percentages must be finite and in [0, 100)");
  const retained =
    (1 - input.baseRoundTripCostPct / 100) *
    (1 - input.tokenBuyTaxPct / 100) *
    (1 - input.tokenSellTaxPct / 100) *
    Math.pow(1 - input.quoteTransferTaxPct / 100, 2);
  return (1 - retained) * 100;
}

export function evaluateTokenEconomics(
  economics: TokenEconomicsAssessment | undefined,
  baseRoundTripCostPct: number,
  nowMs: number,
  config: MarketGuardConfig = DEFAULT_MARKET_GUARD_CONFIG
): GuardResult & { effectiveRoundTripCostPct?: number } {
  const reject: string[] = [], watch: string[] = [];
  if (!economics || economics.status !== "verified") {
    watch.push("token_transfer_tax_or_quote_asset_not_verified");
    return { reject, watch };
  }
  if (nowMs - economics.observedAtMs < 0 || nowMs - economics.observedAtMs > 15_000)
    watch.push("token_economics_evidence_stale");
  const q = economics.quoteAsset;
  if (!q.mint || !q.symbol || !Number.isInteger(q.decimals) || q.decimals < 0 ||
      !["native","stable","other"].includes(q.kind) ||
      !Number.isFinite(q.solPerUnit) || q.solPerUnit <= 0 || !q.conversionVerified ||
      (q.kind === "native" && (Math.abs(q.solPerUnit - 1) > 0.000001 || !["SOL","WSOL"].includes(q.symbol))) ||
      !Number.isFinite(q.transferTaxPct) || q.transferTaxPct < 0 || q.transferTaxPct >= 100) {
    watch.push("quote_asset_identity_or_sol_conversion_unverified");
  }
  const taxes = [economics.buyTransferTaxPct, economics.sellTransferTaxPct];
  if (taxes.some(v => !Number.isFinite(v) || v < 0 || v >= 100)) {
    watch.push("token_transfer_tax_metrics_invalid");
    return { reject, watch };
  }
  if (economics.buyTransferTaxPct > config.maxTransferTaxEachSidePct ||
      economics.sellTransferTaxPct > config.maxTransferTaxEachSidePct)
    reject.push("token_transfer_tax_exceeds_configured_limit");
  if (watch.length) return { reject, watch };
  const effectiveRoundTripCostPct = calculateEffectiveRoundTripCostPct({
    baseRoundTripCostPct,
    tokenBuyTaxPct: economics.buyTransferTaxPct,
    tokenSellTaxPct: economics.sellTransferTaxPct,
    quoteTransferTaxPct: q.transferTaxPct
  });
  if (effectiveRoundTripCostPct > config.maxEffectiveRoundTripCostPct)
    reject.push("effective_round_trip_cost_including_transfer_taxes_too_high");
  return { reject, watch, effectiveRoundTripCostPct };
}


/** Convert a quote-denominated amount into SOL using a fresh verified oracle rate. */
export function quoteUnitsToSol(amountQuote: number, quoteAsset: TokenEconomicsAssessment["quoteAsset"]): number {
  if (!Number.isFinite(amountQuote) || amountQuote < 0 ||
      !quoteAsset.conversionVerified || !Number.isFinite(quoteAsset.solPerUnit) ||
      quoteAsset.solPerUnit <= 0)
    throw new Error("quote amount cannot be normalized without a verified quote-to-SOL rate");
  if (quoteAsset.kind === "native" &&
      (Math.abs(quoteAsset.solPerUnit - 1) > 0.000001 || !["SOL","WSOL"].includes(quoteAsset.symbol)))
    throw new Error("native quote asset must normalize one-to-one into SOL");
  return amountQuote * quoteAsset.solPerUnit;
}

/** Convert a token price expressed in quote units per token into SOL per token. */
export function quotePriceToSol(priceQuote: number, quoteAsset: TokenEconomicsAssessment["quoteAsset"]): number {
  return quoteUnitsToSol(priceQuote, quoteAsset);
}
