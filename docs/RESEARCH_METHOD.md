# October 2026 research method

## What the first collector does

- Pump bonding-curve instructions.
- PumpSwap instructions.
- Jupiter v6 routed swaps, which can expose migrated-token activity through multiple venues.
- Raw parsed transaction records are written as JSONL. The collection report records pagination and credit counters.

## Important limits

1. Program history is high-volume. Start with 25 pages, inspect the artifact, then increase the cap. A partial scan must never be labelled complete.
2. PumpSwap and Jupiter results can overlap when a Jupiter route invokes PumpSwap. Deduplicate by transaction signature plus instruction index, not signature alone.
3. Direct Raydium/Meteora coverage is not yet complete. Add their program IDs and parser names only after validating official IDs and decoded fields.
4. The first collector does not reconstruct pool reserve snapshots or executable historical quotes. It is a transaction/event dataset, not a complete OHLCV feed.
5. A strategy backtest cannot honestly claim profitability until historical pool prices, liquidity, venue fee schedules and realistic execution costs are joined to each trade.

## Required derived tables

- tokens: mint, launch timestamp, creator, decimals, token program, migration timestamp, canonical pool.
- swaps: signature, slot, block time, market venue, pool, mint, trader, side, quote amount, token amount, fee, success.
- wallet_token_positions: wallet, mint, cumulative token balance, quote cost basis, realised PnL, unrealised mark, first/last trade.
- wallet_edges: funding source, recipient, timestamp, amount, evidence type, confidence.
- pool_snapshots: pool, timestamp, base/quote reserves, price, executable depth, LP changes.
- signals: token, timestamp, setup, feature values, decision, rejection reasons.
- simulated_trades: signal time, delayed entry quote, delayed exit quote, fees, slippage, net PnL, exit reason.

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

Use walk-forward time splits. Report trade count, net expectancy, profit factor, max drawdown, worst 1% trade, fees as a fraction of gross gains, turnover and results by venue.