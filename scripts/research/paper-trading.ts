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
const STARTING_EQUITY_USD = 10;
const MAX_OPEN_POSITIONS = 3;
// Conservative research assumptions, not a claim of the exact fee charged on every curve trade.
const PLATFORM_FEE_PER_SIDE = 0.01;
const SLIPPAGE_PER_SIDE = 0.005;
const NETWORK_FEE_USD_PER_SIDE = 0.001;
const MIN_NET_EDGE_AFTER_COSTS = 0.04;

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
  const timestamp = n(first(line.timestamp, parsed.blockTime, line.blockTime));
  const wallet = str(first(parsed.feePayer, line.feePayer, line.accountData?.[0]?.account));
  if (!signature || !timestamp || !wallet) return null;
  const status = str(first(parsed.transactionStatus, line.transactionStatus, line.parserStatus));
  if (status && !["OK", "Success", "succeeded", "success"].includes(status)) return null;
  if (line.transactionError || line.meta?.err) return null;

  const inputMint = str(first(pd.input_mint, pd.inputMint));
  const outputMint = str(first(pd.output_mint, pd.outputMint));
  const inputRaw = first(pd.in_amount, pd.inputAmount);
  const outputRaw = first(pd.actual_out_amount, pd.out_amount, pd.outputAmount);
  if (inputMint && outputMint && inputRaw !== undefined && outputRaw !== undefined) {
    if (QUOTE_MINTS.has(inputMint) && !QUOTE_MINTS.has(outputMint)) {
      const quote = humanAmount(inputRaw, first(pd.in_decimals, pd.input_decimals), true);
      const tokens = humanAmount(outputRaw, first(pd.out_decimals, pd.output_decimals), false);
      if (quote > 0 && tokens > 0) return { signature, timestamp, mint: outputMint, wallet, side: "buy", priceSol: quote / tokens, quoteSol: quote, tokenAmount: tokens };
    }
    if (QUOTE_MINTS.has(outputMint) && !QUOTE_MINTS.has(inputMint)) {
      const tokens = humanAmount(inputRaw, first(pd.in_decimals, pd.input_decimals), false);
      const quote = humanAmount(outputRaw, first(pd.out_decimals, pd.output_decimals), true);
      if (quote > 0 && tokens > 0) return { signature, timestamp, mint: inputMint, wallet, side: "sell", priceSol: quote / tokens, quoteSol: quote, tokenAmount: tokens };
    }
  }

  // Fallback to Helius Enhanced Transaction swap event shape.
  const swap = obj(obj(line.events).swap);
  const tokenInputs = Array.isArray(swap.tokenInputs) ? swap.tokenInputs : [];
  const tokenOutputs = Array.isArray(swap.tokenOutputs) ? swap.tokenOutputs : [];
  const nativeIn = obj(swap.nativeInput);
  const nativeOut = obj(swap.nativeOutput);
  if (nativeIn.amount && tokenOutputs.length) {
    const token = obj(tokenOutputs[0]);
    const quote = humanAmount(nativeIn.amount, 9, true);
    const tokens = humanAmount(token.tokenAmount, token.decimals, false);
    if (quote > 0 && tokens > 0 && str(token.mint)) return { signature, timestamp, mint: str(token.mint), wallet, side: "buy", priceSol: quote / tokens, quoteSol: quote, tokenAmount: tokens };
  }
  if (nativeOut.amount && tokenInputs.length) {
    const token = obj(tokenInputs[0]);
    const quote = humanAmount(nativeOut.amount, 9, true);
    const tokens = humanAmount(token.tokenAmount, token.decimals, false);
    if (quote > 0 && tokens > 0 && str(token.mint)) return { signature, timestamp, mint: str(token.mint), wallet, side: "sell", priceSol: quote / tokens, quoteSol: quote, tokenAmount: tokens };
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
  const files = (await readdir(ROOT)).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  const swaps = new Map<string, Swap>();
  let inputRecords = 0, malformed = 0, parsedSwaps = 0;
  for (const file of files) {
    const rl = createInterface({ input: createReadStream(join(ROOT, file)), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      inputRecords++;
      try {
        const swap = extractSwap(obj(JSON.parse(line)));
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
  const paperTrades: Obj[] = [];
  let candidateCount = 0;
  for (const [mint, rows] of byMint) {
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
      // Creator attribution, creator-wallet history, taxes, curve state and executable
      // exit-route/impact are not yet reconstructed from the current raw feed.
      reasons.push("Creator identity and creator-wallet selling are not verified");
      reasons.push("Bonding-curve reserves, token taxes and executable exit impact are not verified");
      const signalId = mint + ":" + current.timestamp + ":" + current.signature;
      signals.push({
        signalId, timestamp: current.timestamp, mint, signature: current.signature,
        priceSol: current.priceSol, impulsePct, pullbackPct, reclaimed,
        uniqueBuyersInFlowWindows: flow.uniqueBuyers,
        decision: "WATCH", reasons,
        strategyVersion: "pullback-reclaim-v2",
        paperOnly: true
      });
    }
  }

  const signalText = signals.map(s => JSON.stringify(s)).join("\n") + (signals.length ? "\n" : "");
  await writeFile(join(ROOT, "paper-signals.jsonl"), signalText);
  await writeFile(join(ROOT, "paper-trades.jsonl"), paperTrades.map(t => JSON.stringify(t)).join("\n") + (paperTrades.length ? "\n" : ""));
  const roundTripFeeUsd = 2 * (TRADE_USD * PLATFORM_FEE_PER_SIDE + TRADE_USD * SLIPPAGE_PER_SIDE + NETWORK_FEE_USD_PER_SIDE);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY",
    sourceFiles: files,
    inputRecords, malformedRecords: malformed, parsedSwapRecords: parsedSwaps,
    distinctSwapRows: swaps.size, tokensWithSwaps: byMint.size,
    pullbackCandidates: candidateCount, watchSignals: signals.length,
    paperTradesOpened: paperTrades.length,
    tradeAmountUsd: TRADE_USD,
    startingPaperEquityUsd: STARTING_EQUITY_USD,
    maxSimultaneousPositions: MAX_OPEN_POSITIONS,
    feeAssumptions: {
      platformAndCreatorFeePerSidePct: PLATFORM_FEE_PER_SIDE * 100,
      slippagePerSidePct: SLIPPAGE_PER_SIDE * 100,
      networkFeeUsdPerSide: NETWORK_FEE_USD_PER_SIDE,
      estimatedRoundTripCostUsdAtFlatPrice: Number(roundTripFeeUsd.toFixed(4)),
      estimatedRoundTripCostPctOfOneDollar: Number((roundTripFeeUsd / TRADE_USD * 100).toFixed(2)),
      breakEvenGrossMovePctApprox: 3.2,
      note: "Approximation for research only. Actual Pump.fun/creator fees, priority fees, route impact and slippage vary by transaction."
    },
    status: signals.length
      ? "Signals are recorded as WATCH because creator-risk and bonding-curve exit verification are not yet available; no unverified trades were fabricated."
      : "No qualifying pullback candidates were found in the parsed swap feed.",
    outputs: ["paper-signals.jsonl", "paper-trades.jsonl", "paper-trading-report.json"]
  };
  // Correct the percent field explicitly (kept separate to avoid hidden fee rounding).
  report.feeAssumptions.estimatedRoundTripCostPctOfOneDollar = Number((roundTripFeeUsd / TRADE_USD * 100).toFixed(2));
  await writeFile(join(ROOT, "paper-trading-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("PAPER_TRADING_REPORT " + JSON.stringify(report));
}

await main();
