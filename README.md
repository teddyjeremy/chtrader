# chtrader

Research-first Solana meme-coin trading system. This repository is a historical data collector and strategy research scaffold with a paper-trading engine; it is not a live trading bot. No live signing or order submission is enabled.

## October 2026 Helius research

1. Add the Helius key as the GitHub Actions repository secret `HELIUS_API_KEY`. Never commit or paste the key into source code or chat.
2. Open **Actions → October 2026 Solana research → Run workflow**.
3. Use `max_pages=0` to continue each program scan until the October window is exhausted. A positive value runs a bounded batch and saves its cursor for the next run.
4. Wait for the workflow and download the artifact named `chtrader-october-2026-research-<run id>`.
5. Check `derived/october-2026-collection-report.json`: every program must say `complete: true`, with `stoppedOn: windowEnd`, before calling the program backfill complete.

The workflow checkpoints after every page and restores raw pages/checkpoints from GitHub Actions cache on later runs. It uploads raw JSONL, checkpoint JSON, derived CSVs and reports. Watch Helius credit usage.

## Current coverage

- Pump bonding curve (create/buy/sell instruction families)
- PumpSwap
- Raydium AMM v4, CPMM and CLMM
- Meteora DLMM, DAMM v1 and DAMM v2
- Jupiter v6 routed swaps

This is not every Solana DEX or launchpad, and does not by itself provide historical executable quotes or full pool reserve snapshots. See [docs/OCTOBER_DATA_PLAN.md](docs/OCTOBER_DATA_PLAN.md).

## Research scripts

- `npm run research:october` — paginated October collection
- `npm run research:derive` — swap, wallet activity and token activity CSV extraction
- `npm run typecheck` — TypeScript validation
- `npm run test:risk` — existing risk-analysis tests
- `npm run test:entry` — strict entry-rule tests
- `npm run test:paper-engine` — paper entry timing and execution-safety tests
- `npm run test:adaptive-exit` — adaptive-exit unit tests

## Strategy and evidence

- [Frozen entry and adaptive-exit rules](docs/ADAPTIVE_ENTRY_EXIT_RULES_V1.md)
- [Six-coin validation summary](research/six-coin/VALIDATION_SUMMARY.md)
- [Coin 1 and 2 adaptive-exit report](research/six-coin/COIN1_2_ADAPTIVE_EXIT_REPORT.md)
- [Profit-protection comparison](research/six-coin/PROFIT_PROTECTION_RESEARCH.md)
- [Coin 6 full replay report](research/six-coin/coin6/COIN6_ADAPTIVE_RESEARCH_REPORT.md)

The six-coin sample is small and not proof of profitability. Coin selection/rug-risk screening is a separate next research phase. Paper mode only.
