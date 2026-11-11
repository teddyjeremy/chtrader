# Bot rule standing — V2 research candidate

## Status

**Paper-only. Not approved for live trading.** The six-coin sample is small, selected and reconstructed. Thresholds are explicit research guardrails, not proven profitability. The implementation is versioned as `pump-curve-entry-v2-persistent-risk-gated`.

## Entry — Pump bonding curve only

1. Only consider tokens still on the Pump.fun bonding curve. Never enter after migration.
2. Require at least +20% impulse over the prior 60 seconds.
3. Require a 10–40% pullback from the recent 60-second high.
4. Require reclaim of the previous 5-second high by at least +1%.
5. Require three completed 2-second rolling buy-flow windows sampled one second apart.
6. In each window, buy quote must exceed sell quote by more than 3x.
7. Each window must have at least 3 distinct buyers; sellers must be no more than half the buyer count.
8. Largest buyer must account for no more than 72% of buy quote in each window.
9. Require at least 5 distinct buyer wallets across the three windows.
10. Require verified creator identity and recent creator/related-wallet evidence. Missing or stale evidence means WATCH.
11. Reject creator sales above 0.05% of supply in the rolling 60-second window. Also reject when the creator has cumulatively sold more than 25% of the recorded initial allocation at any time since launch; this lifetime veto persists after the first 60 seconds. Creator-linked sales above 0.25% and high-confidence related-cluster sales above 0.25% remain vetoes. Missing or incomplete launch-to-now creator-sale history means WATCH, never BUY.
12. Reject high-confidence related clusters (confidence >= 0.70) controlling more than 35% of recent buy volume or more than 20% of supply. Low-confidence cluster signals mean WATCH, not an automatic malicious label.
13. Require verified buy/sell token transfer taxes and quote-asset mint, decimals, transfer tax and fresh SOL conversion. Either token tax above 2% or effective round-trip costs above 4% means REJECT. Unknown tax/conversion means WATCH.
14. Require fresh market state, a verified curve exit route, and entry/exit impact no greater than 2% each.
15. Enter only on the next completed one-second frame after rechecking every gate. Never average down.

## Exit — adaptive profit protection

1. Initial hard stop: 5% below entry.
2. Activate profit protection only after a completed bar confirms at least +10% favourable movement.
3. Wide runner trail: 40% below the previous completed high-water mark.
4. Ratchet gross-profit floors from the previous peak:
   - +10% peak: protect +5% gross.
   - +50% peak: protect +15% gross.
   - +100% peak: protect +40% gross.
   - +200% peak: protect +80% gross.
5. Effective stop is the highest of hard stop, trailing stop and protected floor; it never moves down.
6. 300 seconds is a safety ceiling, not a fixed target.
7. Exit before migration; do not carry a curve-only position into PumpSwap.
8. No fixed 60-second liquidation, fixed take-profit, mandatory scale-outs, or flow-only exits. One red candle or one large seller is not by itself an exit signal.

## Runtime and risk limits

- Paper mode only; maximum 3 simultaneous positions.
- Default paper starting equity: 0.05 SOL; maximum position: 0.006 SOL; per-trade risk fraction: 1%.
- Position sizing includes modeled round-trip cost and the 5% hard-stop distance.
- Missing creator, flow, tax, quote conversion or market-state evidence must never become a BUY.
- The market snapshot pipeline normalizes quote-denominated price, liquidity and volume to SOL using verified conversion metadata.
- The paper runtime waits for the next completed one-second frame and delegates exits to the adaptive exit manager.
- No signer, wallet key, transaction submission or live order path is part of this runtime.

## Historical evidence — not a performance promise

- Coin 1: one strict signal; adaptive exits hit the hard stop, approximately −8.30% modeled net.
- Coin 2: zero strict entries. A separate exploratory Candidate B was positive but is not a strict-rule validation.
- Coin 3: two strict entries; the earlier report showed strong positive modeled outcomes, but only two observations.
- Coin 4: zero strict entries. Relaxed pivot sensitivity is exploratory only.
- Coin 5: five strict trades; four losses and one win in the earlier baseline, demonstrating that short-window buying pressure alone is insufficient.
- Coin 6: one strict signal; the progressive profit floor improved the single replay to approximately +1.36% modeled net.

These samples are not independent or large enough to establish expectancy. Do not count exploratory entries as strict results.

## Remaining engineering and validation

- Connect a real Helius WebSocket/RPC producer to the market snapshot pipeline.
- Decode Pump curve reserves, phase transitions, exact quote/token amounts and executable buy/sell quotes.
- Implement independently checked creator/related-wallet attribution and holder-balance snapshots.
- Decode Token-2022 transfer-fee extensions and current-epoch fee schedules.
- Add a verified quote-to-SOL oracle with timestamps and source metadata.
- Model priority fees, tips, failed transactions, partial fills, confirmation delays and migration-time execution.
- Replay all six coins with this exact version, then test a larger untouched token set out of sample.
- Compare every accepted/rejected signal, entry/exit reason, costs, max drawdown and equity curve. Do not loosen rules to manufacture trades.

**No profitability guarantee. Do not enable live trading from this research result.**
