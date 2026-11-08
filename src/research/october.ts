import { mkdir, writeFile } from "node:fs/promises";
import { PROGRAMS } from "./programs.js";
import { runScan } from "./helius-scan.js";

const apiKey = process.env.HELIUS_API_KEY;
if (!apiKey) {
  throw new Error("HELIUS_API_KEY is missing. Set it as a GitHub Actions secret; never put it in source code.");
}

// UTC boundaries: include all of October 2026, exclude Nov 1.
const start = Math.floor(Date.UTC(2026, 9, 1, 0, 0, 0) / 1000);
const end = Math.floor(Date.UTC(2026, 10, 1, 0, 0, 0) / 1000);
const maxPages = Number(process.env.HELIUS_MAX_PAGES ?? 0);
if (!Number.isInteger(maxPages) || maxPages < 0) {
  throw new Error("HELIUS_MAX_PAGES must be 0 (unlimited) or a positive integer.");
}

const jobs = PROGRAMS.map((program) => ({
  name: program.name,
  address: program.programId,
  match: {
    programs: [{
      programId: program.programId,
      ...(program.instructions ? { instructions: program.instructions } : {})
    }]
  },
  start,
  end,
  maxPages
}));

await mkdir("data/derived", { recursive: true });
const results: Array<Record<string, unknown>> = [];

for (const job of jobs) {
  console.log(`Starting/resuming ${job.name} October backfill (page cap: ${maxPages || "unlimited"})`);
  try {
    const result = await runScan(apiKey, job);
    results.push(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Scan failed for ${job.name}: ${message}`);
    results.push({ job: job.name, complete: false, error: message });
  }
}

const completeCount = results.filter((result) => result.complete === true).length;
const report = {
  period: { startUtc: "2026-10-01T00:00:00Z", endExclusiveUtc: "2026-11-01T00:00:00Z" },
  coverage: "Program-level history for the registered Pump, PumpSwap, Raydium, Meteora and Jupiter programs. This is not every Solana DEX or every token transfer.",
  pagination: "A program is complete only when Helius returns no pagination token and scan.stoppedOn is windowEnd. Any limit, budget, deadline, error or page cap remains incomplete.",
  resume: "Per-program raw JSONL and pagination checkpoints are retained in GitHub Actions cache between workflow runs.",
  results,
  completePrograms: completeCount,
  totalPrograms: jobs.length,
  allComplete: completeCount === jobs.length,
  generatedAt: new Date().toISOString()
};
await writeFile("data/derived/october-2026-collection-report.json", JSON.stringify(report, null, 2));
console.log(`October collection status: ${completeCount}/${jobs.length} program scans reached windowEnd.`);
if (completeCount !== jobs.length) process.exitCode = 1;
