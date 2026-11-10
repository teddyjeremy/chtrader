import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
// Anchor discriminator for Pump.fun's original create instruction.
const CREATE_DISCRIMINATOR = "181ec828051c0777";
const START_UTC = Date.parse(process.env.START_UTC ?? "2026-11-08T21:00:00Z"); // 9 Nov 00:00 EAT
const END_UTC = Date.parse(process.env.END_UTC ?? "2026-11-09T21:00:00Z"); // exclusive; 10 Nov 00:00 EAT
const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES ?? 30));
const API_KEY = process.env.HELIUS_API_KEY;
if (!API_KEY) throw new Error("HELIUS_API_KEY is required");
if (!(START_UTC < END_UTC)) throw new Error("Invalid UTC cohort window");

const out = join("data", "nov-09-cohort");
await mkdir(out, { recursive: true });
const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(API_KEY);
const enhancedUrl = "https://api.helius.xyz/v0/transactions?api-key=" + encodeURIComponent(API_KEY);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let rpcLast = 0;
let enhancedLast = 0;

async function rpc(method: string, params: unknown[]): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const delay = Math.max(0, rpcLast + 750 - Date.now());
    if (delay) await wait(delay);
    rpcLast = Date.now();
    const response = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "nov9-cohort", method, params }),
      signal: AbortSignal.timeout(60_000)
    });
    const body = await response.json() as any;
    if (response.ok && !body.error) return body.result;
    const detail = JSON.stringify(body).slice(0, 500);
    if (response.status !== 429 && response.status < 500) throw new Error(method + ": " + detail);
    await wait(Math.min(60_000, 1500 * 2 ** attempt));
  }
  throw new Error(method + " retries exhausted");
}

async function enhanced(signatures: string[]): Promise<any[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const delay = Math.max(0, enhancedLast + 2000 - Date.now());
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
    if (response.status !== 429 && response.status < 500) throw new Error("Enhanced API: " + detail.slice(0, 500));
    if (/credit|monthly quota|out of quota/i.test(detail)) throw new Error("Helius quota exhausted: " + detail.slice(0, 500));
    await wait(Math.min(60_000, 2000 * 2 ** attempt));
  }
  throw new Error("Enhanced API retries exhausted");
}

function base58ToHex(value: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return "";
    number = number * 58n + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;
  return "00".repeat(zeros) + hex;
}

function instructionsOf(tx: any): any[] {
  const found: any[] = [];
  const visit = (value: any): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== "object") return;
    if (typeof value.programId === "string" || typeof value.program === "string") found.push(value);
    for (const key of ["instructions", "innerInstructions", "compiledInstructions"]) {
      if (value[key]) visit(value[key]);
    }
  };
  visit(tx.instructions);
  visit(tx.transaction?.message?.instructions);
  visit(tx.events);
  return found;
}

function launchMints(tx: any): { mint: string; signature: string; timestamp: number; slot: number; discriminator: string }[] {
  const results: { mint: string; signature: string; timestamp: number; slot: number; discriminator: string }[] = [];
  for (const ix of instructionsOf(tx)) {
    const program = String(ix.programId ?? ix.program ?? "");
    if (program !== PUMP_PROGRAM) continue;
    const data = String(ix.data ?? "");
    const hex = /^[0-9a-f]+$/i.test(data) ? data.toLowerCase() : base58ToHex(data).toLowerCase();
    if (hex.slice(0, 16) !== CREATE_DISCRIMINATOR) continue;
    const accounts = Array.isArray(ix.accounts) ? ix.accounts : [];
    const first = accounts[0];
    const mint = typeof first === "string" ? first : String(first?.pubkey ?? first?.address ?? "");
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) continue;
    results.push({
      mint, signature: String(tx.signature ?? ""),
      timestamp: Number(tx.timestamp ?? tx.blockTime ?? 0),
      slot: Number(tx.slot ?? 0), discriminator: hex.slice(0, 16)
    });
  }
  return results;
}

const signatures: any[] = [];
let before: string | undefined;
let pages = 0;
let reachedStart = false;
while (pages < MAX_PAGES && !reachedStart) {
  const options: Record<string, unknown> = { limit: 1000, commitment: "finalized" };
  if (before) options.before = before;
  const page = await rpc("getSignaturesForAddress", [PUMP_PROGRAM, options]) as any[];
  pages++;
  if (!page.length) { reachedStart = true; break; }
  for (const item of page) {
    const blockTime = Number(item.blockTime ?? 0);
    if (blockTime > 0 && blockTime >= START_UTC / 1000 && blockTime < END_UTC / 1000) signatures.push(item);
    if (blockTime > 0 && blockTime < START_UTC / 1000) reachedStart = true;
  }
  before = page[page.length - 1].signature;
  console.log(JSON.stringify({ stage: "signature-discovery", pages, pageSize: page.length, cohortSignatures: signatures.length, reachedStart }));
  if (page.length < 1000) { reachedStart = true; break; }
}
await writeFile(join(out, "pump-program-signatures.json"), JSON.stringify(signatures, null, 2));

const rawPath = join(out, "pump-program-transactions.jsonl");
await writeFile(rawPath, "");
const launches = new Map<string, { mint: string; signature: string; timestamp: number; slot: number; discriminator: string }>();
let fetched = 0;
let missing = 0;
for (let offset = 0; offset < signatures.length; offset += 100) {
  const batch = signatures.slice(offset, offset + 100);
  const transactions = await enhanced(batch.map(row => row.signature));
  const bySignature = new Map(transactions.map(tx => [String(tx.signature), tx]));
  for (const signature of batch) {
    const tx = bySignature.get(signature.signature);
    if (!tx) { missing++; continue; }
    fetched++;
    await appendFile(rawPath, JSON.stringify(tx) + "\n");
    for (const launch of launchMints(tx)) {
      const prior = launches.get(launch.mint);
      if (!prior || launch.timestamp < prior.timestamp) launches.set(launch.mint, launch);
    }
  }
  console.log(JSON.stringify({ stage: "transaction-enrichment", processed: Math.min(offset + 100, signatures.length), total: signatures.length, fetched, missing, discoveredMints: launches.size }));
}
const launchRows = [...launches.values()].sort((a, b) => a.timestamp - b.timestamp);
const csv = ["mint,launch_signature,launch_time_utc,launch_time_eat,slot,discriminator",
  ...launchRows.map(row => [
    row.mint, row.signature, new Date(row.timestamp * 1000).toISOString(),
    new Date(row.timestamp * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    String(row.slot), row.discriminator
  ].map(value => /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value).join(","))].join("\n") + "\n";
await writeFile(join(out, "launch-cohort.csv"), csv);
await writeFile(join(out, "launch-cohort.json"), JSON.stringify(launchRows, null, 2));
const report = {
  cohort: "2026-11-09 EAT",
  startUtc: new Date(START_UTC).toISOString(),
  endUtcExclusive: new Date(END_UTC).toISOString(),
  pumpProgram: PUMP_PROGRAM,
  createDiscriminator: CREATE_DISCRIMINATOR,
  pagesScanned: pages,
  maxPages: MAX_PAGES,
  signatureHistoryReachedStart: reachedStart,
  cohortPumpProgramSignatures: signatures.length,
  enhancedTransactionsFetched: fetched,
  enhancedTransactionsMissing: missing,
  uniqueLaunchMintsDiscovered: launchRows.length,
  completeness: reachedStart ? "signature-scan-reached-cohort-start" : "INCOMPLETE_PAGE_LIMIT_REACHED",
  limitations: [
    "This first pass discovers original Pump.fun create-instruction launches only; other create instruction variants may be absent.",
    "It enriches Pump program transactions in the cohort, not yet every mint's complete lifecycle.",
    "It does not claim V2 BUY/REJECT/WATCH decisions or paper fills. Curve state, exact reserve deltas, holder and wallet attribution, taxes, and executable quotes still need reconstruction.",
    "A missing enhanced transaction is unknown evidence, never proof of no activity."
  ],
  generatedAt: new Date().toISOString()
};
await writeFile(join(out, "discovery-quality-report.json"), JSON.stringify(report, null, 2));
console.log("COHORT_DISCOVERY_REPORT " + JSON.stringify(report));
