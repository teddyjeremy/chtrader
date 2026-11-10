import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const API_KEY = process.env.HELIUS_API_KEY;
const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES ?? 20));
if (!API_KEY) throw new Error("HELIUS_API_KEY is required");

const root = join("data", "pumpfun-stream");
await mkdir(root, { recursive: true });
const statePath = join(root, "state.json");
type State = { lastSeenSignature?: string; updatedAt?: string };
let state: State = {};
try { state = JSON.parse(await readFile(statePath, "utf8")) as State; } catch { /* first run */ }

const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(API_KEY);
const enhancedUrl = "https://api.helius.xyz/v0/transactions?api-key=" + encodeURIComponent(API_KEY);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let rpcLast = 0;
let enhancedLast = 0;

async function rpc(method: string, params: unknown[]): Promise<any> {
  for (let attempt = 0; attempt < 7; attempt++) {
    const delay = Math.max(0, rpcLast + 500 - Date.now());
    if (delay) await wait(delay);
    rpcLast = Date.now();
    const response = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "pumpfun-stream", method, params }),
      signal: AbortSignal.timeout(60_000)
    });
    const body = await response.json() as any;
    if (response.ok && !body.error) return body.result;
    const detail = JSON.stringify(body).slice(0, 500);
    if (response.status !== 429 && response.status < 500) throw new Error(method + ": " + detail);
    await wait(Math.min(30_000, 1000 * 2 ** attempt));
  }
  throw new Error(method + " retries exhausted");
}

async function enhanced(signatures: string[]): Promise<any[]> {
  for (let attempt = 0; attempt < 7; attempt++) {
    const delay = Math.max(0, enhancedLast + 1500 - Date.now());
    if (delay) await wait(delay);
    enhancedLast = Date.now();
    const response = await fetch(enhancedUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactions: signatures }),
      signal: AbortSignal.timeout(60_000)
    });
    const raw = await response.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = raw; }
    if (response.ok) return Array.isArray(body) ? body : [];
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    if (response.status !== 429 && response.status < 500) throw new Error("Helius Enhanced API: " + detail.slice(0, 500));
    if (/credit|monthly quota|out of quota/i.test(detail)) throw new Error("Helius quota exhausted: " + detail.slice(0, 500));
    await wait(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error("Enhanced API retries exhausted");
}

const discovered: any[] = [];
let before: string | undefined;
let pages = 0;
let foundCheckpoint = !state.lastSeenSignature;
let reachedCheckpoint = false;
while (pages < MAX_PAGES && !reachedCheckpoint) {
  const options: Record<string, unknown> = { limit: 1000, commitment: "finalized" };
  if (before) options.before = before;
  const page = await rpc("getSignaturesForAddress", [PROGRAM, options]) as any[];
  pages++;
  if (!page.length) { reachedCheckpoint = true; break; }
  for (const row of page) {
    if (state.lastSeenSignature && row.signature === state.lastSeenSignature) {
      reachedCheckpoint = true;
      break;
    }
    discovered.push(row);
  }
  before = page[page.length - 1].signature;
  console.log(JSON.stringify({ stage: "signature-poll", pages, pageSize: page.length, newSignatures: discovered.length, checkpointFound: reachedCheckpoint }));
  if (page.length < 1000) { reachedCheckpoint = true; break; }
}
if (state.lastSeenSignature && !reachedCheckpoint && pages >= MAX_PAGES) {
  throw new Error("Checkpoint not reached within MAX_PAGES. Refusing to advance cursor; increase MAX_PAGES and rerun.");
}
if (!state.lastSeenSignature) foundCheckpoint = true;

const firstSignature = discovered[0]?.signature;
const byDay = new Map<string, any[]>();
let fetched = 0;
let missing = 0;
const missingRows: any[] = [];
for (let offset = 0; offset < discovered.length; offset += 100) {
  const batch = discovered.slice(offset, offset + 100);
  const txs = await enhanced(batch.map(row => row.signature));
  const bySignature = new Map(txs.map(tx => [String(tx.signature), tx]));
  for (const sig of batch) {
    const tx = bySignature.get(sig.signature);
    if (!tx) { missing++; missingRows.push({ signature: sig.signature, slot: sig.slot, blockTime: sig.blockTime ?? null, status: "enhanced_transaction_missing" }); continue; }
    fetched++;
    const timestamp = Number(tx.timestamp ?? sig.blockTime ?? 0);
    const day = timestamp > 0 ? new Date(timestamp * 1000).toISOString().slice(0, 10) : "unknown-date";
    const rows = byDay.get(day) ?? [];
    rows.push(tx);
    byDay.set(day, rows);
  }
  console.log(JSON.stringify({ stage: "transaction-enrichment", processed: Math.min(offset + 100, discovered.length), total: discovered.length, fetched, missing }));
}
for (const [day, rows] of byDay) {
  const path = join(root, day + ".jsonl");
  for (const tx of rows) await appendFile(path, JSON.stringify(tx) + "\n");
}
if (missingRows.length) {
  const path = join(root, "missing-transactions.jsonl");
  for (const row of missingRows) await appendFile(path, JSON.stringify(row) + "\n");
}
if (firstSignature) {
  state = { lastSeenSignature: firstSignature, updatedAt: new Date().toISOString() };
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
}
const report = {
  generatedAt: new Date().toISOString(),
  source: "Helius Solana RPC + Enhanced Transactions",
  program: PROGRAM,
  pagesScanned: pages,
  maxPages: MAX_PAGES,
  checkpointBeforeRun: state.lastSeenSignature ?? null,
  checkpointReached: reachedCheckpoint,
  newestSignatureStored: firstSignature ?? null,
  signaturesDiscovered: discovered.length,
  enhancedTransactionsFetched: fetched,
  enhancedTransactionsMissing: missing,
  completeness: state.lastSeenSignature && !reachedCheckpoint ? "INCOMPLETE_CHECKPOINT_NOT_REACHED" : "POLL_COMPLETE_TO_CHECKPOINT",
  note: "Raw Pump program transactions only. This is not yet a validated mint lifecycle, bonding-curve reconstruction, strategy signal, or profitability result."
};
await writeFile(join(root, "latest-poll-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("PUMPFUN_STREAM_REPORT " + JSON.stringify(report));
