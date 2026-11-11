import test from "node:test";
import assert from "node:assert/strict";
import { PaperTradingRuntime } from "./paper-runtime.js";
import type { MarketSnapshotPipelineInput } from "./market-snapshot-pipeline.js";

function frame(timestampMs: number): MarketSnapshotPipelineInput {
  const shift = timestampMs - 10_000;
  const swaps = [
    ["a", 6_500], ["b", 7_000], ["c", 7_500],
    ["d", 8_500], ["e", 9_000], ["f", 9_500]
  ].map(([wallet, time]) => ({
    wallet: String(wallet), side: "buy" as const, timestampMs: Number(time) + shift,
    tokenAmountRaw: "100", quoteAmount: 1
  }));
  return {
    observedAtMs: timestampMs,
    snapshot: {
      mint: "runtime-test", timestampMs, phase: "bonding_curve", ageSeconds: 15 + shift / 1000,
      impulsePct: 25, secondsSinceImpulse: 2, pullbackFraction: 0.2,
      higherLowConfirmed: true, pivotReclaimed: true, pivotReclaimPct: 1.5,
      independentBuyers10s: 6, estimatedEntryImpactPct: 0.5, estimatedExitImpactPct: 0.5,
      estimatedRoundTripFeePct: 1, estimatedNetworkCostSol: 0.00001,
      exitRouteAvailable: true, creatorDistributing: false, suspiciousClusterDominance: false,
      sameSlotRoundTripDominance: false, dataFresh: true, marketStateVerified: true,
      priceQuote: 0.01, liquidityQuote: 200, buyVolumeQuote10s: 20, sellVolumeQuote10s: 2
    },
    swaps, creatorWallet: "creator", creatorLifecycleSwaps: [],
    creatorLaunchAtMs: timestampMs - 1_000, creatorInitialAllocationRaw: "1000",
    creatorLifecycleHistoryComplete: true, relatedWallets: [], relatedClusterConfidence: 0.9,
    currentHoldingsByWallet: {}, supplyRaw: "1000000000",
    historyComplete: true, holdingsComplete: true,
    quoteAsset: {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC", decimals: 6, kind: "stable", solPerUnit: 0.005,
      conversionVerified: true, transferTaxPct: 0
    },
    quoteAssetMetadataVerified: true, quoteAssetObservedAtMs: timestampMs,
    tokenTaxMetadataVerified: true, tokenTaxObservedAtMs: timestampMs,
    buyTransferTaxPct: 0, sellTransferTaxPct: 0
  };
}

test("runtime queues BUY and opens only on the next completed one-second frame", () => {
  const runtime = new PaperTradingRuntime();
  const first = runtime.onMarketFrame(frame(10_000));
  assert.equal(first.decision.action, "buy");
  assert.equal(first.opened, false);
  assert.deepEqual(runtime.getPendingMints(), ["runtime-test"]);

  const second = runtime.onMarketFrame(frame(11_000));
  assert.equal(second.opened, true);
  assert.equal(second.state.openPositions.length, 1);
  assert.deepEqual(runtime.getPendingMints(), []);
});

test("runtime does not queue entries when any required evidence is incomplete", () => {
  const runtime = new PaperTradingRuntime();
  const input = frame(10_000);
  input.tokenTaxMetadataVerified = false;
  const result = runtime.onMarketFrame(input);
  assert.equal(result.decision.action, "watch");
  assert.deepEqual(runtime.getPendingMints(), []);
  assert.equal(result.state.openPositions.length, 0);
});
