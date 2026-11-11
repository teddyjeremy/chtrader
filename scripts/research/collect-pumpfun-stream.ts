import { mkdir, readFile, writeFile, appendFile, rename, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const API_KEY = process.env.HELIUS_API_KEY;
const requestedPages = Number(process.env.MAX_PAGES ?? 10);
if (!Number.isInteger(requestedPages) || requestedPages < 1 || requestedPages > 10) {
  throw new Error("MAX_PAGES must be an integer from 1 to 10");
}
const MAX_PAGES = requestedPages;
// Helius Enhanced Transactions accepts batches; use 100 to avoid hundreds of slow requests.
const BATCH_SIZE = 100;
if (!API_KEY) throw new Error("HELIUS_API_KEY is required");

const root = join("data", "pumpfun-stream");
const batchesDir = join(root, "batches");
await mkdir(batchesDir, { recursive: true });
const statePath = join(root, "state.json");
type SignatureRow = { signature: string; slot: number; blockTime?: number | null };
type Pending = {
  newestSignature: string | null;
  signatures: SignatureRow[];
  before?: string;
  discoveryComplete: boolean;
  nextOffset: number;
};
type State = { lastSeenSignature?: string; updatedAt?: string; pending?: Pending };
let state: State = {};
try { state = JSON.parse(await readFile(statePath, "utf8")) as State; } catch { /* first run */ }
const checkpointBefore = state.lastSeenSignature ?? null;
const saveState = async () => {
  state.updatedAt = new Date().toISOString();
  const temp = statePath + ".tmp";
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n");
  await rename(temp, statePath);
};

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
    const raw = await response.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = raw; }
    if (response.ok && !body?.error) return body.result;
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    if (response.status !== 429 && response.status < 500) throw new Error(method + ": " + detail.slice(0, 500));
    if (/credit|monthly quota|out of quota/i.test(detail)) throw new Error("Helius RPC quota exhausted: " + detail.slice(0, 500));
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
    if (response.ok && Array.isArray(body)) return body;
    if (response.ok) throw new Error("Helius Enhanced API returned an unexpected payload: " + JSON.stringify(body).slice(0, 500));
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    if (response.status !== 429 && response.status < 500) throw new Error("Helius Enhanced API: " + detail.slice(0, 500));
    if (/credit|monthly quota|out of quota/i.test(detail)) throw new Error("Helius Enhanced API quota exhausted: " + detail.slice(0, 500));
    await wait(Math.min(30_000, 1500 * 2 ** attempt));
  }
  throw new Error("Enhanced API retries exhausted");
}

let pending = state.pending;
let pages = 0;
if (!pending) {
  pending = { newestSignature: null, signatures: [], discoveryComplete: false, nextOffset: 0 };
  state.pending = pending;
  await saveState();
}

// Discovery and enrichment are deliberately chunked. A run may stop after MAX_PAGES,
// but every discovered page is durable and enriched before this run exits.
while (!pending.discoveryComplete && pages < MAX_PAGES) {
  const options: Record<string, unknown> = { limit: 1000, commitment: "finalized" };
  if (pending.before) options.before = pending.before;
  const page = await rpc("getSignaturesForAddress", [PROGRAM, options]) as SignatureRow[];
  pages++;
  if (!page.length) { pending.discoveryComplete = true; break; }
  if (!pending.newestSignature) pending.newestSignature = page[0].signature;
  let foundCheckpoint = false;
  for (const row of page) {
    if (checkpointBefore && row.signature === checkpointBefore) { foundCheckpoint = true; break; }
    pending.signatures.push(row);
  }
  pending.before = page[page.length - 1].signature;
  if (!checkpointBefore || foundCheckpoint || page.length < 1000) pending.discoveryComplete = true;
  await saveState();
  console.log(JSON.stringify({ stage: "signature-discovery", pagesThisRun: pages, queued: pending.signatures.length, checkpointFound: foundCheckpoint, discoveryComplete: pending.discoveryComplete }));
}

// Enrich all queued signatures, even if historical discovery needs another scheduled run.
// Batch files are durable; JSONL output is deduplicated by signature before append.
let fetchedThisRun = 0;
let missingThisRun = 0;
let duplicateRowsSkippedThisRun = 0;
const seenByFile = new Map<string, Set<string>>();
// Build a run-wide index from all previously collected successful transaction shards.
// This prevents a signature from being appended twice even if its timestamp/day changes.
const seenTransactionSignatures = new Set<string>();
for (const name of (await readdir(root)).filter(name => name.endsWith(".jsonl") && !name.startsWith("missing-transactions"))) {
  const existing = await readFile(join(root, name), "utf8");
  for (const line of existing.split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.signature) seenTransactionSignatures.add(String(row.signature));
    } catch { /* malformed historical row */ }
  }
}
for (let offset = pending.nextOffset; offset < pending.signatures.length; offset += BATCH_SIZE) {
  const batch = pending.signatures.slice(offset, offset + BATCH_SIZE);
  const batchName = `batch-${String(offset).padStart(10, "0")}-${batch[0].signature}-${batch[batch.length - 1].signature}.jsonl`;
  const batchPath = join(batchesDir, batchName);
  let rows: any[];
  try {
    const existing = await readFile(batchPath, "utf8");
    rows = existing.trim() ? existing.trim().split("\n").map(line => JSON.parse(line)) : [];
  } catch {
    const txs = await enhanced(batch.map(row => row.signature));
    const bySignature = new Map(txs.map(tx => [String(tx.signature), tx]));
    rows = batch.map(sig => {
      const tx = bySignature.get(sig.signature);
      if (!tx) return { kind: "missing", signature: sig.signature, slot: sig.slot, blockTime: sig.blockTime ?? null, status: "enhanced_transaction_missing" };
      const timestamp = Number(tx.timestamp ?? sig.blockTime ?? 0);
      const day = timestamp > 0 ? new Date(timestamp * 1000).toISOString().slice(0, 10) : "unknown-date";
      return { kind: "transaction", day, signature: sig.signature, tx };
    });
    const temp = batchPath + ".tmp";
    await writeFile(temp, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
    await rename(temp, batchPath);
  }
  for (const row of rows) {
    if (row.kind === "missing") missingThisRun++;
    else fetchedThisRun++;
  }
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const target = row.kind === "missing" ? "missing-transactions" : row.day;
    const list = grouped.get(target) ?? [];
    list.push(row);
    grouped.set(target, list);
  }
  for (const [prefix, additions] of grouped) {
    let known = seenByFile.get(prefix);
    const allNames = await readdir(root);
    const unshardedName = prefix + ".jsonl";
    const hasUnsharded = allNames.includes(unshardedName);
    const shardNames = allNames.filter(name => name.startsWith(prefix + "-") && name.endsWith(".jsonl")).sort();
    if (!known) {
      known = new Set<string>();
      for (const name of [...(hasUnsharded ? [unshardedName] : []), ...shardNames]) {
        const existing = await readFile(join(root, name), "utf8");
        for (const line of existing.split("\n").filter(Boolean)) {
          try { known.add(String(JSON.parse(line).signature ?? "")); } catch { /* malformed historical row */ }
        }
      }
      seenByFile.set(prefix, known);
    }
    const batchSeen = new Set<string>();
    const fresh = additions.filter(row => {
      const signature = String(row.signature);
      if (known!.has(signature) || seenTransactionSignatures.has(signature) || batchSeen.has(signature)) return false;
      batchSeen.add(signature);
      return true;
    });
    duplicateRowsSkippedThisRun += additions.length - fresh.length;
    const maxShardBytes = 20 * 1024 * 1024;
    let shard = shardNames.length ? shardNames[shardNames.length - 1] : "";
    let shardPath = shard ? join(root, shard) : "";
    let shardBytes = shardPath ? (await stat(shardPath)).size : maxShardBytes;
    let shardNumber = shard ? Number(shard.match(/-(\d{4})\.jsonl$/)?.[1] ?? 0) : 0;
    for (const row of fresh) {
      const line = JSON.stringify(row.kind === "missing" ? row : row.tx) + "\n";
      const bytes = Buffer.byteLength(line);
      if (!shard || shardBytes + bytes > maxShardBytes) {
        shardNumber++;
        shard = prefix + "-" + String(shardNumber).padStart(4, "0") + ".jsonl";
        shardPath = join(root, shard);
        shardBytes = 0;
      }
      await appendFile(shardPath, line);
      shardBytes += bytes;
      known!.add(String(row.signature));
      if (row.kind !== "missing") seenTransactionSignatures.add(String(row.signature));
    }
  }
  pending.nextOffset = Math.min(offset + BATCH_SIZE, pending.signatures.length);
  await saveState();
  await unlink(batchPath).catch(() => undefined);
  console.log(JSON.stringify({ stage: "batch-checkpoint", completed: pending.nextOffset, total: pending.signatures.length, fetchedThisRun, missingThisRun }));
}

const signaturesDiscovered = pending.signatures.length;
const newestSignatureStored = pending.newestSignature;
const discoveryComplete = pending.discoveryComplete;
const cursorBefore = pending.before ?? null;
if (discoveryComplete) {
  state.lastSeenSignature = newestSignatureStored ?? checkpointBefore ?? undefined;
  delete state.pending;
} else {
  // Keep the historical cursor and anchor, but discard the now-enriched queue.
  // Next scheduled/manual run continues with the next older page.
  pending.signatures = [];
  pending.nextOffset = 0;
  state.pending = pending;
}
await saveState();

const report = {
  generatedAt: new Date().toISOString(),
  source: "Helius Solana RPC + Enhanced Transactions",
  program: PROGRAM,
  pagesScannedThisRun: pages,
  maxPages: MAX_PAGES,
  checkpointBeforeRun: checkpointBefore,
  newestSignatureStored: discoveryComplete ? newestSignatureStored : checkpointBefore,
  signaturesDiscovered,
  enhancedTransactionsFetchedThisRun: fetchedThisRun,
  enhancedTransactionsMissingThisRun: missingThisRun,
  duplicateRowsSkippedThisRun,
  discoveryComplete,
  pendingCursorBefore: discoveryComplete ? null : cursorBefore,
  pendingWorkRemaining: !discoveryComplete,
  completeness: discoveryComplete ? "POLL_COMPLETE_TO_CHECKPOINT" : "HISTORICAL_CATCHUP_IN_PROGRESS",
  note: "Raw Pump program transactions only; not yet a validated mint lifecycle, bonding-curve reconstruction, strategy signal, or profitability result."
};
await writeFile(join(root, "latest-poll-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("PUMPFUN_STREAM_REPORT " + JSON.stringify(report));
