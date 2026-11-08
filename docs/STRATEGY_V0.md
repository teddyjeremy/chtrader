# chtrader strategy specification — research hypothesis v0

Status: PAPER ONLY. All thresholds below are hypotheses to test, not validated alpha.

## Market coverage

1. Pump bonding curve: Pump program interactions, curve reserves/progress, creator distribution and buy/sell pressure.
2. Migrated markets: PumpSwap canonical pools and routed swaps via Jupiter. Add direct Raydium/Meteora program adapters after validating their program IDs and parser coverage.
3. Treat a token as one continuous lifecycle with a market-state transition, not two unrelated assets. On migration, reconcile token balances, pool, quote asset, cost basis and open orders before resuming strategy.

## Strategy ranking

### A. Pullback reclaim (primary)

Required gates:
- Token has sufficient history to estimate short-term volatility and market structure.
- Prior impulse is supported by multiple independent buyers, not one wallet or a single bundled cluster.
- Pullback makes lower sell pressure over successive windows; no material liquidity/reserve deterioration.
- No high-confidence creator/insider distribution or suspicious funding cluster.
- A higher low forms and price reclaims the pullback's local pivot.
- Entry and conservative exit quotes pass the net-edge and risk-budget tests.

Entry trigger: reclaim of the local pivot after the higher low, not the first green candle.
Invalidation: lower-low break, liquidity/reserve shock, creator distribution, or loss of executable exit route.

### B. Failed-breakout retest (secondary)

Require a defined range, a close/transaction-weighted break above range resistance, and a retest that holds. Reject wick-only breaks, single-wallet volume, same-slot round trips, and rising volume without price progress.

### C. Post-migration base-and-reclaim

Migration is not an entry signal. Verify the canonical pool, quote mint, reserves, fee tier and executable price impact. Wait for the initial migration shock to settle, then require a base, higher low and reclaim. Reject thin pools, concentrated liquidity withdrawal risk, and poor exit quotes.

### D. Wallet flow confirmation (filter, not standalone alpha)

Discover wallets from winners AND losers. Reconstruct closed trades, net fees, token-level PnL, funding links, and realistic signal delay. A wallet buy can increase confidence only if the wallet was qualified using information available before that trade. Never blindly copy first-block snipers or a public leaderboard.

### E. Exhaustion/reversal (experimental)

Only consider after aggressive sellers lose impact, lower lows stop, liquidity stabilizes, and independent demand returns. Never buy solely because a sniper/dev sold.

## Entry quality gates

Hard reject if any applies:
- Sell simulation fails or no credible exit route exists.
- Estimated round-trip fees + price impact + slippage consume the required edge.
- Creator/linked wallets are distributing above a threshold learned from historical data.
- Repeated same-slot or same-transaction buy/sell activity dominates apparent volume.
- Too few independent buyers or activity is dominated by one funding cluster.
- Price impact for the intended size is excessive.
- Mint/pool state, token program, decimals or migration state cannot be verified.

## Net edge, sizing and risk

Calculate expected returns from executable quote simulations, not chart percentage:
- Net entry cost = input + entry venue fee + network/priority/rent costs + entry price impact.
- Net exit proceeds = simulated output - exit venue fee - exit price impact - expected network/priority costs.
- Require positive expected net edge and a conservative net reward/risk ratio >= 1.5 after costs, then validate this threshold out-of-sample.
- Position size is the lesser of the configured notional cap and the amount whose worst-case stop loss PLUS round-trip costs fits the portfolio risk budget.
- If minimum viable size cannot fit the risk budget, skip. Do not relax risk limits to force a $1 trade.
- Keep a fee reserve; do not count it as tradable equity.
- No martingale, no averaging down, no revenge trades, no overlapping positions initially.
- Daily/weekly loss stops disable new entries only; emergency exits remain enabled.
- Freeze entries after uncertain transaction status, failed sell or RPC/account reconciliation failure.

Initial paper profile: $2.50 equity assumption, <=$1 notional cap, one open position, 1% planned equity risk target (2% absolute ceiling only for controlled experiments). This is intentionally conservative and may result in zero trades if costs make the setup uneconomic.

## Holding and exits

- Initial stop: structure-based, sized against executable downside and risk budget.
- Trailing stop: volatility/structure adaptive; ratchet only in the favourable direction.
- Partial take-profit: only if backtests show it improves net expectancy after extra transaction costs.
- Momentum deterioration: reduce/exit when buyer breadth falls, price makes weaker highs, and sell impact increases together.
- Emergency exit: liquidity collapse, creator/cluster distribution, pool state failure or loss of route.
- Do not impose a universal 60-second hold. Test time-based decay as a fail-safe, not the primary exit.

## Wallet qualification

Score components (initial research weights): net realised expectancy 25; consistency across tokens 20; entry timing 15; exit timing/drawdown 15; copyability/liquidity 10; funding/cluster independence 10; sample quality 5.

Initial minimum evidence: >=20 closed trades, >=10 tokens, >=2 observation windows, positive net expectancy, no single token dominating profit, and execution delay survivability. Track candidate, observing, qualified, suspended and rejected states. Re-score only using information available at each historical timestamp.

## Backtest requirements

- Include dead/failed tokens, delisted pools and tokens with no successful exit.
- Use chronological walk-forward evaluation; do not tune and score on the same dates.
- Simulate latency, failed transactions, priority fees, ATA/rent costs, venue fees, price impact, slippage and partial fills.
- Separate gross PnL, realised net PnL, unrealised marked PnL and costs.
- Do not assume a trade can exit at candle close or a wallet's exact historical price.
- Report expectancy, profit factor, max drawdown, tail loss, win/loss distribution, cost ratio, turnover and trade count by strategy and venue.
- Compare against no-trade and simple buy/hold baselines.
- Do not promote a strategy until out-of-sample net expectancy is positive and drawdown is acceptable over multiple regimes.

## Small-account economics

Pump's documented bonding-curve fee is 1.25% per side. A $1 round trip therefore loses roughly 2.5 cents to venue fees alone before network fees, priority fees, slippage and price impact. A trade that targets tiny price moves is structurally unsuitable. The engine must estimate all costs and skip trades whose edge is insufficient. Fee schedules must be versioned by date and venue, not hard-coded as a timeless constant.

## Current data limitations

The October collector captures Pump bonding-curve, PumpSwap and Jupiter-routed program interactions. Jupiter routes may overlap direct pool activity. This is not yet a complete Solana DEX census or a full historical OHLCV feed. Historical pool states, executable quotes, creator funding graphs and all DEX-specific parsers remain separate enrichment tasks.
