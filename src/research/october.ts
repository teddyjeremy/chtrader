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
const maxPages = Number(process.env.HELIUS_MAX_PAGES ?? 250);

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
const results = [];

for (const job of jobs) {
  console.log(`Starting ${job.name} October backfill`);
  const result = await runScan(apiKey, job);
  results.push(result);
  console.log(JSON.stringify({
    job: result.job,
    pages: result.pages,
    returnedTransactions: result.returnedTransactions,
    scannedTransactions: result.scannedTransactions,
    matchedTransactions: result.matchedTransactions,
    creditsCharged: result.creditsCharged,
    stoppedOn: result.stoppedOn
  }));
}

const report = {
  period: { startUtc: "2026-10-01T00:00:00Z", endExclusiveUtc: "2026-11-01T00:00:00Z" },
  note: "This is a program-interaction sample, not a complete census of every Solana DEX trade. Jupiter-routed transactions may overlap direct venue scans.",
  results,
  generatedAt: new Date().toISOString()
};
await writeFile("data/derived/october-2026-collection-report.json", JSON.stringify(report, null, 2));
console.log("Collection report written to data/derived/october-2026-collection-report.json");
