import type {
  CreatorRiskAssessment, FlowPersistenceAssessment, FlowPersistenceWindow, AssessmentStatus
} from "./types.js";

export type MarketSwapEvent = {
  wallet: string;
  side: "buy" | "sell";
  timestampMs: number;
  tokenAmountRaw: string;
  /** Positive quote-asset amount, normalized to quote-token units (not USD unless quote is USD). */
  quoteAmount: number;
  creatorWallet?: boolean;
  creatorLinked?: boolean;
  relatedWallet?: boolean;
};

function supplyPct(amount: bigint, supply: bigint): number {
  return supply > 0n ? Number(amount * 1_000_000n / supply) / 10_000 : 0;
}

/** Builds three consecutive completed 2-second flow windows from parsed swap events. */
export function buildFlowPersistenceAssessment(input: {
  swaps: MarketSwapEvent[];
  observedAtMs: number;
  historyComplete: boolean;
}): FlowPersistenceAssessment {
  const windowMs = 2_000;
  const strideMs = 1_000;
  const latestEnd = Math.floor(input.observedAtMs / strideMs) * strideMs;
  const windows: FlowPersistenceWindow[] = [];
  for (let i = 2; i >= 0; i--) {
    const endMs = latestEnd - i * strideMs;
    const startMs = endMs - windowMs;
    const events = input.swaps.filter(s => s.timestampMs >= startMs && s.timestampMs < endMs);
    const buys = events.filter(s => s.side === "buy");
    const sells = events.filter(s => s.side === "sell");
    const buyerQuote = new Map<string, number>();
    for (const b of buys) buyerQuote.set(b.wallet, (buyerQuote.get(b.wallet) ?? 0) + b.quoteAmount);
    const totalBuy = buys.reduce((n, b) => n + b.quoteAmount, 0);
    const totalSell = sells.reduce((n, s) => n + s.quoteAmount, 0);
    const buyerWallets = [...new Set(buys.map(b => b.wallet))].sort();
    const largestBuyerShare = totalBuy > 0
      ? Math.max(0, ...buyerQuote.values()) / totalBuy
      : 0;
    windows.push({
      startMs, endMs, buyQuote: totalBuy, sellQuote: totalSell,
      uniqueBuyers: buyerWallets.length,
      uniqueSellers: new Set(sells.map(s => s.wallet)).size,
      largestBuyerShare, buyerWallets
    });
  }
  const status: AssessmentStatus = input.historyComplete ? "verified" : "partial";
  return { status, observedAtMs: input.observedAtMs, windows };
}

/** Builds creator/related-wallet sale and concentration metrics from verified attribution. */
export function buildCreatorRiskAssessment(input: {
  swaps: MarketSwapEvent[];
  creatorWallet: string | null;
  relatedWallets: string[];
  relatedClusterConfidence: number;
  currentHoldingsByWallet: Record<string, string>;
  supplyRaw: string;
  observedAtMs: number;
  historyComplete: boolean;
  holdingsComplete: boolean;
}): CreatorRiskAssessment {
  const supply = BigInt(input.supplyRaw);
  if (supply <= 0n) throw new Error("supplyRaw must be positive");
  const creator = input.creatorWallet;
  const related = new Set(input.relatedWallets);
  const from60s = input.swaps.filter(s => s.timestampMs > input.observedAtMs - 60_000 && s.timestampMs <= input.observedAtMs);
  const from30s = input.swaps.filter(s => s.timestampMs > input.observedAtMs - 30_000 && s.timestampMs <= input.observedAtMs);
  const creatorSells = from60s.filter(s => s.side === "sell" && creator && s.wallet === creator);
  const linkedSells = from60s.filter(s => s.side === "sell" && s.creatorLinked && (!creator || s.wallet !== creator));
  const relatedSells = from60s.filter(s => s.side === "sell" && related.has(s.wallet));
  const creatorSold = creatorSells.reduce((n, s) => n + BigInt(s.tokenAmountRaw), 0n);
  const linkedSold = linkedSells.reduce((n, s) => n + BigInt(s.tokenAmountRaw), 0n);
  const relatedSold = relatedSells.reduce((n, s) => n + BigInt(s.tokenAmountRaw), 0n);
  const buys = from30s.filter(s => s.side === "buy");
  const totalBuyQuote = buys.reduce((n, s) => n + s.quoteAmount, 0);
  const relatedBuyQuote = buys.filter(s => related.has(s.wallet) || s.relatedWallet)
    .reduce((n, s) => n + s.quoteAmount, 0);
  const relatedHoldings = [...related].reduce(
    (n, wallet) => n + BigInt(input.currentHoldingsByWallet[wallet] ?? "0"), 0n
  );
  const status: AssessmentStatus = input.historyComplete && input.holdingsComplete && !!creator
    ? "verified" : "partial";
  return {
    status,
    observedAtMs: input.observedAtMs,
    creatorWalletKnown: !!creator,
    creatorSellSupplyPct60s: supplyPct(creatorSold, supply),
    creatorLinkedSellSupplyPct60s: supplyPct(linkedSold, supply),
    relatedWalletSellSupplyPct60s: supplyPct(relatedSold, supply),
    relatedWalletBuyShare30s: totalBuyQuote > 0 ? relatedBuyQuote / totalBuyQuote * 100 : 0,
    relatedWalletHoldingsSupplyPct: supplyPct(relatedHoldings, supply),
    clusterConfidence: Number.isFinite(input.relatedClusterConfidence)
      ? Math.min(1, Math.max(0, input.relatedClusterConfidence)) : 0
  };
}
