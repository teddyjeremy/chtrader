# Pump.fun entry and adaptive-exit rules — v1 baseline with v2 safety gates

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
9. Never average down. Never enter after migration. One position per mint. The paper engine has a maximum of 3 open positions; historical coin-by-coin replays use sequential positions.

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
- The current paper engine consumes price snapshots as point bars; its stop fill is a simulation, not a live order.
- Paper engine only. Do not enable live signing or mainnet order submission from this research result.

## 6. Six-coin evidence summary

| Coin | Strict entries | Adaptive-exit observation |
|---|---:|---|
| 1 | 1 | −8.30% modeled net; entry never reached +10% MFE and hit hard stop. |
| 2 | 0 | No strict trade. Separate exploratory Candidate B made +99.88% at migration boundary with wide trail; not a strict result or verified fill. |
| 3 | 2 | +3.92% and +101.60% modeled net with cost-aware runner candidate. |
| 4 | 0 | Strict rules gave no trade. Relaxed 0.5% pivot sensitivity gave +157.15%; exploratory only. |
| 5 | 5 | −9.21%, −9.79%, +0.34%, −9.21%, +159.65%; hard-stop losses remain an entry-quality problem. |
| 6 | 1 | Cost-aware floor produced +1.36% modeled net versus −8.41% without the floor. |

This is a small selected historical sample. Coin 2 and Coin 4 exploratory results must not be counted as strict entries. Coin 6 has only one accepted entry. No return is guaranteed.

## 7. Coin-selection evidence and remaining validation

The v2 implementation adds creator-sale, related-wallet concentration, token-tax and quote-asset safety gates. These checks remain separate from the price-action entry trigger and adaptive exit. The repository now includes a strategy snapshot pipeline and paper runtime coordinator. A concrete Helius/RPC adapter must still supply trustworthy raw swap events, creator/cluster attribution, holder balances, token tax metadata, quote-asset conversion and executable curve metrics. The pipeline deliberately marks incomplete evidence partial, causing WATCH. Continue testing:
- creator/dev initial allocation, linked wallets and early sells;
- creator funding sources and coordinated wallet clusters;
- top-holder, insider and cluster concentration;
- mint/freeze authority and token-program risks;
- real bonding-curve reserves, liquidity deterioration and exit capacity;
- token transfer taxes, quote-asset identity and fee economics;
- failed transaction rates, suspicious volume, wash/round-trip activity and buyer quality;
- creator/whale distribution and rug-like liquidity/market behaviour.

Keep coin-selection rules separate from the entry trigger and adaptive exit rules. Test them on winners and losers, including tokens that fail or never migrate. Do not tune these selection rules on the same tokens used to score them.


## 8. V2 pre-entry safety gates (implemented; provisional thresholds)

The entry evaluator now uses strategy version `pump-curve-entry-v2-persistent-risk-gated`. The v1 price trigger and adaptive exit remain, but a BUY also requires the following evidence. Missing or stale evidence produces WATCH; confirmed veto conditions produce REJECT.

### Creator and related-wallet distribution
- Reject if the identified creator sells more than 0.05% of total supply in the preceding 60 seconds.
- If the creator has cumulatively sold more than 25% of the recorded initial allocation since launch, quarantine the token rather than permanently blacklist it. Requalify only after a fresh impulse of at least 35%, a pivot reclaim of at least 8%, a confirmed higher low and all three persistent-flow windows passing. These requalification thresholds are provisional and must be tested out of sample.
- Require complete launch-to-now creator sale history and a verified initial allocation. If either is unavailable or incomplete, return WATCH; never treat missing lifecycle history as zero creator selling.
- Reject if confidently attributed creator-linked wallets sell more than 0.25% of supply in the preceding 60 seconds.
- Reject if a high-confidence related-wallet cluster sells more than 0.25% of supply in the preceding 60 seconds; low-confidence attribution produces WATCH.
- Reject if a high-confidence related-wallet cluster (confidence >= 0.70) accounts for more than 35% of buy volume over 30 seconds or currently holds more than 20% of supply.
- If cluster concentration is high but attribution confidence is below 0.70, WATCH for confirmation rather than automatically labeling wallets malicious.
- Same-slot activity alone is not sufficient proof of coordination.
- Creator identity, sell attribution and cluster evidence must be verified and no older than 15 seconds. Unknown attribution means WATCH.

### Persistent buying pressure
- Require three consecutive, completed 2-second rolling windows sampled 1 second apart (4 seconds of market history). This preserves the original 0–5 second launch-entry objective better than waiting for six non-overlapping seconds.
- Each window independently requires buy quote > 3x sell quote, at least 3 unique buyers, sellers <= half the buyers, and largest buyer <=72% of buy quote.
- Require at least 5 distinct buyer wallets across the three windows.
- Each rolling window must be sampled exactly 1 second after the previous window (within 250ms), and the flow evidence must be fresh. Missing, stale, malformed or failed windows mean WATCH.
- This is stricter than the original single 2-second trigger and will reduce trade frequency.

### Token taxes and quote-asset normalization
- Require verified buy and sell token transfer-tax estimates, plus quote-asset mint, symbol, decimals, transfer tax and a fresh SOL conversion rate.
- Reject if either token transfer-tax side exceeds 2%.
- Calculate effective round-trip cost multiplicatively from venue/impact costs, token buy tax, token sell tax and quote-asset transfer tax on both quote movements. Reject above 4%.
- The market-data producer must normalize `priceSol`, `liquiditySol`, quote volumes and paper notional into SOL using the verified quote conversion. `buildMarketSnapshot` now calls the rolling-window and creator-risk builders, derives the latest 2-second flow fields, normalizes quote-denominated prices/liquidity/10-second volumes to SOL, and creates token-economics evidence. A stable or other quote asset must not be assumed to equal USD or SOL. The producer still must provide verified raw inputs; the helper cannot prove the truth of caller-supplied attribution or oracle metadata.
- Tax metadata must reflect the active token program/extensions and current epoch where applicable. Unknown dynamic transfer fees mean WATCH, not a zero-tax assumption.

### Paper execution
- The paper engine re-evaluates all gates on the next completed entry bar; an earlier BUY signal cannot bypass a new creator sale, failed flow window, stale tax reading or changed quote conversion.
- Position sizing includes the modeled round-trip cost in addition to the hard-stop distance. Entry and exit cost estimates include transfer taxes.
- The new `PaperTradingRuntime` consumes market-frame inputs, builds the snapshot through `buildMarketSnapshot`, evaluates the entry, waits for the next completed one-second frame, and delegates adaptive exits to `PaperEngine`. It has no wallet or transaction-submission path. It will still remain in WATCH until a real Helius/RPC producer supplies complete, fresh, correctly attributed inputs.

### Calibration warning
These thresholds are explicit starting guardrails, not statistically validated optima. Validate creator-linked wallet attribution to avoid false positives; evaluate the rules on winners and losers across many tokens before changing thresholds. Never infer creator control from a shared slot alone.


## 9. Integrated paper runtime boundary

- `buildMarketSnapshot` is the single adapter boundary for strategy-ready snapshots. It rejects malformed raw swap evidence, requires fresh quote conversion and tax metadata, and derives creator-risk and persistent-flow assessments.
- Quote-denominated price, liquidity and 10-second buy/sell volumes are converted to SOL only with verified quote metadata. Two-second flow ratios remain in quote units, where buy and sell are directly comparable.
- `PaperTradingRuntime` coordinates snapshot construction, entry evaluation, one-second delayed entry confirmation, and adaptive paper exits.
- The GitHub Actions validation workflow runs the new snapshot-pipeline and paper-runtime tests alongside the existing strategy tests.
- **Still not connected:** a production Helius WebSocket/RPC subscription, Pump bonding-curve account decoder, authoritative creator/related-wallet attribution, holder-balance fetcher, token-2022 transfer-fee decoder, quote oracle, executable curve quote/impact model, or transaction confirmation layer. Do not mark feed evidence verified until those sources are implemented and independently checked.
- The paper runtime is not a live bot and must not be connected to signing or order submission without a separate audited execution implementation.
