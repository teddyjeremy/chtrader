# October 2026 research method

## Collection

The manual GitHub Actions workflow scans the exact UTC interval 2026-10-01 inclusive to 2026-11-01 exclusive across Pump bonding curve, PumpSwap, Raydium AMM v4/CPMM/CLMM, Meteora DLMM/DAMM v1/v2 and Jupiter v6 routes.

- Set `max_pages=0` to follow pagination until Helius reports `windowEnd`.
- Positive `max_pages` values are intentionally partial batches; the saved cursor resumes on the next workflow run.
- Raw JSONL and per-program checkpoints are restored/saved with GitHub Actions cache.
- The artifact includes raw JSONL, checkpoints, collection/derive reports and CSVs.
- The original raw transaction payload is omitted to reduce storage; parsed instructions, transfers and summaries are retained.
- Failed transactions are included in the raw research data. They must not be counted as successful trades or wallet PnL.

A scan is complete only when no pagination token remains and `scan.stoppedOn=windowEnd`. A page cap, Helius budget/deadline, API error or timeout is incomplete. Monitor Helius credits: the full month may require substantially more requests than the initial sample.

## Important limits

1. This is a program-level dataset, not a complete census of every Solana DEX, launchpad or token transfer.
2. Pump create instructions are included to help build a token universe; other DEX program scans include all instructions to preserve swap, liquidity and pool lifecycle evidence.
3. PumpSwap/Jupiter/direct venue transactions can overlap. Reconcile by signature and instruction/route evidence; do not double-count Jupiter as a separate pool fill.
4. The first artifact stopped at five pages per program and only covered the final moments of October 31. It is not a month-wide sample.
5. The initial derive script missed top-level `parsed.parsedData`; this has been fixed. Re-run derivation on the retained sample before using its swap counts.
6. Historical pool states, executable quotes, decimals, token metadata, creator funding graphs and full wallet cost basis still require enrichment.

## Required derived tables

- tokens: mint, launch timestamp, creator, decimals, token program, migration timestamp, canonical pool.
- swaps: signature, slot, block time, market venue, pool, mint, trader, side, quote amount, token amount, fee, success.
- wallet_token_positions: wallet, mint, cumulative token balance, quote cost basis, realised PnL, unrealised mark, first/last trade.
- wallet_edges: funding source, recipient, timestamp, amount, evidence type, confidence.
- pool_snapshots: pool, timestamp, base/quote reserves, price, executable depth, LP changes.
- signals: token, timestamp, setup, feature values, decision, rejection reasons.
- token_outcomes: token/setup, rejection or acceptance time, subsequent return/MFE/MAE, liquidity change, migration and exit-route status.

## Preserve rejected tokens

Do not filter rejected tokens out of ingestion or delete their records. Record all token launches and observations, then attach append-only setup decisions: accepted, rejected, watchlist or unclassified. Store every rejection reason, strategy version and feature snapshot. Continue measuring what happened after rejection so the research can count both losses avoided and profitable opportunities missed.

## Avoiding false wallet alpha

- Include losing wallets and wallets that never exit.
- Exclude transfers, mints and airdrops from trading PnL.
- Separate realised from unrealised PnL.
- Treat unsold inventory as unknown/marked, not zero profit or realised profit.
- Detect creator funding links, shared funders, synchronized buys, common exit timing and repeated wallet clusters.
- Require out-of-sample consistency across tokens and dates.
- Replay each wallet signal after 1s, 3s, 5s, 10s and 30s delays where historical quote data permits. If returns vanish after delay, the wallet is not copyable.

## First strategy experiment

Compare with identical costs and risk limits: pullback reclaim; failed-breakout retest; post-migration base-and-reclaim; wallet-flow confirmation as a filter; buy-and-hold baseline; and no-trade baseline.

Use walk-forward time splits. Report trade count, net expectancy, profit factor, max drawdown, worst 1% trade, fees as a fraction of gross gains, turnover and results by venue and token lifecycle.
