import type { MarketSnapshot, QuoteAssetMetadata, TokenEconomicsAssessment } from "./types.js";
import { buildCreatorRiskAssessment, buildFlowPersistenceAssessment } from "./market-guard-builders.js";
import type { MarketSwapEvent } from "./market-guard-builders.js";
import { quotePriceToSol, quoteUnitsToSol } from "./market-guards.js";

/**
 * Input at the boundary between a parsed Helius/RPC feed and the strategy.
 * Quote-denominated prices, liquidity and volume are converted here; callers
 * must never label quote units as SOL themselves.
 */
type SnapshotWithoutDerivedEvidence = Omit<
  MarketSnapshot,
  | "priceSol" | "liquiditySol" | "buyVolumeSol10s" | "sellVolumeSol10s"
  | "buyQuoteVolume2s" | "sellQuoteVolume2s" | "uniqueBuyers2s"
  | "uniqueSellers2s" | "largestBuyerShare2s"
  | "creatorRisk" | "flowPersistence" | "tokenEconomics"
>;

export type MarketSnapshotPipelineInput = {
  snapshot: SnapshotWithoutDerivedEvidence & {
    priceQuote: number;
    liquidityQuote: number;
    buyVolumeQuote10s: number;
    sellVolumeQuote10s: number;
  };
  observedAtMs: number;
  swaps: MarketSwapEvent[];
  creatorWallet: string | null;
  relatedWallets: string[];
  relatedClusterConfidence: number;
  currentHoldingsByWallet: Record<string, string>;
  supplyRaw: string;
  historyComplete: boolean;
  holdingsComplete: boolean;
  quoteAsset: QuoteAssetMetadata;
  quoteAssetMetadataVerified: boolean;
  quoteAssetObservedAtMs: number;
  tokenTaxMetadataVerified: boolean;
  tokenTaxObservedAtMs: number;
  buyTransferTaxPct: number;
  sellTransferTaxPct: number;
};

const MAX_EVIDENCE_AGE_MS = 15_000;

function fresh(observedAtMs: number, evidenceAtMs: number): boolean {
  return Number.isFinite(evidenceAtMs) &&
    evidenceAtMs <= observedAtMs &&
    observedAtMs - evidenceAtMs <= MAX_EVIDENCE_AGE_MS;
}

function validQuoteMetrics(values: number[]): boolean {
  return values.every(value => Number.isFinite(value) && value >= 0);
}

function validSwapHistory(swaps: MarketSwapEvent[], observedAtMs: number): boolean {
  return swaps.every(s =>
    typeof s.wallet === "string" && s.wallet.length > 0 &&
    (s.side === "buy" || s.side === "sell") &&
    Number.isSafeInteger(s.timestampMs) && s.timestampMs <= observedAtMs &&
    typeof s.tokenAmountRaw === "string" && /^\\d+$/.test(s.tokenAmountRaw) &&
    Number.isFinite(s.quoteAmount) && s.quoteAmount >= 0
  );
}

/**
 * The only supported constructor for a strategy-ready snapshot.
 * Incomplete attribution, event history, quote conversion or tax metadata
 * is explicitly marked partial so evaluateEntry returns WATCH, not BUY.
 */
export function buildMarketSnapshot(input: MarketSnapshotPipelineInput): MarketSnapshot {
  const { snapshot, observedAtMs } = input;
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0)
    throw new Error("observedAtMs must be a non-negative integer");
  if (snapshot.timestampMs !== observedAtMs)
    throw new Error("snapshot timestamp must match the evidence observation time");

  const quoteFresh = fresh(observedAtMs, input.quoteAssetObservedAtMs);
  const taxFresh = fresh(observedAtMs, input.tokenTaxObservedAtMs);
  const quote = input.quoteAsset;
  const quoteValid = input.quoteAssetMetadataVerified && quoteFresh &&
    !!quote.mint && !!quote.symbol &&
    Number.isInteger(quote.decimals) && quote.decimals >= 0 &&
    Number.isFinite(quote.solPerUnit) && quote.solPerUnit > 0 &&
    quote.conversionVerified &&
    Number.isFinite(quote.transferTaxPct) && quote.transferTaxPct >= 0 && quote.transferTaxPct < 100 &&
    (quote.kind !== "native" || (Math.abs(quote.solPerUnit - 1) <= 0.000001 && ["SOL", "WSOL"].includes(quote.symbol)));

  const quoteMetrics = [
    snapshot.priceQuote, snapshot.liquidityQuote,
    snapshot.buyVolumeQuote10s, snapshot.sellVolumeQuote10s
  ];
  const normalized = quoteValid && validQuoteMetrics(quoteMetrics) && snapshot.priceQuote > 0;
  const priceSol = normalized ? quotePriceToSol(snapshot.priceQuote, quote) : 0;
  const liquiditySol = normalized ? quoteUnitsToSol(snapshot.liquidityQuote, quote) : 0;
  const buyVolumeSol10s = normalized ? quoteUnitsToSol(snapshot.buyVolumeQuote10s, quote) : 0;
  const sellVolumeSol10s = normalized ? quoteUnitsToSol(snapshot.sellVolumeQuote10s, quote) : 0;

  const historyValid = validSwapHistory(input.swaps, observedAtMs);
  const swaps = historyValid ? input.swaps : [];
  const flowPersistence = buildFlowPersistenceAssessment({
    swaps,
    observedAtMs,
    historyComplete: input.historyComplete && historyValid
  });
  const creatorRisk = buildCreatorRiskAssessment({
    swaps,
    creatorWallet: input.creatorWallet,
    relatedWallets: input.relatedWallets,
    relatedClusterConfidence: input.relatedClusterConfidence,
    currentHoldingsByWallet: input.currentHoldingsByWallet,
    supplyRaw: input.supplyRaw,
    observedAtMs,
    historyComplete: input.historyComplete && historyValid,
    holdingsComplete: input.holdingsComplete
  });

  const taxValuesValid = [input.buyTransferTaxPct, input.sellTransferTaxPct]
    .every(value => Number.isFinite(value) && value >= 0 && value < 100);
  const economicsVerified = quoteValid && input.tokenTaxMetadataVerified && taxFresh &&
    taxValuesValid;
  const tokenEconomics: TokenEconomicsAssessment = {
    status: economicsVerified ? "verified" : "partial",
    observedAtMs,
    buyTransferTaxPct: taxValuesValid ? input.buyTransferTaxPct : 0,
    sellTransferTaxPct: taxValuesValid ? input.sellTransferTaxPct : 0,
    quoteAsset: quote
  };

  const latestFlow = flowPersistence.windows.at(-1);
  const marketDataFresh = snapshot.dataFresh &&
    fresh(observedAtMs, snapshot.timestampMs) && normalized;

  return {
    ...snapshot,
    priceSol,
    liquiditySol,
    buyVolumeSol10s,
    sellVolumeSol10s,
    buyQuoteVolume2s: latestFlow?.buyQuote,
    sellQuoteVolume2s: latestFlow?.sellQuote,
    uniqueBuyers2s: latestFlow?.uniqueBuyers,
    uniqueSellers2s: latestFlow?.uniqueSellers,
    largestBuyerShare2s: latestFlow?.largestBuyerShare,
    dataFresh: marketDataFresh,
    marketStateVerified: snapshot.marketStateVerified && normalized,
    creatorRisk,
    flowPersistence,
    tokenEconomics
  };
}
