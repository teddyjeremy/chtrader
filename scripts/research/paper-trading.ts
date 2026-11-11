import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const ROOT = "data/pumpfun-stream";
const QUOTE_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "So11111111111111111111111111111111111111111"
]);
const TRADE_USD = 1;
const STARTING_EQUITY_USD = 8;
const MAX_OPEN_POSITIONS = 3;
const COINS_PER_PROCESSING_BATCH = 2;
// Conservative research assumptions, not a claim of the exact fee charged on every curve trade.
const PLATFORM_FEE_PER_SIDE = 0.01;
const SLIPPAGE_PER_SIDE = 0.005;
const NETWORK_FEE_USD_PER_SIDE = 0.001;

type Obj = Record<string, any>;
type Swap = {
  signature: string; timestamp: number; mint: string; wallet: string;
  side: "buy" | "sell"; priceSol: number; quoteSol: number; tokenAmount: number;
};

const obj = (v: unknown): Obj => v && typeof v === "object" ? v as Obj : {};
const str = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v) : "";
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const first = (...values: unknown[]): unknown => values.find(v => v !== undefined && v !== null && v !== "");
function humanAmount(value: unknown, decimals: unknown, isSol: boolean): number {
  const raw = n(value);
  if (!(raw > 0)) return 0;
  const hasDecimals = decimals !== undefined && decimals !== null && decimals !== "";
  const d = n(decimals);
  if (hasDecimals && Number.isInteger(d) && d >= 0 && d <= 18) return raw / 10 ** d;
  if (isSol && raw > 1000) return raw / 1e9;
  // Do not guess token decimals when a parser only supplied a raw integer.
  if (!isSol && Number.isInteger(raw) && raw >= 1_000_000) return 0;
  return raw;
}
function extractSwap(line: Obj): Swap | null {
  const parsed = obj(line.parsed ?? line);
  const summary = obj(parsed.summary);
  const pd = obj(first(parsed.parsedData, summary.parsedData, line.parsedData));
  const signature = str(first(line.signature, parsed.signature));
  const timestamp = n(first(line.timestamp, parsed.timestamp, parsed.blockTime, line.blockTime));
  const swap = obj(obj(parsed.events ?? line.events).swap);
  const tokenInputs = Array.isArray(swap.tokenInputs) ? swap.tokenInputs.map(obj) : [];
  const tokenOutputs = Array.isArray(swap.tokenOutputs) ? swap.tokenOutputs.map(obj) : [];
  const nativeIn = obj(swap.nativeInput);
  const nativeOut = obj(swap.nativeOutput);
  const firstToken = (...items: Obj[]) => items[0] ?? {};
  const wallet = str(first(
    parsed.feePayer, parsed.fee_payer, line.feePayer, line.fee_payer,
    parsed.accountData?.[0]?.account, line.accountData?.[0]?.account,
    tokenInputs[0]?.fromUserAccount, tokenOutputs[0]?.toUserAccount
  ));
  if (!signature || !timestamp || !wallet) return null;
  const status = str(first(parsed.transactionStatus, line.transactionStatus, line.parserStatus));
  if (status && !["OK", "Success", "succeeded", "success"].includes(status)) return null;
  if (line.transactionError || parsed.transactionError || line.meta?.err || parsed.meta?.err) return null;

  const nativeSol = (value: unknown): number => {
    const raw = n(value);
    return raw > 0 ? raw / 1e9 : 0;
  };
  const tokenUiAmount = (token: Obj): number => {
    const raw = obj(token.rawTokenAmount);
    if (raw.tokenAmount !== undefined && raw.decimals !== undefined) {
      const decimals = n(raw.decimals);
      const amount = n(raw.tokenAmount);
      return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18 ? amount / 10 ** decimals : 0;
    }
    // Helius' tokenAmount field is already UI-adjusted on Enhanced Transaction swap events.
    return n(first(token.tokenAmount, token.amount));
  };
  const make = (mint: unknown, side: "buy" | "sell", quote: number, tokens: number): Swap | null => {
    const tokenMint = str(mint);
    if (!tokenMint || quote <= 0 || tokens <= 0) return null;
    return { signature, timestamp, mint: tokenMint, wallet, side, priceSol: quote / tokens, quoteSol: quote, tokenAmount: tokens };
  };

  // Helius Enhanced Transactions: events.swap uses lamports for native amounts,
  // UI tokenAmount or rawTokenAmount { tokenAmount, decimals } for SPL tokens.
  if (nativeIn.amount && tokenOutputs.length) {
    const token = firstToken(...tokenOutputs);
    const result = make(token.mint, "buy", nativeSol(nativeIn.amount), tokenUiAmount(token));
    if (result) return result;
  }
  if (nativeOut.amount && tokenInputs.length) {
    const token = firstToken(...tokenInputs);
    const result = make(token.mint, "sell", nativeSol(nativeOut.amount), tokenUiAmount(token));
    if (result) return result;
  }

  // Helius parsed swap data (when available in the payload).
  const inputMint = str(first(pd.input_mint, pd.inputMint));
  const outputMint = str(first(pd.output_mint, pd.outputMint));
  const inputRaw = first(pd.in_amount, pd.inputAmount);
  const outputRaw = first(pd.actual_out_amount, pd.out_amount, pd.outputAmount);
  if (inputMint && outputMint && inputRaw !== undefined && outputRaw !== undefined) {
    if (QUOTE_MINTS.has(inputMint) && !QUOTE_MINTS.has(outputMint)) {
      const quote = humanAmount(inputRaw, first(pd.in_decimals, pd.input_decimals), true);
      const tokens = humanAmount(outputRaw, first(pd.out_decimals, pd.output_decimals), false);
      const result = make(outputMint, "buy", quote, tokens);
      if (result) return result;
    }
    if (QUOTE_MINTS.has(outputMint) && !QUOTE_MINTS.has(inputMint)) {
      const tokens = humanAmount(inputRaw, first(pd.in_decimals, pd.input_decimals), false);
      const quote = humanAmount(outputRaw, first(pd.out_decimals, pd.output_decimals), true);
      const result = make(inputMint, "sell", quote, tokens);
      if (result) return result;
    }
  }

  // Last-resort transfer reconstruction: require a native SOL transfer and an SPL
  // transfer involving the fee payer. Do not infer a price from unrelated transfers.
  const tokenTransfers = Array.isArray(parsed.tokenTransfers ?? line.tokenTransfers)
    ? (parsed.tokenTransfers ?? line.tokenTransfers).map(obj) : [];
  const nativeTransfers = Array.isArray(parsed.nativeTransfers ?? line.nativeTransfers)
    ? (parsed.nativeTransfers ?? line.nativeTransfers).map(obj) : [];
  const incomingToken = tokenTransfers.find((t: Obj) => str(t.toUserAccount) === wallet && str(t.mint));
  const outgoingToken = tokenTransfers.find((t: Obj) => str(t.fromUserAccount) === wallet && str(t.mint));
  const outgoingSol = nativeTransfers.filter((t: Obj) => str(t.fromUserAccount) === wallet).reduce((sum: number, t: Obj) => sum + nativeSol(t.amount), 0);
  const incomingSol = nativeTransfers.filter((t: Obj) => str(t.toUserAccount) === wallet).reduce((sum: number, t: Obj) => sum + nativeSol(t.amount), 0);
  if (incomingToken && outgoingSol > 0) {
    const result = make(incomingToken.mint, "buy", outgoingSol, n(incomingToken.tokenAmount));
    if (result) return result;
  }
  if (outgoingToken && incomingSol > 0) {
    const result = make(outgoingToken.mint, "sell", incomingSol, n(outgoingToken.tokenAmount));
    if (result) return result;
  }
  return null;
}
function flowPass(rows: Swap[], now: number): { pass: boolean; uniqueBuyers: number; reasons: string[] } {
  const reasons: string[] = [];
  const allBuyers = new Set<string>();
  for (const [endOffset, label] of [[5, "window-1"], [4, "window-2"], [3, "window-3"]] as const) {
    const start = now - endOffset;
    const end = start + 2;
    const window = rows.filter(r => r.timestamp >= start && r.timestamp < end);
    const buys = window.filter(r => r.side === "buy");
    const sells = window.filter(r => r.side === "sell");
    const buyQuote = buys.reduce((s, r) => s + r.quoteSol, 0);
    const sellQuote = sells.reduce((s, r) => s + r.quoteSol, 0);
    const buyers = new Set(buys.map(r => r.wallet));
    const sellers = new Set(sells.map(r => r.wallet));
    const largestBuyerQuote = Math.max(0, ...[...buyers].map(w => buys.filter(r => r.wallet === w).reduce((s, r) => s + r.quoteSol, 0)));
    if (buyers.size < 3) reasons.push(label + ": fewer than 3 distinct buyers");
    if (buyQuote <= sellQuote * 3) reasons.push(label + ": buy quote is not more than 3x sell quote");
    if (sellers.size > buyers.size / 2) reasons.push(label + ": seller count exceeds half the buyer count");
    if (buyQuote > 0 && largestBuyerQuote / buyQuote > 0.72) reasons.push(label + ": largest buyer exceeds 72% of buy flow");
    for (const buyer of buyers) allBuyers.add(buyer);
  }
  if (allBuyers.size < 5) reasons.push("Fewer than 5 distinct buyers across the three windows");
  return { pass: reasons.length === 0, uniqueBuyers: allBuyers.size, reasons };
}

async function main() {
  await mkdir(ROOT, { recursive: true });
  const files = (await readdir(ROOT)).filter(f => /^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[0-9]{4})?\.jsonl$/.test(f)).sort();
  const swaps = new Map<string, Swap>();
  let inputRecords = 0, malformed = 0, parsedSwaps = 0, parsedDataRecords = 0, swapEventRecords = 0;
  const observedParsedDataKeys = new Set<string>();
  const observedSwapEventKeys = new Set<string>();
  const observedNativeInputKeys = new Set<string>();
  const observedNativeOutputKeys = new Set<string>();
  const observedTokenInputKeys = new Set<string>();
  const observedTokenOutputKeys = new Set<string>();
  const observedTopLevelKeys = new Set<string>();
  for (const file of files) {
    const rl = createInterface({ input: createReadStream(join(ROOT, file)), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      inputRecords++;
      try {
        const raw = obj(JSON.parse(line));
        for (const key of Object.keys(raw)) observedTopLevelKeys.add(key);
        const parsed = obj(raw.parsed ?? raw);
        const pd = obj(first(parsed.parsedData, obj(parsed.summary).parsedData, raw.parsedData));
        if (Object.keys(pd).length) {
          parsedDataRecords++;
          for (const key of Object.keys(pd)) observedParsedDataKeys.add(key);
        }
        const eventSwap = obj(obj(parsed.events ?? raw.events).swap);
        if (Object.keys(eventSwap).length) {
          swapEventRecords++;
          for (const key of Object.keys(eventSwap)) observedSwapEventKeys.add(key);
          for (const key of Object.keys(obj(eventSwap.nativeInput))) observedNativeInputKeys.add(key);
          for (const key of Object.keys(obj(eventSwap.nativeOutput))) observedNativeOutputKeys.add(key);
          for (const key of Object.keys(obj(Array.isArray(eventSwap.tokenInputs) ? eventSwap.tokenInputs[0] : {}))) observedTokenInputKeys.add(key);
          for (const key of Object.keys(obj(Array.isArray(eventSwap.tokenOutputs) ? eventSwap.tokenOutputs[0] : {}))) observedTokenOutputKeys.add(key);
        }
        const swap = extractSwap(raw);
        if (!swap) continue;
        parsedSwaps++;
        swaps.set(swap.signature + "|" + swap.mint + "|" + swap.side, swap);
      } catch { malformed++; }
    }
  }

  const byMint = new Map<string, Swap[]>();
  for (const swap of swaps.values()) {
    const rows = byMint.get(swap.mint) ?? [];
    rows.push(swap); byMint.set(swap.mint, rows);
  }
  const signals: Obj[] = [];
  const paperTrades: Obj[] = []; // Strict strategy-eligible fills; remain empty until risk/curve gates are verified.
  const shadowEntryBySignature = new Map<string, { mint: string; timestamp: number; priceSol: number; signalId: string }>();
  let candidateCount = 0;
  let reclaimPassCandidates = 0;
  let flowPassCandidates = 0;
  let technicalPassCandidates = 0;
  let nextEventConfirmations = 0;
  let shadowEntriesOpened = 0;
  const gateFailureCounts = new Map<string, number>();
  const countFailure = (reason: string) => gateFailureCounts.set(reason, (gateFailureCounts.get(reason) ?? 0) + 1);
  const coinEntries = [...byMint.entries()];
  let coinBatchCount = 0;
  for (let offset = 0; offset < coinEntries.length; offset += COINS_PER_PROCESSING_BATCH) {
    const coinBatch = coinEntries.slice(offset, offset + COINS_PER_PROCESSING_BATCH);
    coinBatchCount++;
    console.log(JSON.stringify({ stage: "coin-processing-batch-start", batch: coinBatchCount, coinsInBatch: coinBatch.length, totalCoins: coinEntries.length }));
    for (const [mint, rows] of coinBatch) {
    rows.sort((a, b) => a.timestamp - b.timestamp || a.signature.localeCompare(b.signature));
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i];
      const history = rows.slice(Math.max(0, i - 1000), i + 1).filter(r => r.timestamp >= current.timestamp - 60);
      const prices = history.map(r => r.priceSol).filter(p => p > 0);
      if (prices.length < 8) continue;
      const low = Math.min(...prices);
      const high = Math.max(...prices);
      const impulsePct = (high / low - 1) * 100;
      const pullbackPct = (high - current.priceSol) / high * 100;
      if (impulsePct < 20 || pullbackPct < 10 || pullbackPct > 40) continue;
      candidateCount++;
      const priorFive = history.filter(r => r.timestamp >= current.timestamp - 6 && r.timestamp < current.timestamp - 1);
      const priorFiveHigh = Math.max(0, ...priorFive.map(r => r.priceSol));
      const reclaimed = priorFiveHigh > 0 && current.priceSol >= priorFiveHigh * 1.01;
      const flow = flowPass(history, current.timestamp);
      const reasons = [...flow.reasons];
      if (!reclaimed) reasons.push("Price has not reclaimed the previous 5-second high by 1%");
      for (const reason of flow.reasons) countFailure(reason);
      if (!reclaimed) countFailure("Price has not reclaimed the previous 5-second high by 1%");
      if (reclaimed) reclaimPassCandidates++;
      if (flow.pass) flowPassCandidates++;
      const signalId = mint + ":" + current.timestamp + ":" + current.signature;
      const shadowCandidate = reclaimed && flow.pass;
      if (shadowCandidate) {
        technicalPassCandidates++;
        const next = rows.slice(i + 1).find(r => r.timestamp >= current.timestamp + 1 && r.timestamp <= current.timestamp + 4);
        if (next && next.priceSol >= current.priceSol * 0.99 && next.priceSol <= current.priceSol * 1.02) {
          nextEventConfirmations++;
          // The flow filter was already evaluated at the signal timestamp. Requiring it
          // again at the delayed fill timestamp double-applied the same three-window
          // filter and silently eliminated otherwise valid historical entries.
          shadowEntryBySignature.set(mint + "|" + next.signature, { mint, timestamp: next.timestamp, priceSol: next.priceSol, signalId });
        }
      }
      signals.push({
        signalId, timestamp: current.timestamp, mint, signature: current.signature,
        priceSol: current.priceSol, impulsePct, pullbackPct, reclaimed,
        uniqueBuyersInFlowWindows: flow.uniqueBuyers,
        shadowCandidate,
        decision: "WATCH",
        reasons,
        verification: {
          creatorRisk: "UNKNOWN_NOT_RECONSTRUCTED_FROM_FEED",
          bondingCurveReserves: "UNKNOWN_NOT_RECONSTRUCTED_FROM_FEED",
          executableExitImpact: "UNKNOWN_NOT_RECONSTRUCTED_FROM_FEED",
          technicalSetup: shadowCandidate ? "PASS" : "FAIL"
        },
        strategyVersion: "pullback-reclaim-v3-backtest-diagnostic",
        paperOnly: true
      });
    }
  }
    console.log(JSON.stringify({ stage: "coin-processing-batch-complete", batch: coinBatchCount, processedCoins: Math.min(offset + coinBatch.length, coinEntries.length), totalCoins: coinEntries.length }));
  }

  // Shadow fills are deliberately separate from strategy-eligible paper trades.
  // They test the price/flow setup while the unverified creator/curve gates remain WATCH.
  const allSwaps = [...swaps.values()].sort((a, b) => a.timestamp - b.timestamp || a.signature.localeCompare(b.signature));
  const open: Obj[] = [];
  const shadowTrades: Obj[] = [];
  let cashUsd = STARTING_EQUITY_USD;
  let realizedPnlUsd = 0;
  const buyCostUsd = TRADE_USD * (1 + PLATFORM_FEE_PER_SIDE + SLIPPAGE_PER_SIDE) + NETWORK_FEE_USD_PER_SIDE;
  for (const event of allSwaps) {
    for (let p = open.length - 1; p >= 0; p--) {
      const position = open[p];
      if (position.mint !== event.mint || event.timestamp < position.entryTime) continue;
      position.lastPriceSol = event.priceSol;
      position.highWaterPriceSol = Math.max(position.highWaterPriceSol, event.priceSol);
      const peakPct = (position.highWaterPriceSol / position.entryPriceSol - 1) * 100;
      const hardStop = position.entryPriceSol * 0.95;
      const trailStop = peakPct >= 10 ? position.highWaterPriceSol * 0.60 : 0;
      const protectedFloor = peakPct >= 200 ? position.entryPriceSol * 1.80
        : peakPct >= 100 ? position.entryPriceSol * 1.40
        : peakPct >= 50 ? position.entryPriceSol * 1.15
        : peakPct >= 10 ? position.entryPriceSol * 1.05 : 0;
      const effectiveStop = Math.max(hardStop, trailStop, protectedFloor);
      const heldSeconds = event.timestamp - position.entryTime;
      const exitReason = event.priceSol <= effectiveStop ? "adaptive_stop_or_profit_floor"
        : heldSeconds >= 300 ? "max_hold_300s" : "";
      if (!exitReason) continue;
      const grossExitUsd = TRADE_USD * event.priceSol / position.entryPriceSol;
      const sellCostsUsd = grossExitUsd * (PLATFORM_FEE_PER_SIDE + SLIPPAGE_PER_SIDE) + NETWORK_FEE_USD_PER_SIDE;
      const netExitUsd = grossExitUsd - sellCostsUsd;
      const pnlUsd = netExitUsd - buyCostUsd;
      cashUsd += netExitUsd;
      realizedPnlUsd += pnlUsd;
      shadowTrades.push({
        tradeId: position.tradeId, signalId: position.signalId, mint: position.mint,
        entrySignature: position.entrySignature, exitSignature: event.signature,
        entryTime: position.entryTime, exitTime: event.timestamp,
        entryPriceSol: position.entryPriceSol, exitPriceSol: event.priceSol,
        notionalUsd: TRADE_USD, grossExitUsd, buyCostUsd, sellCostsUsd,
        pnlUsd: Number(pnlUsd.toFixed(6)), returnPct: Number((pnlUsd / buyCostUsd * 100).toFixed(3)),
        peakReturnPct: Number(peakPct.toFixed(3)), heldSeconds, exitReason,
        status: "CLOSED_SHADOW_ONLY", riskGatesBypassed: ["creator verification", "curve reserve/exit-route verification", "tax verification", "impact verification"]
      });
      open.splice(p, 1);
    }
    const candidate = shadowEntryBySignature.get(event.mint + "|" + event.signature);
    if (candidate && candidate.mint === event.mint && open.length < MAX_OPEN_POSITIONS && !open.some(p => p.mint === candidate.mint) && cashUsd >= buyCostUsd) {
      const tradeId = candidate.mint + ":" + candidate.timestamp + ":" + event.signature;
      shadowEntriesOpened++;
      open.push({
        tradeId, signalId: candidate.signalId, mint: candidate.mint,
        entrySignature: event.signature, entryTime: event.timestamp,
        entryPriceSol: event.priceSol, highWaterPriceSol: event.priceSol,
        lastPriceSol: event.priceSol, notionalUsd: TRADE_USD, buyCostUsd,
        status: "OPEN_SHADOW_ONLY"
      });
      cashUsd -= buyCostUsd;
    }
  }
  const openPositions = open.map(position => {
    const grossMarkUsd = TRADE_USD * position.lastPriceSol / position.entryPriceSol;
    const estimatedSellCostsUsd = grossMarkUsd * (PLATFORM_FEE_PER_SIDE + SLIPPAGE_PER_SIDE) + NETWORK_FEE_USD_PER_SIDE;
    return {
      ...position,
      grossMarkUsd,
      estimatedSellCostsUsd,
      estimatedNetLiquidationUsd: grossMarkUsd - estimatedSellCostsUsd,
      unrealizedPnlUsd: grossMarkUsd - estimatedSellCostsUsd - buyCostUsd
    };
  });
  const signalText = signals.map(s => JSON.stringify(s)).join("\n") + (signals.length ? "\n" : "");
  await writeFile(join(ROOT, "paper-signals.jsonl"), signalText);
  await writeFile(join(ROOT, "paper-trades.jsonl"), paperTrades.map(t => JSON.stringify(t)).join("\n") + (paperTrades.length ? "\n" : ""));
  await writeFile(join(ROOT, "shadow-paper-trades.jsonl"), shadowTrades.map(t => JSON.stringify(t)).join("\n") + (shadowTrades.length ? "\n" : ""));
  await writeFile(join(ROOT, "paper-open-positions.json"), JSON.stringify(openPositions, null, 2) + "\n");
  const roundTripFeeUsd = 2 * (TRADE_USD * PLATFORM_FEE_PER_SIDE + TRADE_USD * SLIPPAGE_PER_SIDE + NETWORK_FEE_USD_PER_SIDE);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY",
    sourceFiles: files,
    inputRecords, malformedRecords: malformed, parsedSwapRecords: parsedSwaps,
    parsedDataRecords, swapEventRecords,
    parserHealth: parsedSwaps > 0 ? "SWAPS_PARSED" : swapEventRecords > 0 ? "SWAP_EVENTS_PRESENT_BUT_NONE_PARSED" : "NO_SWAP_EVENTS_IN_SAMPLE",
    observedParsedDataKeys: [...observedParsedDataKeys].slice(0, 40),
    observedTopLevelKeys: [...observedTopLevelKeys].slice(0, 60),
    observedSwapEventKeys: [...observedSwapEventKeys].slice(0, 40),
    observedNativeInputKeys: [...observedNativeInputKeys].slice(0, 30),
    observedNativeOutputKeys: [...observedNativeOutputKeys].slice(0, 30),
    observedTokenInputKeys: [...observedTokenInputKeys].slice(0, 30),
    observedTokenOutputKeys: [...observedTokenOutputKeys].slice(0, 30),
    distinctSwapRows: swaps.size, tokensWithSwaps: byMint.size,
    pullbackCandidates: candidateCount, watchSignals: signals.length,
    gateDiagnostics: {
      reclaimPassCandidates,
      flowPassCandidates,
      technicalPassCandidates,
      nextEventConfirmations,
      shadowEntriesOpened,
      shadowTradesClosed: shadowTrades.length,
      flowAndReclaimFailureCounts: Object.fromEntries([...gateFailureCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)),
      interpretation: "Counts are candidate-event counts, not unique tokens. Shadow entries use historical swap-price proxies and are not proof of executable bonding-curve fills."
    },
    paperTradesOpened: paperTrades.length,
    shadowTradesClosed: shadowTrades.length,
    shadowWins: shadowTrades.filter(t => n(t.pnlUsd) > 0).length,
    shadowLosses: shadowTrades.filter(t => n(t.pnlUsd) <= 0).length,
    shadowWinRatePct: shadowTrades.length ? Number((shadowTrades.filter(t => n(t.pnlUsd) > 0).length / shadowTrades.length * 100).toFixed(2)) : 0,
    shadowRealizedPnlUsd: Number(realizedPnlUsd.toFixed(6)),
    shadowOpenPositions: openPositions.length,
    shadowUnrealizedPnlUsd: Number(openPositions.reduce((sum, p) => sum + n(p.unrealizedPnlUsd), 0).toFixed(6)),
    shadowCashUsd: Number(cashUsd.toFixed(6)),
    tradeAmountUsd: TRADE_USD,
    startingPaperEquityUsd: STARTING_EQUITY_USD,
    maxSimultaneousPositions: MAX_OPEN_POSITIONS,
    feeAssumptions: {
      assumedVenueFeePerSidePct: PLATFORM_FEE_PER_SIDE * 100,
      slippagePerSidePct: SLIPPAGE_PER_SIDE * 100,
      networkFeeUsdPerSide: NETWORK_FEE_USD_PER_SIDE,
      estimatedRoundTripCostUsdAtFlatPrice: Number(roundTripFeeUsd.toFixed(4)),
      estimatedRoundTripCostPctOfOneDollar: Number((roundTripFeeUsd / TRADE_USD * 100).toFixed(2)),
      breakEvenGrossMovePctApprox: 3.25,
      exampleAtFlatPrice: { entryFeeUsd: 0.01, entrySlippageUsd: 0.005, entryNetworkUsd: 0.001, exitFeeUsd: 0.01, exitSlippageUsd: 0.005, exitNetworkUsd: 0.001, totalRoundTripCostUsd: 0.032 },
      note: "Approximation for research only. Actual venue/creator fees, priority fees, route impact and slippage vary by transaction."
    },
    feedLimitations: "Prices and flow are reconstructed from parsed swap events, not true one-second bonding-curve snapshots. Shadow fills bypass creator, tax, reserve and exit-route checks and are research diagnostics only.",
    status: signals.length
      ? "Strategy-eligible trades remain blocked as WATCH until creator-risk and bonding-curve exit verification are available. Separate shadow-only $1 simulations measure price/flow setups without treating them as valid strategy trades."
      : "No qualifying pullback candidates were found in the parsed swap feed.",
    outputs: ["paper-signals.jsonl", "paper-trades.jsonl", "shadow-paper-trades.jsonl", "paper-open-positions.json", "paper-trading-report.json"]
  };
  await writeFile(join(ROOT, "paper-trading-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("PAPER_TRADING_REPORT " + JSON.stringify(report));
  if (swapEventRecords > 0 && parsedSwaps === 0) {
    throw new Error("Parser quality gate failed: Helius swap events exist, but zero swaps were reconstructed. Inspect observed*Keys in paper-trading-report.json.");
  }
}

await main();
