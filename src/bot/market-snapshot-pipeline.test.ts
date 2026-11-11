import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketSnapshot } from "./market-snapshot-pipeline.js";
import { evaluateEntry } from "./rules.js";
import type { MarketSnapshotPipelineInput } from "./market-snapshot-pipeline.js";

function input(): MarketSnapshotPipelineInput {
  const observedAtMs = 10_000;
  const swaps = [
    { wallet: "a", side: "buy" as const, timestampMs: 6_500, tokenAmountRaw: "100", quoteAmount: 1 },
    { wallet: "b", side: "buy" as const, timestampMs: 7_000, tokenAmountRaw: "100", quoteAmount: 1 },
    { wallet: "c", side: "buy" as const, timestampMs: 7_500, tokenAmountRaw: "100", quoteAmount: 1 },
    { wallet: "d", side: "buy" as const, timestampMs: 8_500, tokenAmountRaw: "100", quoteAmount: 1 },
    { wallet: "e", side: "buy" as const, timestampMs: 9_000, tokenAmountRaw: "100", quoteAmount: 1 },
    { wallet: "f", side: "buy" as const, timestampMs: 9_500, tokenAmountRaw: "100", quoteAmount: 1 }
  ];
  return {
    observedAtMs,
    snapshot: {
      mint: "pipeline-test", timestampMs: observedAtMs, phase: "bonding_curve", ageSeconds: 15,
      impulsePct: 25, secondsSinceImpulse: 2, pullbackFraction: 0.2,
      higherLowConfirmed: true, pivotReclaimed: true, pivotReclaimPct: 1.5,
      independentBuyers10s: 6, estimatedEntryImpactPct: 0.5, estimatedExitImpactPct: 0.5,
      estimatedRoundTripFeePct: 1, estimatedNetworkCostSol: 0.00001,
      exitRouteAvailable: true, creatorDistributing: false, suspiciousClusterDominance: false,
      sameSlotRoundTripDominance: false, dataFresh: true, marketStateVerified: true,
      priceQuote: 0.01, liquidityQuote: 200, buyVolumeQuote10s: 20, sellVolumeQuote10s: 2
    },
    swaps,
    creatorLifecycleSwaps: [],
    creatorLaunchAtMs: 9_000,
    creatorInitialAllocationRaw: "1000",
    creatorLifecycleHistoryComplete: true,
    creatorWallet: "creator",
    relatedWallets: [],
    relatedClusterConfidence: 0.9,
    currentHoldingsByWallet: {},
    supplyRaw: "1000000000",
    historyComplete: true,
    holdingsComplete: true,
    quoteAsset: {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC", decimals: 6, kind: "stable", solPerUnit: 0.005,
      conversionVerified: true, transferTaxPct: 0
    },
    quoteAssetMetadataVerified: true,
    quoteAssetObservedAtMs: observedAtMs,
    tokenTaxMetadataVerified: true,
    tokenTaxObservedAtMs: observedAtMs,
    buyTransferTaxPct: 0,
    sellTransferTaxPct: 0
  };
}

test("pipeline builds a strategy-ready snapshot and normalizes quote amounts to SOL", () => {
  const snapshot = buildMarketSnapshot(input());
  assert.equal(snapshot.priceSol, 0.00005);
  assert.equal(snapshot.liquiditySol, 1);
  assert.equal(snapshot.buyVolumeSol10s, 0.1);
  assert.equal(snapshot.sellVolumeSol10s, 0.01);
  assert.equal(snapshot.buyQuoteVolume2s, 3);
  assert.equal(snapshot.uniqueBuyers2s, 3);
  assert.equal(snapshot.creatorRisk?.status, "verified");
  assert.equal(snapshot.flowPersistence?.status, "verified");
  assert.equal(snapshot.tokenEconomics?.status, "verified");
  assert.equal(evaluateEntry(snapshot).action, "buy");
});

test("incomplete history, holder data or tax metadata fails closed to WATCH", () => {
  const value = input();
  value.historyComplete = false;
  value.holdingsComplete = false;
  value.creatorLifecycleHistoryComplete = false;
  value.tokenTaxMetadataVerified = false;
  const snapshot = buildMarketSnapshot(value);
  assert.equal(snapshot.creatorRisk?.status, "partial");
  assert.equal(snapshot.flowPersistence?.status, "partial");
  assert.equal(snapshot.tokenEconomics?.status, "partial");
  assert.equal(evaluateEntry(snapshot).action, "watch");
});

test("stale quote conversion cannot be presented as a valid SOL market snapshot", () => {
  const value = input();
  value.quoteAssetObservedAtMs = -1;
  const snapshot = buildMarketSnapshot(value);
  assert.equal(snapshot.marketStateVerified, false);
  assert.equal(snapshot.dataFresh, false);
  assert.equal(snapshot.priceSol, 0);
  assert.equal(evaluateEntry(snapshot).action, "reject");
});

test("malformed swap evidence cannot produce verified creator or flow assessments", () => {
  const value = input();
  value.swaps[0]!.quoteAmount = Number.NaN;
  const snapshot = buildMarketSnapshot(value);
  assert.equal(snapshot.creatorRisk?.status, "partial");
  assert.equal(snapshot.flowPersistence?.status, "partial");
  assert.equal(evaluateEntry(snapshot).action, "watch");
});
