# Pump.fun entry and adaptive-exit rules — v1 research freeze

**Scope:** Pump.fun bonding-curve entries and management of an open position. This is deliberately separate from coin selection/rug screening, which is the next research phase.

**Status:** Frozen research candidate; paper mode only. Historical results do not establish profitability. The repository remains a research/paper system, not a live trading deployment.

## 1. Entry trigger (strict baseline)

Evaluate only while the token is still on the Pump bonding curve and market data is fresh.

1. Prior 60-second impulse must be at least +20%, measured from the lowest price in that lookback.
2. Current price must have pulled back 10–40% from the recent 60-second high.
3. Price must reclaim the preceding 5-second high by at least 1%.
4. Across the latest 2 seconds, buy quote volume must be greater than 3 times sell quote volume.
5. At least 3 distinct buyer wallets must be present in that 2-second window.
6. Distinct seller count must be no more than half the buyer count.
7. Largest buyer share of buy quote volume must be no more than 72%.
8. Enter on the next completed 1-second close only if a fresh executable quote still passes slippage, impact, fee and exit-route checks.
9. Never average down. Never enter after migration. One position per mint. The paper engine defaults to one open position; concurrency can only be increased after portfolio-level risk testing.

If no setup qualifies, do nothing. Do not loosen filters to force trades.

## 2. Initial risk

- Hard stop is 5% below entry and is active immediately.
- Never widen the hard stop; no averaging down or martingale.
- A 5% price stop is not a 5% equity loss. Actual loss includes fees, price impact, slippage, transfer taxes, network fees, priority fees, tips and possible failed/partial exits.
- Size positions from a portfolio risk budget using executable stop loss plus all estimated costs. Skip if the minimum viable size cannot fit the budget.

## 3. Adaptive holding and profit protection

The selected candidate is a wide runner trail with progressive gross-profit floors:

- Do not activate profit protection until a **previous completed bar** has reached at least +10% favourable movement from entry.
- Thereafter maintain a wide trailing stop 40% below the previous completed high-water mark.
- Progressive minimum gross profit floors, based on the previous completed high-water mark:
  - Peak gain >= +10%: floor at +5% gross.
  - Peak gain >= +50%: floor at +15% gross.
  - Peak gain >= +100%: floor at +40% gross.
  - Peak gain >= +200%: floor at +80% gross.
- Effective stop is the highest of the initial hard stop, the wide trailing stop and the active profit floor. Stop levels may only ratchet upward.
- Maximum hold is 300 seconds as a safety ceiling, not a target. It must not force an early exit while the runner remains healthy.
- Exit before curve migration. Treat migration/curve completion as an emergency boundary; never carry a curve-only position into PumpSwap.
- Compute the required gross floor from the actual quote asset and live cost model. The +5% first floor is a historical candidate, not a guarantee of positive net PnL.
- Do not exit only because of one red candle or one large seller. The optional 8-second weakness rule remains disabled until separately validated out-of-sample.

## 4. Not adopted as universal rules

- Fixed 60-second liquidation.
- Fixed take-profit targets.
- Mandatory partial scale-outs (the tested 10% scale-outs reduced results in the small sample).
- Flow-only exits.
- Any assumption that every coin will make 2x, 3x or 5x.

## 5. Execution requirements

- Use previous completed bars/high-water marks to avoid look-ahead.
- Live execution must use executable quotes, actual token/quote decimals, dynamic fee/tax estimates, transaction confirmation, partial-fill handling, retries and migration detection. A historical bar close is not a guaranteed fill.
- On migration, submit an urgent curve exit before the curve closes; a post-migration state may already be too late to exit on the curve.
- Log every signal and rejection reason, peak, active stop/floor, actual requested and filled size, slippage, fees, priority fee, network cost, exit reason and migration state.
- Paper engine only. Do not enable live signing or mainnet order submission from this research result.

## 6. Six-coin evidence summary

| Coin | Strict entries | Adaptive-exit observation |
|---|---:|---|
| 1 | 1 | −8.30% modeled net; the entry never reached +10% MFE and hit the hard stop. |
| 2 | 0 | No strict trade. A separate exploratory Candidate B made +99.88% at the migration boundary with the wide trail; not a strict-rule result or verified fill. |
| 3 | 2 | +3.92% and +101.60% modeled net with the cost-aware runner candidate. |
| 4 | 0 | Strict rules gave no trade. Relaxed 0.5% pivot sensitivity gave +157.15%; exploratory only. |
| 5 | 5 | −9.21%, −9.79%, +0.34%, −9.21%, +159.65%; hard-stop losses remain an entry-quality problem. |
| 6 | 1 | The cost-aware floor produced +1.36% modeled net versus −8.41% without the floor. |

This is a small, selected historical sample. Coin 2 and Coin 4 exploratory results must not be counted as strict entries. Coin 6 has only one accepted entry. No return is guaranteed.

## 7. Next research phase: coin selection and rejection

This document does **not** decide which newly launched coins are safe enough to trade. Next, independently develop and test pre-entry vetoes for:
- creator/dev initial allocation, linked wallets and early sells;
- creator funding sources and coordinated wallet clusters;
- top-holder, insider and cluster concentration;
- mint/freeze authority and token-program risks;
- real bonding-curve reserves, liquidity deterioration and exit capacity;
- token transfer taxes, quote-asset identity and fee economics;
- failed transaction rates, suspicious volume, wash/round-trip activity and buyer quality;
- creator/whale distribution and rug-like liquidity/market behaviour.

Keep coin-selection rules separate from the entry trigger and adaptive exit rules. Test them on winners and losers, including tokens that fail or never migrate. Do not tune these selection rules on the same tokens used to score them.
