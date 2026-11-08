import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HELIUS_SCAN_URL = "https://mainnet.helius-rpc.com/v1/parsed-events/scan";

type ScanPage = {
  data?: unknown[];
  paginationToken?: string | null;
  scan?: {
    stoppedOn?: string;
    scannedTransactions?: number;
    matchedTransactions?: number;
    creditsCharged?: number;
    scannedThrough?: { slot?: number; blockTime?: number };
  };
  error?: string;
};

export type ScanJob = {
  name: string;
  address: string;
  match: { programs: Array<{ programId: string; instructions?: string[] }> };
  start: number;
  end: number;
  maxPages: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestPage(
  apiKey: string,
  job: ScanJob,
  paginationToken?: string
): Promise<ScanPage> {
  const response = await fetch(`${HELIUS_SCAN_URL}?api-key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address: job.address,
      match: job.match,
      time: { gte: job.start, lt: job.end },
      status: "any",
      returnShape: "transactions",
      rawTransaction: "json",
      limit: 100,
      budget: { maxScannedTransactions: 10_000 },
      ...(paginationToken ? { paginationToken } : {})
    }),
    signal: AbortSignal.timeout(60_000)
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Helius scan HTTP ${response.status}: ${body.slice(0, 1200)}`);
  }

  const parsed = JSON.parse(body) as ScanPage;
  if (parsed.error) throw new Error(`Helius scan error: ${parsed.error}`);
  return parsed;
}

export async function runScan(apiKey: string, job: ScanJob) {
  const outDir = join("data", "raw");
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, `${job.name}-october-2026.jsonl`);
  const checkpointPath = join(outDir, `${job.name}-october-2026.checkpoint.json`);
  await writeFile(outputPath, "", "utf8");
  const stats = {
    job: job.name,
    pages: 0,
    returnedTransactions: 0,
    scannedTransactions: 0,
    matchedTransactions: 0,
    creditsCharged: 0,
    stoppedOn: "not_started",
    complete: false,
    outputPath
  };

  let paginationToken: string | undefined;
  let previousToken: string | undefined;

  while (stats.pages < job.maxPages) {
    let page: ScanPage | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt < Number(process.env.HELIUS_MAX_RETRIES ?? 5); attempt++) {
      try {
        page = await requestPage(apiKey, job, paginationToken);
        break;
      } catch (error) {
        lastError = error;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 300);
        await sleep(delay);
      }
    }
    if (!page) throw lastError instanceof Error ? lastError : new Error("Helius request failed");

    const rows = Array.isArray(page.data) ? page.data : [];
    if (rows.length) {
      await appendFile(outputPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
    }

    stats.pages++;
    stats.returnedTransactions += rows.length;
    stats.scannedTransactions += page.scan?.scannedTransactions ?? 0;
    stats.matchedTransactions += page.scan?.matchedTransactions ?? rows.length;
    stats.creditsCharged += page.scan?.creditsCharged ?? 0;
    stats.stoppedOn = page.scan?.stoppedOn ?? "unknown";

    const next = page.paginationToken ?? undefined;
    await writeFile(checkpointPath, JSON.stringify({
      ...stats,
      paginationToken: next ?? null,
      scannedThrough: page.scan?.scannedThrough ?? null,
      updatedAt: new Date().toISOString()
    }, null, 2));

    if (!next) { stats.complete = page.scan?.stoppedOn === "windowEnd"; break; }
    if (next === paginationToken || next === previousToken) {
      stats.stoppedOn = "pagination_stalled";
      break;
    }
    previousToken = paginationToken;
    paginationToken = next;
  }

  return stats;
}
