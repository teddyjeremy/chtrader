import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;
type SwapRow = {
  signature: string;
  blockTime: number;
  slot: number;
  venueSource: string;
  wallet: string;
  side: "buy" | "sell" | "unknown";
  tokenMint: string;
  quoteMint: string;
  quoteAmountRaw: string;
  tokenAmountRaw: string;
  success: boolean;
};

const QUOTE_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "So11111111111111111111111111111111111111111",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
]);

function obj(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}
function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function csv(value: string | number | boolean): string {
  const raw = String(value);
  return /[",\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
}
function csvRows(headers: string[], rows: Array<Array<string | number | boolean>>): string {
  return [headers.join(","), ...rows.map((row) => row.map(csv).join(","))].join("\n") + "\n";
}

async function main() {
  const rawDir = join("data", "raw");
  const derivedDir = join("data", "derived");
  await mkdir(derivedDir, { recursive: true });
  const files = (await readdir(rawDir)).filter((name) => name.endsWith("-october-2026.jsonl"));
  if (!files.length) throw new Error("No October JSONL files found. Run the Helius collection workflow first.");

  const swaps = new Map<string, SwapRow>();
  const walletStats = new Map<string, { txs: Set<string>; tokens: Set<string>; buys: number; sells: number; first: number; last: number; protocols: Set<string> }>();
  const tokenStats = new Map<string, { txs: Set<string>; wallets: Set<string>; buys: number; sells: number; first: number; last: number }>();
  let malformedLines = 0;
  let inputRecords = 0;
  let nonSwapRecords = 0;

  for (const file of files) {
    const source = file.replace("-october-2026.jsonl", "");
    const rl = createInterface({ input: createReadStream(join(rawDir, file)), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      inputRecords++;
      let outer: JsonObject;
      try { outer = obj(JSON.parse(line)); } catch { malformedLines++; continue; }
      const parsed = obj(outer.parsed ?? outer);
      const summary = obj(parsed.summary);
      const parsedData = obj(summary.parsedData);
      const signature = str(outer.signature ?? parsed.signature);
      const wallet = str(parsed.feePayer ?? outer.feePayer);
      const blockTime = num(parsed.blockTime ?? outer.blockTime);
      const slot = num(parsed.slot ?? outer.slot);
      const protocol = str(parsedData.protocol) || source;
      const type = str(parsedData.type ?? summary.type).toLowerCase();
      const inputMint = str(parsedData.input_mint);
      const outputMint = str(parsedData.output_mint);
      const inputAmount = str(parsedData.in_amount);
      const outputAmount = str(parsedData.actual_out_amount ?? parsedData.out_amount);
      const status = str(parsed.transactionStatus ?? outer.parserStatus);
      const success = status === "OK" || status === "Success" || status === "succeeded";

      if (!signature || !wallet || type !== "swap" || !inputMint || !outputMint) {
        nonSwapRecords++;
        continue;
      }

      let side: SwapRow["side"] = "unknown";
      let tokenMint = "";
      let quoteMint = "";
      let quoteAmountRaw = "";
      let tokenAmountRaw = "";
      if (QUOTE_MINTS.has(inputMint) && !QUOTE_MINTS.has(outputMint)) {
        side = "buy"; tokenMint = outputMint; quoteMint = inputMint;
        quoteAmountRaw = inputAmount; tokenAmountRaw = outputAmount;
      } else if (QUOTE_MINTS.has(outputMint) && !QUOTE_MINTS.has(inputMint)) {
        side = "sell"; tokenMint = inputMint; quoteMint = outputMint;
        quoteAmountRaw = outputAmount; tokenAmountRaw = inputAmount;
      } else {
        nonSwapRecords++;
        continue;
      }

      const key = [signature, wallet, tokenMint, side, quoteAmountRaw, tokenAmountRaw].join("|");
      swaps.set(key, { signature, blockTime, slot, venueSource: protocol, wallet, side, tokenMint, quoteMint, quoteAmountRaw, tokenAmountRaw, success });

      if (success) {
        const ws = walletStats.get(wallet) ?? { txs: new Set<string>(), tokens: new Set<string>(), buys: 0, sells: 0, first: blockTime, last: blockTime, protocols: new Set<string>() };
        ws.txs.add(signature); ws.tokens.add(tokenMint); ws.first = Math.min(ws.first || blockTime, blockTime); ws.last = Math.max(ws.last, blockTime);
        if (side === "buy") ws.buys++; if (side === "sell") ws.sells++; ws.protocols.add(protocol);
        walletStats.set(wallet, ws);
  
        const ts = tokenStats.get(tokenMint) ?? { txs: new Set<string>(), wallets: new Set<string>(), buys: 0, sells: 0, first: blockTime, last: blockTime };
        ts.txs.add(signature); ts.wallets.add(wallet); ts.first = Math.min(ts.first || blockTime, blockTime); ts.last = Math.max(ts.last, blockTime);
        if (side === "buy") ts.buys++; if (side === "sell") ts.sells++;
        tokenStats.set(tokenMint, ts);
      }
    }
  }

  const swapRows = [...swaps.values()].sort((a, b) => a.blockTime - b.blockTime);
  const walletRows = [...walletStats.entries()].map(([wallet, s]) => [
    wallet, s.txs.size, s.tokens.size, s.buys, s.sells, s.first, s.last, [...s.protocols].join("|")
  ]).sort((a, b) => Number(b[1]) - Number(a[1]));
  const tokenRows = [...tokenStats.entries()].map(([mint, s]) => [
    mint, s.txs.size, s.wallets.size, s.buys, s.sells, s.first, s.last
  ]).sort((a, b) => Number(b[1]) - Number(a[1]));

  await writeFile(join(derivedDir, "october-2026-swaps.csv"), csvRows(
    ["signature","block_time_unix","slot","venue_source","wallet","side","token_mint","quote_mint","quote_amount_raw","token_amount_raw","success"],
    swapRows.map((s) => [s.signature,s.blockTime,s.slot,s.venueSource,s.wallet,s.side,s.tokenMint,s.quoteMint,s.quoteAmountRaw,s.tokenAmountRaw,s.success])
  ));
  await writeFile(join(derivedDir, "october-2026-wallet-activity.csv"), csvRows(
    ["wallet","swap_transactions","distinct_tokens","buys","sells","first_seen_unix","last_seen_unix","protocols"],
    walletRows
  ));
  await writeFile(join(derivedDir, "october-2026-token-activity.csv"), csvRows(
    ["token_mint","swap_transactions","distinct_wallets","buys","sells","first_seen_unix","last_seen_unix"],
    tokenRows
  ));
  await writeFile(join(derivedDir, "october-2026-derive-report.json"), JSON.stringify({
    inputFiles: files, inputRecords, malformedLines, nonSwapRecords,
    deduplicatedSwapRows: swapRows.length, walletCount: walletRows.length, tokenCount: tokenRows.length,
    caveats: [
      "Wallet identity uses feePayer as a proxy and can be wrong for relayed or sponsored transactions.",
      "Raw quote amounts are not USD-normalized; decimals and historical FX/price data are required.",
      "This is activity extraction, not realised PnL or a qualified smart-wallet list.",
      "Jupiter and direct venue scans can overlap; deduplication is transaction/wallet/mint/side/amount based.",
      "Only parser-recognized swaps with quote mint SOL, WSOL or USDC are included."
    ],
    generatedAt: new Date().toISOString()
  }, null, 2));
  console.log(JSON.stringify({ inputRecords, malformedLines, nonSwapRecords, swaps: swapRows.length, wallets: walletRows.length, tokens: tokenRows.length }));
}

await main();
