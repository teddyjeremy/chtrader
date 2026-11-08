# October 2026 research plan

## 1. Finish collection before drawing strategy conclusions

The first 5-page run was only a recent-activity sample from the end of October. Every program stopped on Helius `limit`; it is not a month-wide sample. The replacement workflow:

- Uses the exact UTC window 2026-10-01 00:00:00 inclusive through 2026-11-01 00:00:00 exclusive.
- Follows each Helius pagination cursor until `scan.stoppedOn=windowEnd` and no cursor remains.
- Saves a checkpoint after every page and restores raw pages/checkpoints from GitHub Actions cache on the next run.
- Uses `max_pages=0` for an uncapped run. A positive value is a deliberate partial batch; subsequent runs resume from the saved cursor.
- Uploads raw JSONL, per-program checkpoints, reports and all derived CSV files.
- Omits the original raw transaction blob because the research pipeline uses parsed transaction fields; this reduces artifact size.

The Helius credit cost depends on the number of history pages scanned and must be watched in the Helius dashboard. Do not interpret a timed-out, budget-stopped, capped or errored scan as complete.

## 2. Repair and validate parsing

The first derivation had a parser-path bug: Helius puts swap data in `parsed.parsedData`, while the script only checked `parsed.summary.parsedData`. The parser now checks both. The first sample therefore undercounted recognized swaps, wallets and tokens. Re-run derivation over the retained raw files before analysing the sample.

The current wallet field is `feePayer`, which is only a proxy for trader identity when relayers or sponsored transactions are involved. Preserve the raw identity evidence and qualify wallet attribution before calculating PnL.

## 3. Build a complete research universe, not just winners

Maintain separate, append-only records for:

- Every token creation discovered from Pump create instructions.
- Every token observed in bonding-curve and migrated-pool trades.
- Every trade/setup decision, including accepted, rejected, watchlist and unclassified.
- Multiple rejection reasons, strategy version, timestamp and the exact feature snapshot used.
- Later outcomes for rejected as well as accepted tokens.

A token rejected for one setup must remain observable and may qualify for a later setup. Never delete rejected tokens from the research universe.

## 4. Reconstruct market lifecycle and prices

Join launch events, mint metadata, bonding-curve state, migration events, canonical pool IDs, pool reserves and swap events. Include Pump bonding curve, PumpSwap, Raydium and Meteora venues; use Jupiter as route evidence, not as a second independent venue trade when it wraps a direct pool swap.

Build time-aligned price/liquidity snapshots at launch and at 1s, 5s, 15s, 30s, 1m, 5m, 15m, 1h, 6h and 24h where source coverage permits. Record unknowns explicitly. Do not fabricate historical prices or infer executable depth from transaction volume.

## 5. Research questions

### Market structure
- How many launches occurred, and how many reached each migration state?
- What fraction had a viable sell route at 1s/5s/15s/30s/1m?
- How concentrated were first-block buyers, top holders, creators and funding clusters?
- How often did liquidity disappear or fall materially after launch/migration?
- Which venues and pool types supported reliable exits?

### Wallet quality
- Reconstruct wallet-token cost basis and realised PnL, including fees.
- Keep unsold holdings unrealised; never count them as realised zero or profit.
- Measure wallet performance across independent tokens and time periods.
- Replay entries after 1s, 3s, 5s, 10s and 30s delays. A wallet is not copyable if the edge disappears after realistic delay.
- Detect shared funders, synchronized buys/sells, bundles and same-slot round trips.

### Strategy comparison
Test, with identical execution assumptions:
1. Pullback higher-low and pivot reclaim.
2. Failed-breakout retest.
3. Post-migration base-and-reclaim.
4. Wallet flow as a confirmation filter only.
5. Buy-and-hold and no-trade baselines.

Do not optimise thresholds and report results on the same dates. Use chronological train/validation/test windows and report by venue and token lifecycle.

## 6. Trading decision gates

For every candidate and rejected setup, estimate:
- Actual quote amount and decimals.
- Entry and exit venue fees at the relevant date.
- Priority/network/rent costs.
- Price impact and slippage at the intended notional.
- Sell-route availability and simulated exit proceeds.
- Creator/insider distribution and liquidity changes.
- Independent buyer breadth and suspicious same-slot/round-trip activity.

Only paper-trade when conservative net expectancy remains positive after all costs and the risk budget supports the minimum viable size. With a very small account, a nominal $1 trade may be uneconomic; skip rather than relax the gates.

## 7. Known limitations after full program backfill

Even a complete backfill of these nine programs is not a complete Solana DEX census. It will not automatically include every launchpad, every pool program, off-chain quote, historical pool reserve state, or every token created without a matching scanned instruction. Historical executable quotes and token metadata/decimals must be joined from appropriate sources. State the coverage boundary in every report.
