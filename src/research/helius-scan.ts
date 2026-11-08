import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

type ScanStats = {
  job: string;
  pages: number;
  returnedTransactions: number;
  scannedTransactions: number;
  matchedTransactions: number;
  creditsCharged: number;
  stoppedOn: string;
  complete: boolean;
  outputPath: string;
};

type ScanCheckpoint = ScanStats & {
  paginationToken?: string | null;
  scannedThrough?: { slot?: number; blockTime?: number } | null;
  updatedAt?: string;
};

export type ScanJob = {
  name: string;
  address: string;
  match: { programs: Array<{ programId: string; instructions?: string[] }> };
  start: number;
  end: number;
  /** 0 means continue until Helius reports windowEnd. */
  maxPages: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

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
      // Parsed fields are sufficient for our research tables. Omitting the
      // original raw transaction materially reduces storage and artifact size.
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

export async function runScan(apiKey: string, job: ScanJob): Promise<ScanStats> {
  const outDir = join("data", "raw");
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, `${job.name}-october-2026.jsonl`);
  const checkpointPath = join(outDir, `${job.name}-october-2026.checkpoint.json`);

  let saved: ScanCheckpoint | undefined;
  if (await exists(checkpointPath)) {
    try { saved = JSON.parse(await readFile(checkpointPath, "utf8")) as ScanCheckpoint; }
    catch { saved = undefined; }
  }

  if (saved?.complete && await exists(outputPath)) {
    console.log(`Skipping completed scan ${job.name}; checkpoint already says windowEnd.`);
    return { ...saved, outputPath };
  }

  // A checkpoint without its raw file cannot be resumed safely. If a prior
  // attempt stopped without a cursor, restart this program cleanly rather than
  // append a duplicate first page on every subsequent run.
  if (!await exists(outputPath) || (saved && !saved.complete && !saved.paginationToken)) {
    saved = undefined;
    await writeFile(outputPath, "", "utf8");
  } else if (!saved) {
    await writeFile(outputPath, "", "utf8");
  }

  const stats: ScanStats = {
    job: job.name,
    pages: saved?.pages ?? 0,
    returnedTransactions: saved?.returnedTransactions ?? 0,
    scannedTransactions: saved?.scannedTransactions ?? 0,
    matchedTransactions: saved?.matchedTransactions ?? 0,
    creditsCharged: saved?.creditsCharged ?? 0,
    stoppedOn: saved?.stoppedOn ?? "not_started",
    complete: false,
    outputPath
  };

  let paginationToken = saved?.paginationToken ?? undefined;
  let pagesThisRun = 0;

  while (job.maxPages === 0 || pagesThisRun < job.maxPages) {
    let page: ScanPage | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt < Number(process.env.HELIUS_MAX_RETRIES ?? 6); attempt++) {
      try {
        page = await requestPage(apiKey, job, paginationToken);
        break;
      } catch (error) {
        lastError = error;
        const delay = Math.min(60_000, 1_500 * 2 ** attempt) + Math.floor(Math.random() * 500);
        console.warn(`Retry ${attempt + 1} for ${job.name}: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(delay);
      }
    }
    if (!page) throw lastError instanceof Error ? lastError : new Error("Helius request failed");

    const rows = Array.isArray(page.data) ? page.data : [];
    if (rows.length) {
      await appendFile(outputPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
    }

    stats.pages++;
    pagesThisRun++;
    stats.returnedTransactions += rows.length;
    stats.scannedTransactions += page.scan?.scannedTransactions ?? 0;
    stats.matchedTransactions += page.scan?.matchedTransactions ?? rows.length;
    stats.creditsCharged += page.scan?.creditsCharged ?? 0;
    stats.stoppedOn = page.scan?.stoppedOn ?? "unknown";

    const next = page.paginationToken ?? undefined;
    stats.complete = !next && stats.stoppedOn === "windowEnd";

    // Persist the cursor after every page. If a run is interrupted, the next
    // workflow run restores this directory from Actions cache and resumes here.
    const checkpoint: ScanCheckpoint = {
      ...stats,
      paginationToken: next ?? null,
      scannedThrough: page.scan?.scannedThrough ?? null,
      updatedAt: new Date().toISOString()
    };
    await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    console.log(JSON.stringify({
      job: stats.job,
      page: stats.pages,
      pagesThisRun,
      returnedTransactions: stats.returnedTransactions,
      scannedTransactions: stats.scannedTransactions,
      matchedTransactions: stats.matchedTransactions,
      creditsCharged: stats.creditsCharged,
      stoppedOn: stats.stoppedOn,
      complete: stats.complete
    }));

    if (stats.complete) break;
    if (!next) {
      console.error(`Scan ${job.name} stopped on ${stats.stoppedOn} without a pagination token; it is NOT complete.`);
      break;
    }
    if (next === paginationToken) {
      stats.stoppedOn = "pagination_stalled";
      await writeFile(checkpointPath, JSON.stringify({ ...stats, paginationToken: null, updatedAt: new Date().toISOString() }, null, 2));
      break;
    }
    paginationToken = next;
  }

  return stats;
}
